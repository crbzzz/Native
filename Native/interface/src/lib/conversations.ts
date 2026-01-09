import { supabase } from './supabase';

export async function createConversation(title: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('conversations')
    .insert({
      user_id: user.id,
      title,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getConversations() {
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

export async function updateConversationTitle(id: string, title: string) {
  const { data, error } = await supabase
    .from('conversations')
    .update({ title, updated_at: new Date() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteConversation(id: string) {
  const { error } = await supabase
    .from('conversations')
    .delete()
    .eq('id', id);

  if (error) throw error;
}
