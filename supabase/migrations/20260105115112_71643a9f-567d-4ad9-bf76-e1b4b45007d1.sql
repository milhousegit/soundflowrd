-- Add unique constraint on track_id for upsert to work
ALTER TABLE public.track_file_mappings
ADD CONSTRAINT track_file_mappings_track_id_key UNIQUE (track_id);