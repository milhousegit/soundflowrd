-- Add premium status columns to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_premium boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS premium_expires_at timestamp with time zone DEFAULT NULL;

-- Create RLS policy for admins to view all profiles
CREATE POLICY "Admins can view all profiles" 
ON public.profiles 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'));

-- Create RLS policy for admins to update all profiles
CREATE POLICY "Admins can update all profiles" 
ON public.profiles 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'));