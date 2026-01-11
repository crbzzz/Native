import { getAccessToken } from './auth';

export type MessageRole = 'user' | 'assistant';

export interface DbMessage {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  attachments?: Array<{ name: string; type: string; size: number }> | null;
  created_at: string;
}

export async function getMessages(conversationId: string): Promise<DbMessage[]> {
  const token = await getAccessToken();
  if (!token) throw new Error('auth_required');

  const res = await fetch(`/api/conversations/${conversationId}/messages`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(txt || `HTTP ${res.status}`);
  }
  const data = (await res.json()) as DbMessage[];
  return data ?? [];
}

export async function addMessage(
  conversationId: string,
  role: MessageRole,
  content: string,
  attachments?: Array<{ name: string; type: string; size: number }>
): Promise<DbMessage> {
  // Déprécié: les messages sont persistés par le backend (/api/chat).
  // On garde la signature pour compatibilité, mais on ne l'utilise plus.
  return {
    id: crypto.randomUUID(),
    conversation_id: conversationId,
    role,
    content,
    attachments: attachments ?? null,
    created_at: new Date().toISOString(),
  };
}
