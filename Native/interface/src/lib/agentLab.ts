import { getAccessToken } from './auth';

export type AgentLabAgent = {
  id: string;
  name: string;
  persona: string;
};

export type AgentLabProject = {
  id: string;
  title: string;
  topic: string;
  agents: AgentLabAgent[];
  settings?: Record<string, unknown>;
  suggestions?: Array<{ title?: string; prompt?: string }>;
  next_turn?: number;
  created_at?: string;
  updated_at?: string;
};

export type AgentLabMessage = {
  id: string;
  project_id: string;
  turn_index: number;
  speaker_id: string;
  speaker_name: string;
  content: string;
  steering_prompt?: string | null;
  tokens?: number;
  created_at?: string;
};

export type AgentLabEdge = {
  id: string;
  project_id: string;
  turn_index: number;
  source_id: string;
  target_id: string;
  weight: number;
  label?: string | null;
  rationale?: string | null;
  created_at?: string;
};

export class AgentLabApiError extends Error {
  status: number;
  code?: string;
  detail?: string;
  constructor(message: string, opts: { status: number; code?: string; detail?: string }) {
    super(message);
    this.name = 'AgentLabApiError';
    this.status = opts.status;
    this.code = opts.code;
    this.detail = opts.detail;
  }
}

function safeJsonParse(text: string): unknown | null {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getAccessToken();
  const headers = new Headers(init?.headers ?? undefined);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init?.body && !(init.body instanceof FormData)) {
    if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  }

  return fetch(path, { ...init, headers });
}

async function expectJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const parsed = safeJsonParse(text);
    const parsedObj = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
    const code = parsedObj && typeof parsedObj.error === 'string' ? parsedObj.error : undefined;
    const detail = parsedObj && typeof parsedObj.detail === 'string' ? parsedObj.detail : undefined;
    const message =
      detail ||
      (parsedObj && typeof parsedObj.message === 'string' ? parsedObj.message : '') ||
      text ||
      `HTTP ${res.status}`;
    throw new AgentLabApiError(message, { status: res.status, code, detail });
  }
  return (await res.json()) as T;
}

export async function listAgentLabProjects(): Promise<Array<Pick<AgentLabProject, 'id' | 'title' | 'topic' | 'next_turn' | 'created_at' | 'updated_at'>>> {
  const res = await authedFetch('/api/agentlab/projects');
  return expectJson(res);
}

export async function createAgentLabProject(input: {
  title: string;
  topic: string;
  agents: AgentLabAgent[];
}): Promise<{ project: AgentLabProject }> {
  const res = await authedFetch('/api/agentlab/projects', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return expectJson(res);
}

export async function getAgentLabProject(projectId: string): Promise<{ project: AgentLabProject; messages: AgentLabMessage[]; edges: AgentLabEdge[] }> {
  const res = await authedFetch(`/api/agentlab/projects/${encodeURIComponent(projectId)}`);
  return expectJson(res);
}

export async function getAgentLabSuggestions(projectId: string): Promise<{ suggestions: Array<{ title?: string; prompt?: string }> }> {
  const res = await authedFetch(`/api/agentlab/projects/${encodeURIComponent(projectId)}/suggestions`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return expectJson(res);
}

export async function agentLabStep(projectId: string, steeringPrompt: string): Promise<{ turn_index: number; speaker: { id: string; name: string }; message: AgentLabMessage | null; edges: AgentLabEdge[]; tokens: number }> {
  const res = await authedFetch(`/api/agentlab/projects/${encodeURIComponent(projectId)}/step`, {
    method: 'POST',
    body: JSON.stringify({ steering_prompt: steeringPrompt }),
  });
  return expectJson(res);
}
