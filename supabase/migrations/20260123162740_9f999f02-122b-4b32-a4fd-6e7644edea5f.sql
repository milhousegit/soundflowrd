-- Add last seen and currently playing tracking
ALTER TABLE public.profiles 
ADD COLUMN last_seen_at timestamp with time zone DEFAULT now(),
ADD COLUMN currently_playing_track_id text DEFAULT NULL,
ADD COLUMN currently_playing_at timestamp with time zone DEFAULT NULL;