-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Authenticated users can view all profiles for search" ON public.profiles;

-- Create a security definer function that returns only public fields for other users
CREATE OR REPLACE FUNCTION public.is_own_profile(_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() = _profile_id
$$;

-- Create a new policy: authenticated users can see all profiles BUT
-- sensitive columns are protected via a secure view approach.
-- Since RLS can't filter columns, we restrict to: users can SELECT any row
-- but we'll create a safe view for search queries.
-- For now, keep row-level access but we'll use a view for search.

-- Step 1: Create a secure view with only public fields
CREATE OR REPLACE VIEW public.public_profiles AS
SELECT 
  id,
  display_name,
  avatar_url,
  bio,
  bio_track_id,
  bio_track_title,
  bio_track_artist,
  bio_track_cover_url,
  is_private,
  followers_count,
  following_count,
  currently_playing_track_id,
  currently_playing_at,
  last_seen_at,
  created_at
FROM public.profiles;

-- Grant access to the view
GRANT SELECT ON public.public_profiles TO authenticated;
GRANT SELECT ON public.public_profiles TO anon;