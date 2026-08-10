-- Execute uma vez no SQL Editor do Supabase antes de usar o workflow n8n v4.
ALTER TABLE public.dispatches
ADD COLUMN IF NOT EXISTS google_calendar_event_id TEXT;
