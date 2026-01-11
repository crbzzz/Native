import { getAccessToken } from './auth';

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
  persist?: boolean;
  conversationId?: string;
  conversationTitle?: string;
  attachments?: Array<{ name: string; type: string; size: number }>;
  timeoutMs?: number;
}

type ChatApiResponse = {
  reply?: string;
  conversationId?: string;
  conversation?: any;
};

async function postChat(messages: ChatMessage[], options?: SendChatOptions): Promise<ChatApiResponse> {
  const form = new FormData();
  form.append('messages', JSON.stringify(messages));

  if (options?.systemPrompt && options.systemPrompt.trim()) {
    form.append('system_prompt', options.systemPrompt);
  }

  if (options?.deepSearch) form.append('deep_search', '1');
  if (options?.reason) form.append('reason', '1');
  if (options?.persist) form.append('persist', '1');
  if (options?.conversationId) form.append('conversation_id', options.conversationId);
  if (options?.conversationTitle) form.append('conversation_title', options.conversationTitle);
  if (options?.attachments && options.attachments.length) {
    form.append('attachments', JSON.stringify(options.attachments));
  }
  for (const f of options?.files ?? []) {
    form.append('files', f, f.name);
  }

  const controller = new AbortController();
  const timeoutMs = options?.timeoutMs ?? 45000;
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    const token = await getAccessToken();
    res = await fetch('/api/chat', {
      method: 'POST',
      body: form,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
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

  return (await res.json()) as ChatApiResponse;
}

export async function sendChat(messages: ChatMessage[], options?: SendChatOptions): Promise<string> {
  const data = await postChat(messages, { ...options, persist: Boolean(options?.persist) });
  return data.reply ?? '';
}

export async function sendChatPersisted(
  messages: ChatMessage[],
  options?: Omit<SendChatOptions, 'persist'>
): Promise<{ reply: string; conversationId?: string; conversation?: any }> {
  const data = await postChat(messages, { ...options, persist: true });
  return {
    reply: data.reply ?? '',
    conversationId: data.conversationId,
    conversation: data.conversation,
  };
}
