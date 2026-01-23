-- Add payment pending tracking column
ALTER TABLE public.profiles 
ADD COLUMN payment_pending_since timestamp with time zone DEFAULT NULL;