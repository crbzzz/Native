/*
  # Agent Lab: add runs

  Adds multi-run support per project:
  - agent_lab_runs: run state (next_turn, title)
  - agent_lab_projects.active_run_id: currently selected run
  - agent_lab_messages.run_id / agent_lab_edges.run_id: associate data to a run

  Backfill:
  - Creates a default run ("Run 1") per existing project using the same UUID as the project id.
  - Sets run_id on existing messages/edges to that default run.
*/

CREATE TABLE IF NOT EXISTS agent_lab_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES agent_lab_projects(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Run',
  pinned_instruction text,
  next_turn integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Backward compatible (if the table already existed before this migration changed).
ALTER TABLE agent_lab_runs
  ADD COLUMN IF NOT EXISTS pinned_instruction text;

CREATE INDEX IF NOT EXISTS idx_agent_lab_runs_project_id ON agent_lab_runs(project_id);

ALTER TABLE agent_lab_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own agent lab runs" ON agent_lab_runs;
CREATE POLICY "Users can view own agent lab runs"
  ON agent_lab_runs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM agent_lab_projects p
      WHERE p.id = agent_lab_runs.project_id
        AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can create own agent lab runs" ON agent_lab_runs;
CREATE POLICY "Users can create own agent lab runs"
  ON agent_lab_runs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM agent_lab_projects p
      WHERE p.id = agent_lab_runs.project_id
        AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update own agent lab runs" ON agent_lab_runs;
CREATE POLICY "Users can update own agent lab runs"
  ON agent_lab_runs FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM agent_lab_projects p
      WHERE p.id = agent_lab_runs.project_id
        AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM agent_lab_projects p
      WHERE p.id = agent_lab_runs.project_id
        AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete own agent lab runs" ON agent_lab_runs;
CREATE POLICY "Users can delete own agent lab runs"
  ON agent_lab_runs FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM agent_lab_projects p
      WHERE p.id = agent_lab_runs.project_id
        AND p.user_id = auth.uid()
    )
  );


ALTER TABLE agent_lab_projects
  ADD COLUMN IF NOT EXISTS active_run_id uuid;

-- Backfill: create a default run per project using the project id as run id.
INSERT INTO agent_lab_runs (id, project_id, title, next_turn, created_at, updated_at)
SELECT
  p.id,
  p.id,
  'Run 1',
  COALESCE(p.next_turn, 0),
  COALESCE(p.created_at, now()),
  COALESCE(p.updated_at, now())
FROM agent_lab_projects p
ON CONFLICT (id) DO NOTHING;

-- Backfill active run.
UPDATE agent_lab_projects
SET active_run_id = id
WHERE active_run_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agent_lab_projects_active_run_id_fkey'
  ) THEN
    ALTER TABLE agent_lab_projects
      ADD CONSTRAINT agent_lab_projects_active_run_id_fkey
      FOREIGN KEY (active_run_id) REFERENCES agent_lab_runs(id) ON DELETE SET NULL;
  END IF;
END $$;


ALTER TABLE agent_lab_messages
  ADD COLUMN IF NOT EXISTS run_id uuid;

UPDATE agent_lab_messages
SET run_id = project_id
WHERE run_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agent_lab_messages_run_id_fkey'
  ) THEN
    ALTER TABLE agent_lab_messages
      ADD CONSTRAINT agent_lab_messages_run_id_fkey
      FOREIGN KEY (run_id) REFERENCES agent_lab_runs(id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE agent_lab_messages
  ALTER COLUMN run_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_lab_messages_run_turn ON agent_lab_messages(run_id, turn_index);


ALTER TABLE agent_lab_edges
  ADD COLUMN IF NOT EXISTS run_id uuid;

UPDATE agent_lab_edges
SET run_id = project_id
WHERE run_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agent_lab_edges_run_id_fkey'
  ) THEN
    ALTER TABLE agent_lab_edges
      ADD CONSTRAINT agent_lab_edges_run_id_fkey
      FOREIGN KEY (run_id) REFERENCES agent_lab_runs(id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE agent_lab_edges
  ALTER COLUMN run_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_lab_edges_run_turn ON agent_lab_edges(run_id, turn_index);


-- Ensure each run's cursor is consistent with messages.
UPDATE agent_lab_runs r
SET next_turn = GREATEST(
  r.next_turn,
  COALESCE(
    (SELECT MAX(m.turn_index) + 1 FROM agent_lab_messages m WHERE m.run_id = r.id),
    0
  )
);
