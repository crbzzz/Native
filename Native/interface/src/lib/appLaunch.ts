export type ChatAppLaunch = {
  id: string;
  title: string;
  prompt: string;
  deepSearch?: boolean;
  reason?: boolean;
};

const STORAGE_KEY = 'native.pending_chat_app_launch';

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function setPendingChatAppLaunch(launch: ChatAppLaunch): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(launch));
  } catch {
    // ignore
  }
}

export function consumePendingChatAppLaunch(): ChatAppLaunch | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    localStorage.removeItem(STORAGE_KEY);

    const parsed = safeJsonParse(raw);
    if (!parsed || typeof parsed !== 'object') return null;

    const obj = parsed as Record<string, unknown>;
    const id = typeof obj.id === 'string' ? obj.id : '';
    const title = typeof obj.title === 'string' ? obj.title : '';
    const prompt = typeof obj.prompt === 'string' ? obj.prompt : '';

    if (!id || !title || !prompt) return null;

    return {
      id,
      title,
      prompt,
      deepSearch: Boolean(obj.deepSearch),
      reason: Boolean(obj.reason),
    };
  } catch {
    return null;
  }
}
