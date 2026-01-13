-- Add UPDATE policy for favorites table so we can fix the item_type
CREATE POLICY "Users can update own favorites" 
ON public.favorites 
FOR UPDATE 
USING (auth.uid() = user_id);