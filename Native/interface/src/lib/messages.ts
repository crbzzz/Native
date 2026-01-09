import { supabase } from './supabase';

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
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function addMessage(
  conversationId: string,
  role: MessageRole,
  content: string,
  attachments?: Array<{ name: string; type: string; size: number }>
): Promise<DbMessage> {
  const insertPayload: Record<string, unknown> = {
    conversation_id: conversationId,
    role,
    content,
  };
  if (attachments && attachments.length) insertPayload.attachments = attachments;

  const attempt = async (payload: Record<string, unknown>) =>
    supabase.from('messages').insert(payload).select().single();

  const { data, error } = await attempt(insertPayload);
  if (!error) return data as DbMessage;

  // Backward compatible: if the migration adding `attachments` hasn't been applied yet.
  const msg = String((error as any)?.message ?? '');
  if (msg.toLowerCase().includes('attachments') && msg.toLowerCase().includes('column')) {
    const { data: data2, error: error2 } = await attempt({
      conversation_id: conversationId,
      role,
      content,
    });
    if (error2) throw error2;
    return data2 as DbMessage;
  }

  throw error;
}
