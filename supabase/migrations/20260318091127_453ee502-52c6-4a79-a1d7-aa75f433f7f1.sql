-- Fix: make the view SECURITY INVOKER (safe - uses caller's permissions)
ALTER VIEW public.public_profiles SET (security_invoker = on);

-- Since RLS on profiles table still applies through the view,
-- we need a simple policy allowing authenticated users to SELECT any profile row
-- (the view itself limits which COLUMNS are visible)
CREATE POLICY "Authenticated users can view public profile fields"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);