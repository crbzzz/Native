/*
  # Add attachments to messages

  Adds an optional JSONB column to store lightweight attachment metadata
  (name/type/size). This enables the UI to show "Fichier uploadé" under a
  user message and allows persistence.
*/

alter table public.messages
add column if not exists attachments jsonb;
