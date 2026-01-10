-- Add audio_source_mode column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS audio_source_mode text DEFAULT 'rd_priority';

-- Add comment explaining the values
COMMENT ON COLUMN public.profiles.audio_source_mode IS 'Audio source mode: rd_priority (Real-Debrid + YouTube fallback) or youtube_only (YouTube only)';