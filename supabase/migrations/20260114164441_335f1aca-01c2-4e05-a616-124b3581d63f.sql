-- Create table for storing user lyrics sync offsets per track
CREATE TABLE public.lyrics_offsets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  track_id TEXT NOT NULL,
  offset_seconds NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, track_id)
);

-- Enable Row Level Security
ALTER TABLE public.lyrics_offsets ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own offsets" 
ON public.lyrics_offsets 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own offsets" 
ON public.lyrics_offsets 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own offsets" 
ON public.lyrics_offsets 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own offsets" 
ON public.lyrics_offsets 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_lyrics_offsets_updated_at
BEFORE UPDATE ON public.lyrics_offsets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();