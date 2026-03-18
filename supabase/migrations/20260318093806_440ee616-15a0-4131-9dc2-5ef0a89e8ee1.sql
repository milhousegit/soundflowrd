
-- Add user_id column to track_file_mappings
ALTER TABLE public.track_file_mappings ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Drop the unique constraint on track_id (so multiple users can map same track)
ALTER TABLE public.track_file_mappings DROP CONSTRAINT IF EXISTS track_file_mappings_track_id_key;

-- Add composite unique constraint
ALTER TABLE public.track_file_mappings ADD CONSTRAINT track_file_mappings_track_id_user_id_key UNIQUE (track_id, user_id);

-- Drop all permissive policies
DROP POLICY IF EXISTS "Anyone can view track mappings" ON public.track_file_mappings;
DROP POLICY IF EXISTS "Anyone can create track mappings" ON public.track_file_mappings;
DROP POLICY IF EXISTS "Anyone can update track mappings" ON public.track_file_mappings;
DROP POLICY IF EXISTS "Anyone can delete track mappings" ON public.track_file_mappings;

-- Create restricted policies
CREATE POLICY "Users can view own track mappings" ON public.track_file_mappings
FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can create own track mappings" ON public.track_file_mappings
FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own track mappings" ON public.track_file_mappings
FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own track mappings" ON public.track_file_mappings
FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Admin access
CREATE POLICY "Admins can manage all track mappings" ON public.track_file_mappings
FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
