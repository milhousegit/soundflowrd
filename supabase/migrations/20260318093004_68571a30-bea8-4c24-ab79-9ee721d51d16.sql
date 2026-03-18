
-- Drop the overly permissive policy that exposes all columns
DROP POLICY IF EXISTS "Authenticated users can view public profile fields" ON public.profiles;
