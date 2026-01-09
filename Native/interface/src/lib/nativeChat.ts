export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface SendChatOptions {
  deepSearch?: boolean;
  reason?: boolean;
  files?: File[];
  systemPrompt?: string;
  timeoutMs?: number;
}

export async function sendChat(messages: ChatMessage[], options?: SendChatOptions): Promise<string> {
  const form = new FormData();
  form.append('messages', JSON.stringify(messages));

  if (options?.systemPrompt && options.systemPrompt.trim()) {
    form.append('system_prompt', options.systemPrompt);
  }

  if (options?.deepSearch) form.append('deep_search', '1');
  if (options?.reason) form.append('reason', '1');
  for (const f of options?.files ?? []) {
    form.append('files', f, f.name);
  }

  const controller = new AbortController();
  const timeoutMs = options?.timeoutMs ?? 45000;
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch('/api/chat', {
      method: 'POST',
      body: form,
      signal: controller.signal,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.toLowerCase().includes('aborted') || msg.toLowerCase().includes('abort')) {
      throw new Error('Request timed out');
    }
    throw e;
  } finally {
    window.clearTimeout(timer);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }

  const data = (await res.json()) as { reply?: string };
  return data.reply ?? '';
}
