-- Create table for YouTube track mappings
CREATE TABLE public.youtube_track_mappings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  track_id TEXT NOT NULL,
  video_id TEXT NOT NULL,
  video_title TEXT NOT NULL,
  video_duration INTEGER DEFAULT 0,
  uploader_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(track_id)
);

-- Enable Row Level Security
ALTER TABLE public.youtube_track_mappings ENABLE ROW LEVEL SECURITY;

-- Create policies - allow all authenticated users to read/write
-- (This is shared music data, not user-specific)
CREATE POLICY "Anyone can view YouTube mappings" 
ON public.youtube_track_mappings 
FOR SELECT 
USING (true);

CREATE POLICY "Authenticated users can insert YouTube mappings" 
ON public.youtube_track_mappings 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Authenticated users can update YouTube mappings" 
ON public.youtube_track_mappings 
FOR UPDATE 
USING (true);

CREATE POLICY "Authenticated users can delete YouTube mappings" 
ON public.youtube_track_mappings 
FOR DELETE 
USING (true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_youtube_track_mappings_updated_at
BEFORE UPDATE ON public.youtube_track_mappings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();