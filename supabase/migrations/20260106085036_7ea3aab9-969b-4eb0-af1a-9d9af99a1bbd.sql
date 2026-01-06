-- Add direct_link column to track_file_mappings to cache the Real-Debrid stream URL
-- This allows instant playback for synced tracks without re-fetching from RD
ALTER TABLE public.track_file_mappings
ADD COLUMN IF NOT EXISTS direct_link TEXT,
ADD COLUMN IF NOT EXISTS direct_link_expires_at TIMESTAMP WITH TIME ZONE;