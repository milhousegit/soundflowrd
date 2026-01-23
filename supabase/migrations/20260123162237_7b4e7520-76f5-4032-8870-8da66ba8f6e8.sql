-- Add referral columns to profiles
ALTER TABLE public.profiles 
ADD COLUMN referral_code text UNIQUE DEFAULT NULL,
ADD COLUMN referred_by uuid REFERENCES public.profiles(id) DEFAULT NULL;

-- Create referrals tracking table
CREATE TABLE public.referrals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referred_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referrer_premium_granted boolean NOT NULL DEFAULT false,
  referred_premium_granted boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(referred_id)
);

-- Enable RLS
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- Users can view their own referrals (as referrer)
CREATE POLICY "Users can view their referrals"
ON public.referrals
FOR SELECT
USING (auth.uid() = referrer_id);

-- Service role can manage referrals
CREATE POLICY "Service role can manage referrals"
ON public.referrals
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Create function to generate unique referral code
CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_code text;
  code_exists boolean;
BEGIN
  -- Generate a unique 8-character code
  LOOP
    new_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    SELECT EXISTS(SELECT 1 FROM profiles WHERE referral_code = new_code) INTO code_exists;
    EXIT WHEN NOT code_exists;
  END LOOP;
  
  NEW.referral_code := new_code;
  RETURN NEW;
END;
$$;

-- Create trigger to auto-generate referral code on profile creation
CREATE TRIGGER generate_referral_code_trigger
BEFORE INSERT ON public.profiles
FOR EACH ROW
WHEN (NEW.referral_code IS NULL)
EXECUTE FUNCTION public.generate_referral_code();

-- Generate referral codes for existing users who don't have one
UPDATE public.profiles 
SET referral_code = upper(substr(md5(id::text || random()::text), 1, 8))
WHERE referral_code IS NULL;