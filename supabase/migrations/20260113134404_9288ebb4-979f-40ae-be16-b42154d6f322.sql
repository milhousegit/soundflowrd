-- Add telegram_chat_id column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN telegram_chat_id text DEFAULT NULL;

-- Add index for faster lookups by telegram_chat_id
CREATE INDEX idx_profiles_telegram_chat_id ON public.profiles(telegram_chat_id) WHERE telegram_chat_id IS NOT NULL;