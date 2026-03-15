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

export class ChatApiError extends Error {
  status: number;
  code?: string;
  detail?: string;
  constructor(message: string, opts: { status: number; code?: string; detail?: string }) {
    super(message);
    this.name = 'ChatApiError';
    this.status = opts.status;
    this.code = opts.code;
    this.detail = opts.detail;
  }
}

function safeJsonParse(text: string): any | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

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
    const parsed = safeJsonParse(text);
    const code = typeof parsed?.error === 'string' ? parsed.error : undefined;
    const detail = typeof parsed?.detail === 'string' ? parsed.detail : undefined;
    const message = detail || (typeof parsed?.message === 'string' ? parsed.message : '') || text || `HTTP ${res.status}`;
    throw new ChatApiError(message, { status: res.status, code, detail });
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

type TranscribeResponse = {
  spoken?: string;
  text?: string;
};

export async function transcribeAudio(file: File): Promise<{ spoken: string; text: string }> {
  const form = new FormData();
  form.append('file', file, file.name || 'audio.webm');

  const token = await getAccessToken();
  const res = await fetch('/api/transcribe', {
    method: 'POST',
    body: form,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  if (!res.ok) {
    let text = await res.text().catch(() => '');

    // FastAPI default for uncaught exceptions
    if (res.status >= 500 && text.trim().toLowerCase() === 'internal server error') {
      throw new Error('Erreur serveur (transcription). Redémarre le backend et réessaie.');
    }
    try {
      const parsed = JSON.parse(text) as any;
      const code = String(parsed?.error || '').toLowerCase();
      const detail = parsed?.detail;
      const detailMsg =
        typeof detail === 'string'
          ? detail
          : typeof detail?.message === 'string'
            ? detail.message
            : '';

      if (code.includes('auth_required') || code.includes('invalid_auth') || res.status === 401) {
        throw new Error('Connexion requise.');
      }
      if (code.includes('audio_conversion_failed')) {
        throw new Error('Audio non supporté par la transcription (conversion impossible).');
      }
      if ((code.includes('mistral_api_error') || code.includes('mistral_request_rejected')) && detailMsg.toLowerCase().includes('failed to load audio file')) {
        throw new Error('Audio invalide pour Voxtral. Essaie un enregistrement plus long (ou re-teste).');
      }

      if (detailMsg) throw new Error(detailMsg);
      throw new Error(code ? `Erreur: ${code}` : `HTTP ${res.status}`);
    } catch {
      // ignore JSON parse errors
    }
    throw new Error(text || `HTTP ${res.status}`);
  }

  const data = (await res.json()) as TranscribeResponse;
  return { spoken: data.spoken ?? '', text: data.text ?? '' };
}
