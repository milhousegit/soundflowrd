-- Create table for admin-configurable chart playlists
CREATE TABLE public.chart_configurations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  country_code TEXT NOT NULL UNIQUE,
  playlist_id TEXT NOT NULL,
  playlist_title TEXT,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.chart_configurations ENABLE ROW LEVEL SECURITY;

-- Everyone can read chart configurations
CREATE POLICY "Anyone can view chart configurations"
  ON public.chart_configurations
  FOR SELECT
  USING (true);

-- Only admins can manage chart configurations
CREATE POLICY "Admins can insert chart configurations"
  ON public.chart_configurations
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update chart configurations"
  ON public.chart_configurations
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete chart configurations"
  ON public.chart_configurations
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Add timestamp trigger
CREATE TRIGGER update_chart_configurations_updated_at
  BEFORE UPDATE ON public.chart_configurations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default configurations (using Deezer editorial IDs as playlist IDs)
INSERT INTO public.chart_configurations (country_code, playlist_id, playlist_title) VALUES
  ('IT', '116', 'Top Italia'),
  ('US', '0', 'Top USA'),
  ('ES', '134', 'Top España'),
  ('FR', '52', 'Top France'),
  ('DE', '56', 'Top Germany'),
  ('PT', '131', 'Top Portugal'),
  ('GB', '104', 'Top UK'),
  ('BR', '91', 'Top Brazil');