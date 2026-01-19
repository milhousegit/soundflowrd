-- Add policy to allow authenticated users to search/view other profiles (for user discovery)
CREATE POLICY "Authenticated users can view all profiles for search"
ON public.profiles
FOR SELECT
USING (auth.uid() IS NOT NULL);