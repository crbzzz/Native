import { ArrowLeft, Plus, RefreshCw, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import Header from '../components/Header';
import { NativeSelect } from '../components/NativeSelect';
import {
  agentLabStep,
  createAgentLabProject,
  getAgentLabProject,
  getAgentLabSuggestions,
  listAgentLabProjects,
  type AgentLabAgent,
  type AgentLabEdge,
  type AgentLabMessage,
  type AgentLabProject,
} from '../lib/agentLab';

type TabKey = 'setup' | 'discussion' | 'relations';

type ProjectListItem = {
  id: string;
  title?: string;
  topic?: string;
  next_turn?: number;
  created_at?: string;
  updated_at?: string;
};

function uuid(): string {
  // crypto.randomUUID is supported in modern browsers
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // ignore
  }
  return `a_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function clampInt(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.round(v)));
}

function turnOptions(): Array<{ id: number; label: string }> {
  return [2, 3, 4, 5, 6, 8].map((n) => ({ id: n, label: `${n} agents` }));
}

function extractTurns(edges: AgentLabEdge[]): number[] {
  const set = new Set<number>();
  for (const e of edges) set.add(e.turn_index);
  return Array.from(set).sort((a, b) => a - b);
}

function edgesAtTurn(edges: AgentLabEdge[], turn: number): AgentLabEdge[] {
  return edges.filter((e) => e.turn_index === turn);
}

function weightLabel(w: number): string {
  if (w <= -2) return '−−';
  if (w === -1) return '−';
  if (w === 1) return '+';
  if (w >= 2) return '++';
  return '0';
}

export default function AgentLab({ onBack }: { onBack: () => void }) {
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [projectsError, setProjectsError] = useState<string | null>(null);

  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeProject, setActiveProject] = useState<AgentLabProject | null>(null);
  const [messages, setMessages] = useState<AgentLabMessage[]>([]);
  const [edges, setEdges] = useState<AgentLabEdge[]>([]);
  const [projectError, setProjectError] = useState<string | null>(null);

  const [tab, setTab] = useState<TabKey>('setup');

  // Create form
  const [title, setTitle] = useState('Agent Lab Project');
  const [topic, setTopic] = useState('');
  const [agentCount, setAgentCount] = useState(4);
  const [agents, setAgents] = useState<AgentLabAgent[]>(() => {
    const initial = 4;
    return Array.from({ length: initial }).map((_, i) => ({
      id: uuid(),
      name: `Agent ${i + 1}`,
      persona: '',
    }));
  });

  const [creating, setCreating] = useState(false);

  // Discussion
  const [steeringPrompt, setSteeringPrompt] = useState('');
  const [stepping, setStepping] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<Array<{ title?: string; prompt?: string }>>([]);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);

  const turns = useMemo(() => extractTurns(edges), [edges]);
  const latestTurn = turns.length ? turns[turns.length - 1] : 0;
  const [selectedTurn, setSelectedTurn] = useState(0);

  useEffect(() => {
    setSelectedTurn(latestTurn);
  }, [latestTurn]);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setProjectsError(null);
      try {
        const list = await listAgentLabProjects();
        setProjects(list as ProjectListItem[]);
      } catch (e) {
        setProjects([]);
        setProjectsError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, []);

  useEffect(() => {
    if (!activeProjectId) {
      setActiveProject(null);
      setMessages([]);
      setEdges([]);
      setProjectError(null);
      return;
    }

    const run = async () => {
      setProjectError(null);
      try {
        const data = await getAgentLabProject(activeProjectId);
        setActiveProject(data.project);
        setMessages(data.messages ?? []);
        setEdges(data.edges ?? []);
        setSuggestions(Array.isArray(data.project?.suggestions) ? data.project.suggestions ?? [] : []);
      } catch (e) {
        setActiveProject(null);
        setMessages([]);
        setEdges([]);
        setProjectError(e instanceof Error ? e.message : String(e));
      }
    };

    void run();
  }, [activeProjectId]);

  useEffect(() => {
    // Keep agent array sized to agentCount
    setAgents((prev) => {
      const n = clampInt(agentCount, 2, 8);
      const next = [...prev];
      while (next.length < n) {
        next.push({ id: uuid(), name: `Agent ${next.length + 1}`, persona: '' });
      }
      while (next.length > n) next.pop();
      return next;
    });
  }, [agentCount]);

  const canCreate = useMemo(() => {
    if (!topic.trim()) return false;
    if (agents.length < 2) return false;
    for (const a of agents) {
      if (!a.name.trim()) return false;
    }
    return true;
  }, [agents, topic]);

  const handleCreate = async () => {
    if (!canCreate || creating) return;

    setCreating(true);
    setProjectError(null);
    try {
      const res = await createAgentLabProject({
        title: title.trim() || 'Agent Lab',
        topic: topic.trim(),
        agents: agents.map((a) => ({ id: a.id, name: a.name.trim(), persona: a.persona })),
      });
      const pid = res.project?.id;
      if (pid) {
        setActiveProjectId(pid);
        setTab('discussion');
        // Refresh list
        try {
          const list = await listAgentLabProjects();
          setProjects(list as ProjectListItem[]);
        } catch {
          // ignore
        }
      }
    } catch (e) {
      setProjectError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  const handleStep = async () => {
    if (!activeProjectId || stepping) return;
    setStepping(true);
    setProjectError(null);
    try {
      const res = await agentLabStep(activeProjectId, steeringPrompt.trim());
      const msg = res.message;
      if (msg) setMessages((prev) => [...prev, msg]);
      if (Array.isArray(res.edges) && res.edges.length) setEdges((prev) => [...prev, ...res.edges]);
      setActiveProject((prev) => {
        if (!prev) return prev;
        const nextTurn = (prev.next_turn ?? 0) + 1;
        return { ...prev, next_turn: nextTurn };
      });
      setSteeringPrompt('');
      setTab('discussion');
    } catch (e) {
      setProjectError(e instanceof Error ? e.message : String(e));
    } finally {
      setStepping(false);
    }
  };

  const handleSuggestions = async () => {
    if (!activeProjectId || suggesting) return;
    setSuggesting(true);
    setSuggestionsError(null);
    try {
      const res = await getAgentLabSuggestions(activeProjectId);
      const s = Array.isArray(res.suggestions) ? res.suggestions : [];
      setSuggestions(s);
    } catch (e) {
      setSuggestionsError(e instanceof Error ? e.message : String(e));
    } finally {
      setSuggesting(false);
    }
  };

  const activeEdges = useMemo(() => edgesAtTurn(edges, selectedTurn), [edges, selectedTurn]);

  return (
    <div className="min-h-screen bg-transparent native-page-in relative">
      {/* soft aurora overlay for this page */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 -left-24 w-[520px] h-[520px] rounded-full bg-gradient-to-br from-sky-500/20 via-indigo-500/10 to-fuchsia-500/20 blur-3xl" />
        <div className="absolute -bottom-28 -right-28 w-[560px] h-[560px] rounded-full bg-gradient-to-br from-fuchsia-500/16 via-sky-500/10 to-emerald-500/10 blur-3xl" />
      </div>

      <div className="fixed top-0 left-0 right-0 h-16 bg-white/10 dark:bg-slate-950/15 border-b border-white/25 dark:border-white/10 backdrop-blur-md flex items-center px-4 sm:px-6 z-40">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-gray-700 hover:text-gray-900 dark:text-white/70 dark:hover:text-white transition-colors"
        >
          <ArrowLeft size={20} />
          <span>Back</span>
        </button>

        <div className="ml-4">
          <h1 className="text-sm sm:text-base font-semibold">
            <span className="bg-gradient-to-r from-sky-500 via-indigo-500 to-fuchsia-500 bg-clip-text text-transparent native-animated-gradient">
              Agent Lab
            </span>
          </h1>
          <p className="text-[11px] sm:text-xs text-gray-600 dark:text-white/60">Multi-agent experiments — soft steering, evolving relations</p>
        </div>

        <div className="ml-auto">
          <Header placement="inline" />
        </div>
      </div>

      <div className="pt-20 px-5 sm:px-8 pb-10 relative">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
            {/* Left: projects + create */}
            <div className="space-y-4">
              <div className="relative overflow-hidden rounded-3xl border border-white/45 dark:border-white/12 bg-white/30 dark:bg-white/10 backdrop-blur-md">
                <div className="pointer-events-none absolute inset-0">
                  <div className="absolute -inset-24 bg-gradient-to-br from-sky-500/10 via-indigo-500/5 to-fuchsia-500/10 blur-2xl" />
                  <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-sky-500 via-indigo-500 to-fuchsia-500 opacity-70" />
                </div>
                <div className="relative p-5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Projects</h2>
                    <button
                      type="button"
                      className="w-9 h-9 rounded-2xl border border-white/40 dark:border-white/15 bg-white/20 dark:bg-white/10 hover:bg-white/30 dark:hover:bg-white/15 transition-colors flex items-center justify-center"
                      onClick={async () => {
                        setProjectsError(null);
                        try {
                          const list = await listAgentLabProjects();
                          setProjects(list);
                        } catch (e) {
                          setProjectsError(e instanceof Error ? e.message : String(e));
                        }
                      }}
                      title="Refresh"
                    >
                      <RefreshCw size={16} className="text-gray-800 dark:text-white/80" />
                    </button>
                  </div>

                  {projectsError && (
                    <p className="mt-2 text-xs text-red-600 dark:text-red-400">{projectsError}</p>
                  )}

                  <div className="mt-3 space-y-2">
                    {loading ? (
                      <p className="text-xs text-gray-600 dark:text-white/60">Loading...</p>
                    ) : projects.length ? (
                      projects.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setActiveProjectId(p.id);
                            setTab('discussion');
                          }}
                          className={
                            'group w-full text-left px-4 py-3 rounded-2xl border transition-all ' +
                            (activeProjectId === p.id
                              ? 'border-white/60 dark:border-white/20 bg-white/45 dark:bg-white/12'
                              : 'border-white/40 dark:border-white/12 bg-white/20 dark:bg-white/10 hover:bg-white/30 dark:hover:bg-white/12 hover:-translate-y-[1px]')
                          }
                        >
                          <p className="text-sm font-medium text-gray-900 dark:text-white line-clamp-1">{p.title || 'Agent Lab'}</p>
                          <p className="mt-0.5 text-xs text-gray-600 dark:text-white/60 line-clamp-1">{p.topic || 'No topic'}</p>
                          <div className="mt-1 flex items-center justify-between">
                            <p className="text-[11px] text-gray-500 dark:text-white/45">Turn: {p.next_turn ?? 0}</p>
                            <span className="text-[11px] text-gray-700/70 dark:text-white/45 group-hover:text-gray-900 dark:group-hover:text-white/70 transition-colors">Open →</span>
                          </div>
                        </button>
                      ))
                    ) : (
                      <p className="text-xs text-gray-600 dark:text-white/60">No projects yet.</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="relative overflow-hidden rounded-3xl border border-white/45 dark:border-white/12 bg-white/30 dark:bg-white/10 backdrop-blur-md">
                <div className="pointer-events-none absolute inset-0">
                  <div className="absolute -inset-24 bg-gradient-to-br from-fuchsia-500/10 via-indigo-500/5 to-sky-500/10 blur-2xl" />
                  <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-fuchsia-500 via-indigo-500 to-sky-500 opacity-60" />
                </div>
                <div className="relative p-5">
                  <div className="flex items-center gap-2">
                    <Plus size={16} className="text-gray-800 dark:text-white/80" />
                    <h2 className="text-sm font-semibold text-gray-900 dark:text-white">New project</h2>
                  </div>

                <div className="mt-3 space-y-3">
                  <div>
                    <label className="text-xs text-gray-700 dark:text-white/70">Title</label>
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="mt-1 w-full px-3 py-2 rounded-2xl border border-white/45 dark:border-white/15 bg-white/20 dark:bg-white/10 outline-none text-sm text-gray-900 dark:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/30"
                      placeholder="My experiment"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-gray-700 dark:text-white/70">Topic</label>
                    <textarea
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      className="mt-1 w-full px-3 py-2 rounded-2xl border border-white/45 dark:border-white/15 bg-white/20 dark:bg-white/10 outline-none text-sm text-gray-900 dark:text-white min-h-[74px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/25"
                      placeholder="What should they discuss?"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-gray-700 dark:text-white/70">Agents</label>
                    <NativeSelect
                      className="mt-1"
                      value={String(agentCount)}
                      onChange={(v) => setAgentCount(Number(v))}
                      options={turnOptions().map((o) => ({ value: String(o.id), label: o.label }))}
                      buttonClassName="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-2xl border border-white/45 dark:border-white/15 bg-white/20 dark:bg-white/10 text-sm text-gray-900 dark:text-white outline-none backdrop-blur-md backdrop-saturate-150 hover:bg-white/30 dark:hover:bg-white/15 transition-colors focus-visible:ring-2 focus-visible:ring-fuchsia-500/25"
                    />
                  </div>

                  <div className="space-y-2">
                    {agents.map((a, idx) => (
                      <div key={a.id} className="rounded-2xl border border-white/40 dark:border-white/12 bg-white/15 dark:bg-white/5 p-3">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-gray-500 dark:text-white/50">#{idx + 1}</span>
                          <input
                            value={a.name}
                            onChange={(e) => {
                              const v = e.target.value;
                              setAgents((prev) => prev.map((x) => (x.id === a.id ? { ...x, name: v } : x)));
                            }}
                            className="flex-1 px-2 py-1 rounded-xl border border-white/45 dark:border-white/15 bg-white/20 dark:bg-white/10 outline-none text-sm text-gray-900 dark:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/25"
                            placeholder={`Agent ${idx + 1}`}
                          />
                        </div>
                        <textarea
                          value={a.persona}
                          onChange={(e) => {
                            const v = e.target.value;
                            setAgents((prev) => prev.map((x) => (x.id === a.id ? { ...x, persona: v } : x)));
                          }}
                          className="mt-2 w-full px-2.5 py-2 rounded-2xl border border-white/45 dark:border-white/15 bg-white/20 dark:bg-white/10 outline-none text-sm text-gray-900 dark:text-white min-h-[70px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/20"
                          placeholder="Personality / constraints / goals (optional)"
                        />
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    disabled={!canCreate || creating}
                    onClick={handleCreate}
                    className={
                      'w-full px-4 py-3 rounded-2xl text-sm font-semibold transition-all ' +
                      (!canCreate || creating
                        ? 'bg-black/10 dark:bg-white/10 text-gray-600 dark:text-white/50 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-700 text-white hover:-translate-y-[1px]')
                    }
                  >
                    {creating ? 'Creating...' : 'Create project'}
                  </button>

                  {projectError && (
                    <p className="text-xs text-red-600 dark:text-red-400">{projectError}</p>
                  )}
                </div>
              </div>
            </div>

            </div>

            {/* Right: project view */}
            <div className="relative overflow-hidden rounded-3xl border border-white/45 dark:border-white/12 bg-white/30 dark:bg-white/10 backdrop-blur-md">
              <div className="pointer-events-none absolute inset-0">
                <div className="absolute -inset-28 bg-gradient-to-br from-sky-500/10 via-indigo-500/6 to-fuchsia-500/10 blur-2xl" />
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-sky-500 via-indigo-500 to-fuchsia-500 opacity-60" />
              </div>
              <div className="relative p-5">
              {!activeProject ? (
                <div className="text-sm text-gray-700 dark:text-white/70">
                  <p>Select a project to start.</p>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{activeProject.title}</h2>
                      <p className="mt-1 text-sm text-gray-700 dark:text-white/70">{activeProject.topic}</p>
                    </div>
                    <div className="flex items-center gap-1.5 rounded-full border border-white/35 dark:border-white/12 bg-white/20 dark:bg-white/10 p-1">
                      <button
                        type="button"
                        onClick={() => setTab('setup')}
                        className={
                          'px-3 py-1.5 rounded-full text-xs border transition-colors ' +
                          (tab === 'setup'
                            ? 'border-white/60 dark:border-white/20 bg-white/45 dark:bg-white/12 text-gray-900 dark:text-white'
                            : 'border-transparent bg-transparent text-gray-700 dark:text-white/70 hover:bg-white/25 dark:hover:bg-white/10')
                        }
                      >
                        Setup
                      </button>
                      <button
                        type="button"
                        onClick={() => setTab('discussion')}
                        className={
                          'px-3 py-1.5 rounded-full text-xs border transition-colors ' +
                          (tab === 'discussion'
                            ? 'border-white/60 dark:border-white/20 bg-white/45 dark:bg-white/12 text-gray-900 dark:text-white'
                            : 'border-transparent bg-transparent text-gray-700 dark:text-white/70 hover:bg-white/25 dark:hover:bg-white/10')
                        }
                      >
                        Discussion
                      </button>
                      <button
                        type="button"
                        onClick={() => setTab('relations')}
                        className={
                          'px-3 py-1.5 rounded-full text-xs border transition-colors ' +
                          (tab === 'relations'
                            ? 'border-white/60 dark:border-white/20 bg-white/45 dark:bg-white/12 text-gray-900 dark:text-white'
                            : 'border-transparent bg-transparent text-gray-700 dark:text-white/70 hover:bg-white/25 dark:hover:bg-white/10')
                        }
                      >
                        Relations
                      </button>
                    </div>
                  </div>

                  <div className="mt-5">
                    {tab === 'setup' && (
                      <div className="space-y-4">
                        <div className="rounded-2xl border border-white/40 dark:border-white/12 bg-white/15 dark:bg-white/5 p-4">
                          <p className="text-sm font-medium text-gray-900 dark:text-white">Agents</p>
                          <p className="mt-1 text-xs text-gray-600 dark:text-white/60">Saved in the project. To change agents, create a new project (MVP).</p>
                          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                            {(activeProject.agents ?? []).map((a) => (
                              <div key={a.id} className="rounded-2xl border border-white/40 dark:border-white/12 bg-white/25 dark:bg-white/10 p-3">
                                <p className="text-sm font-semibold text-gray-900 dark:text-white">{a.name}</p>
                                {a.persona?.trim() ? (
                                  <p className="mt-1 text-xs text-gray-700 dark:text-white/70 whitespace-pre-wrap">{a.persona}</p>
                                ) : (
                                  <p className="mt-1 text-xs text-gray-500 dark:text-white/45">(no persona)</p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-white/40 dark:border-white/12 bg-white/15 dark:bg-white/5 p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-gray-900 dark:text-white">Simulation prompts</p>
                              <p className="mt-1 text-xs text-gray-600 dark:text-white/60">Let the model propose good steering prompts for your experiment.</p>
                            </div>
                            <button
                              type="button"
                              onClick={handleSuggestions}
                              disabled={suggesting}
                              className={
                                'px-3 py-2 rounded-2xl border text-sm transition-colors flex items-center gap-2 ' +
                                (suggesting
                                  ? 'border-white/40 dark:border-white/12 bg-white/15 dark:bg-white/5 text-gray-600 dark:text-white/50 cursor-not-allowed'
                                  : 'border-white/45 dark:border-white/15 bg-white/25 dark:bg-white/10 hover:bg-white/35 dark:hover:bg-white/15 text-gray-900 dark:text-white')
                              }
                            >
                              <Sparkles size={16} />
                              {suggesting ? 'Generating...' : 'Generate'}
                            </button>
                          </div>

                          {suggestionsError && (
                            <p className="mt-2 text-xs text-red-600 dark:text-red-400">{suggestionsError}</p>
                          )}

                          <div className="mt-3 space-y-2">
                            {suggestions.length ? (
                              suggestions.map((s, i) => (
                                <button
                                  type="button"
                                  key={i}
                                  onClick={() => {
                                    const p = (s.prompt || '').trim();
                                    if (!p) return;
                                    setTab('discussion');
                                    setSteeringPrompt(p);
                                  }}
                                  className="w-full text-left px-4 py-3 rounded-2xl border border-white/40 dark:border-white/12 bg-white/25 dark:bg-white/10 hover:bg-white/35 dark:hover:bg-white/12 transition-colors"
                                >
                                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{s.title || `Suggestion ${i + 1}`}</p>
                                  <p className="mt-1 text-xs text-gray-700 dark:text-white/70 whitespace-pre-wrap">{s.prompt}</p>
                                  <p className="mt-1 text-[11px] text-gray-500 dark:text-white/45">Click to use as steering prompt</p>
                                </button>
                              ))
                            ) : (
                              <p className="text-xs text-gray-600 dark:text-white/60">No suggestions yet.</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {tab === 'discussion' && (
                      <div className="space-y-4">
                        <div className="rounded-2xl border border-white/40 dark:border-white/12 bg-white/15 dark:bg-white/5 p-4">
                          <p className="text-sm font-medium text-gray-900 dark:text-white">Steer the next turn</p>
                          <p className="mt-1 text-xs text-gray-600 dark:text-white/60">Add guidance; click “Next turn” to generate the next agent message.</p>

                          <textarea
                            value={steeringPrompt}
                            onChange={(e) => setSteeringPrompt(e.target.value)}
                            className="mt-3 w-full px-3 py-2 rounded-2xl border border-white/45 dark:border-white/15 bg-white/20 dark:bg-white/10 outline-none text-sm text-gray-900 dark:text-white min-h-[84px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/25"
                            placeholder="Optional guidance (e.g. 'Focus on edge cases', 'Argue against the current consensus', 'Propose a decision')"
                          />

                          <div className="mt-3 flex items-center justify-between">
                            <p className="text-xs text-gray-600 dark:text-white/60">
                              Next turn: {activeProject.next_turn ?? 0}
                            </p>
                            <button
                              type="button"
                              onClick={handleStep}
                              disabled={stepping}
                              className={
                                'px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all ' +
                                (stepping
                                  ? 'bg-black/10 dark:bg-white/10 text-gray-600 dark:text-white/50 cursor-not-allowed'
                                  : 'bg-blue-600 hover:bg-blue-700 text-white hover:-translate-y-[1px]')
                              }
                            >
                              {stepping ? 'Thinking...' : 'Next turn'}
                            </button>
                          </div>
                        </div>

                        <div className="rounded-2xl border border-white/40 dark:border-white/12 bg-white/15 dark:bg-white/5 p-4">
                          <p className="text-sm font-medium text-gray-900 dark:text-white">Transcript</p>
                          <div className="mt-3 space-y-3">
                            {messages.length ? (
                              messages.map((m) => (
                                <div key={m.id} className="rounded-2xl border border-white/40 dark:border-white/12 bg-white/20 dark:bg-white/10 p-3 native-message-in">
                                  <div className="flex items-center justify-between">
                                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{m.speaker_name}</p>
                                    <p className="text-[11px] text-gray-500 dark:text-white/45">Turn {m.turn_index}</p>
                                  </div>
                                  <p className="mt-2 text-sm text-gray-800 dark:text-white/80 whitespace-pre-wrap">{m.content}</p>
                                </div>
                              ))
                            ) : (
                              <p className="text-xs text-gray-600 dark:text-white/60">No messages yet. Generate the first turn.</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {tab === 'relations' && (
                      <div className="space-y-4">
                        <div className="rounded-2xl border border-white/40 dark:border-white/12 bg-white/15 dark:bg-white/5 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium text-gray-900 dark:text-white">Graph</p>
                              <p className="mt-1 text-xs text-gray-600 dark:text-white/60">Relations snapshot per turn (weight −2..+2).</p>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-700 dark:text-white/70">Turn</span>
                              <input
                                type="range"
                                min={0}
                                max={Math.max(0, latestTurn)}
                                value={selectedTurn}
                                onChange={(e) => setSelectedTurn(Number(e.target.value))}
                                className="w-40"
                              />
                              <span className="text-xs text-gray-700 dark:text-white/70 w-8 text-right">{selectedTurn}</span>
                            </div>
                          </div>

                          <div className="mt-4">
                            <AgentGraphSvg agents={activeProject.agents ?? []} edges={activeEdges} />
                          </div>
                        </div>

                        <div className="rounded-2xl border border-white/40 dark:border-white/12 bg-white/15 dark:bg-white/5 p-4">
                          <p className="text-sm font-medium text-gray-900 dark:text-white">Edges</p>
                          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                            {activeEdges.length ? (
                              activeEdges
                                .filter((e) => e.source_id && e.target_id)
                                .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
                                .map((e) => (
                                  <div key={e.id} className="rounded-2xl border border-white/40 dark:border-white/12 bg-white/20 dark:bg-white/10 p-3">
                                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                                      {agentName(activeProject.agents ?? [], e.source_id)} ↔ {agentName(activeProject.agents ?? [], e.target_id)}
                                      <span className="ml-2 text-xs text-gray-600 dark:text-white/60">{weightLabel(e.weight)} ({e.weight})</span>
                                    </p>
                                    {(e.label || e.rationale) && (
                                      <p className="mt-1 text-xs text-gray-700 dark:text-white/70 whitespace-pre-wrap">
                                        {(e.label || '').trim() ? `${e.label}` : ''}
                                        {(e.rationale || '').trim() ? `${(e.label || '').trim() ? ' — ' : ''}${e.rationale}` : ''}
                                      </p>
                                    )}
                                  </div>
                                ))
                            ) : (
                              <p className="text-xs text-gray-600 dark:text-white/60">No relations yet. Generate turns first.</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function agentName(agents: AgentLabAgent[], id: string): string {
  return agents.find((a) => a.id === id)?.name || id;
}

function AgentGraphSvg({ agents, edges }: { agents: AgentLabAgent[]; edges: AgentLabEdge[] }) {
  const w = 640;
  const h = 380;
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) * 0.34;

  const positions = useMemo(() => {
    const n = Math.max(1, agents.length);
    const map: Record<string, { x: number; y: number; a: number }> = {};
    for (let i = 0; i < agents.length; i++) {
      const ang = (Math.PI * 2 * i) / n - Math.PI / 2;
      map[agents[i].id] = {
        x: cx + Math.cos(ang) * r,
        y: cy + Math.sin(ang) * r,
        a: ang,
      };
    }
    return map;
  }, [agents, cx, cy, r]);

  const visibleEdges = useMemo(() => {
    const set = new Set<string>();
    const out: AgentLabEdge[] = [];
    for (const e of edges) {
      if (!e.source_id || !e.target_id) continue;
      const a = e.source_id < e.target_id ? e.source_id : e.target_id;
      const b = e.source_id < e.target_id ? e.target_id : e.source_id;
      const key = `${a}__${b}`;
      if (set.has(key)) continue;
      set.add(key);
      out.push(e);
    }
    return out;
  }, [edges]);

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full max-w-[820px] h-auto">
        <defs>
          <radialGradient id="nativeAgentLabBg" cx="35%" cy="20%" r="80%">
            <stop offset="0%" stopColor="white" stopOpacity="0.28" />
            <stop offset="55%" stopColor="white" stopOpacity="0.10" />
            <stop offset="100%" stopColor="white" stopOpacity="0.06" />
          </radialGradient>
          <filter id="nativeAgentLabGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect x={0} y={0} width={w} height={h} rx={24} fill="url(#nativeAgentLabBg)" className="dark:opacity-60" />
        <rect x={0} y={0} width={w} height={h} rx={24} className="fill-white/10 dark:fill-black/10" />

        {/* edges */}
        {visibleEdges.map((e) => {
          const p1 = positions[e.source_id];
          const p2 = positions[e.target_id];
          if (!p1 || !p2) return null;
          const abs = Math.abs(e.weight || 0);
          const strokeW = 1 + abs * 1.4;
          const opacity = 0.18 + abs * 0.18;
          const dash = e.weight < 0 ? '6 6' : undefined;
          return (
            <line
              key={e.id}
              x1={p1.x}
              y1={p1.y}
              x2={p2.x}
              y2={p2.y}
              strokeWidth={strokeW}
              strokeDasharray={dash}
              className="stroke-gray-900/70 dark:stroke-white/70"
              opacity={opacity}
            />
          );
        })}

        {/* nodes */}
        {agents.map((a) => {
          const p = positions[a.id];
          if (!p) return null;
          return (
            <g key={a.id}>
              <circle cx={p.x} cy={p.y} r={26} className="fill-white/25 dark:fill-white/10" filter="url(#nativeAgentLabGlow)" />
              <circle cx={p.x} cy={p.y} r={18} className="fill-white/70 dark:fill-slate-950/60" />
              <circle cx={p.x} cy={p.y} r={18} className="stroke-gray-900/25 dark:stroke-white/15" fill="none" />
              <text x={p.x} y={p.y + 4} textAnchor="middle" className="fill-gray-900 dark:fill-white" style={{ fontSize: 11, fontWeight: 600 }}>
                {a.name.slice(0, 10)}
              </text>
            </g>
          );
        })}

        {/* legend */}
        <g>
          <text x={20} y={h - 26} className="fill-gray-700 dark:fill-white/70" style={{ fontSize: 11 }}>
            Solid = alignment, dashed = conflict, thickness = |weight|
          </text>
        </g>
      </svg>
    </div>
  );
}
