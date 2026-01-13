-- Drop the old check constraint
ALTER TABLE public.favorites DROP CONSTRAINT IF EXISTS favorites_item_type_check;

-- Add the new check constraint with 'playlist' included
ALTER TABLE public.favorites ADD CONSTRAINT favorites_item_type_check CHECK (item_type IN ('track', 'album', 'artist', 'playlist'));