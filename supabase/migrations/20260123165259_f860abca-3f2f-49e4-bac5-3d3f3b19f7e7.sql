-- Add email_confirmed field to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email_confirmed boolean DEFAULT false;

-- Update existing profiles to mark them as confirmed (existing users have already confirmed)
UPDATE public.profiles SET email_confirmed = true WHERE email IS NOT NULL;