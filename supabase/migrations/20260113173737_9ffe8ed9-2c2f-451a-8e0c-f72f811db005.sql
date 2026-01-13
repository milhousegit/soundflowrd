-- Change default audio_source_mode to 'deezer_priority' (Scraping Ponte)
-- This ensures users without Real-Debrid API key get the correct default
ALTER TABLE public.profiles 
ALTER COLUMN audio_source_mode SET DEFAULT 'deezer_priority';