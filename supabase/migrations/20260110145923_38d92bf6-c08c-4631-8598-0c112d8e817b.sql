-- Create home content cache table for faster loading
CREATE TABLE public.home_content_cache (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  content_type text NOT NULL, -- 'new_releases' or 'popular_artists'
  country text NOT NULL DEFAULT 'IT',
  language text NOT NULL DEFAULT 'it',
  data jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create unique index for content type + country + language combination
CREATE UNIQUE INDEX idx_home_content_cache_lookup 
ON public.home_content_cache (content_type, country, language);

-- Enable RLS (public read access since this is cached public data)
ALTER TABLE public.home_content_cache ENABLE ROW LEVEL SECURITY;

-- Anyone can read cached content (public data)
CREATE POLICY "Anyone can view cached content" 
ON public.home_content_cache 
FOR SELECT 
USING (true);

-- Service role can insert/update (edge functions only)
CREATE POLICY "Service role can manage cache" 
ON public.home_content_cache 
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_home_content_cache_updated_at
BEFORE UPDATE ON public.home_content_cache
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();