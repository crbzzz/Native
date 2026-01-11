Native AI, fait par crbzzz

## Supabase (historique conversations)

Si tu vois une erreur du type `PGRST205` / `Could not find the table 'public.messages'`, c'est que les tables n'ont pas été créées dans ton projet Supabase.

### Appliquer les migrations

1. Ouvre Supabase Dashboard → **SQL Editor**
2. Exécute les migrations (dans cet ordre) :
	- [interface/supabase/migrations/20260108213847_create_conversations_table.sql](interface/supabase/migrations/20260108213847_create_conversations_table.sql)
	- [interface/supabase/migrations/20260108230000_create_messages_table.sql](interface/supabase/migrations/20260108230000_create_messages_table.sql)
	- [interface/supabase/migrations/20260108233000_add_attachments_to_messages.sql](interface/supabase/migrations/20260108233000_add_attachments_to_messages.sql)
	- [interface/supabase/migrations/20260111091500_create_token_usage_and_presence.sql](interface/supabase/migrations/20260111091500_create_token_usage_and_presence.sql)

### Rafraîchir le schema cache (PostgREST)

Après création des tables, Supabase met parfois quelques secondes à rafraîchir le cache.
Tu peux forcer le refresh via SQL Editor :

`notify pgrst, 'reload schema';`