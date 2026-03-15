/*
  # Create Agent Lab tables

  Stores a single "run" per project:
  - agent_lab_projects: configuration + next turn cursor
  - agent_lab_messages: generated turns
  - agent_lab_edges: relationship graph snapshots per turn

  Security:
  - RLS enabled; authenticated users can read/write their own projects.
*/

CREATE TABLE IF NOT EXISTS agent_lab_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  topic text NOT NULL DEFAULT '',
  agents jsonb NOT NULL DEFAULT '[]'::jsonb,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  suggestions jsonb NOT NULL DEFAULT '[]'::jsonb,
  next_turn integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_lab_projects_user_id ON agent_lab_projects(user_id);

ALTER TABLE agent_lab_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own agent lab projects" ON agent_lab_projects;
CREATE POLICY "Users can view own agent lab projects"
  ON agent_lab_projects FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own agent lab projects" ON agent_lab_projects;
CREATE POLICY "Users can create own agent lab projects"
  ON agent_lab_projects FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own agent lab projects" ON agent_lab_projects;
CREATE POLICY "Users can update own agent lab projects"
  ON agent_lab_projects FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own agent lab projects" ON agent_lab_projects;
CREATE POLICY "Users can delete own agent lab projects"
  ON agent_lab_projects FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);


CREATE TABLE IF NOT EXISTS agent_lab_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES agent_lab_projects(id) ON DELETE CASCADE,
  turn_index integer NOT NULL,
  speaker_id text NOT NULL,
  speaker_name text NOT NULL,
  content text NOT NULL,
  steering_prompt text,
  tokens integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_lab_messages_project_turn ON agent_lab_messages(project_id, turn_index);

ALTER TABLE agent_lab_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own agent lab messages" ON agent_lab_messages;
CREATE POLICY "Users can view own agent lab messages"
  ON agent_lab_messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM agent_lab_projects p
      WHERE p.id = agent_lab_messages.project_id
        AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert own agent lab messages" ON agent_lab_messages;
CREATE POLICY "Users can insert own agent lab messages"
  ON agent_lab_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM agent_lab_projects p
      WHERE p.id = agent_lab_messages.project_id
        AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete own agent lab messages" ON agent_lab_messages;
CREATE POLICY "Users can delete own agent lab messages"
  ON agent_lab_messages FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM agent_lab_projects p
      WHERE p.id = agent_lab_messages.project_id
        AND p.user_id = auth.uid()
    )
  );


CREATE TABLE IF NOT EXISTS agent_lab_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES agent_lab_projects(id) ON DELETE CASCADE,
  turn_index integer NOT NULL,
  source_id text NOT NULL,
  target_id text NOT NULL,
  weight integer NOT NULL,
  label text,
  rationale text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_lab_edges_project_turn ON agent_lab_edges(project_id, turn_index);

ALTER TABLE agent_lab_edges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own agent lab edges" ON agent_lab_edges;
CREATE POLICY "Users can view own agent lab edges"
  ON agent_lab_edges FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM agent_lab_projects p
      WHERE p.id = agent_lab_edges.project_id
        AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert own agent lab edges" ON agent_lab_edges;
CREATE POLICY "Users can insert own agent lab edges"
  ON agent_lab_edges FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM agent_lab_projects p
      WHERE p.id = agent_lab_edges.project_id
        AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete own agent lab edges" ON agent_lab_edges;
CREATE POLICY "Users can delete own agent lab edges"
  ON agent_lab_edges FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM agent_lab_projects p
      WHERE p.id = agent_lab_edges.project_id
        AND p.user_id = auth.uid()
    )
  );
