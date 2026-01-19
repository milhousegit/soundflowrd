-- Add track_album_id column to posts table to link tracks to albums
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS track_album_id TEXT;