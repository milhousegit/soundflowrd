-- Create user_plugins table
CREATE TABLE public.user_plugins (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plugin_id TEXT NOT NULL,
  manifest JSONB NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT true,
  position INTEGER NOT NULL DEFAULT 0,
  installed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, plugin_id)
);

CREATE INDEX idx_user_plugins_user_id ON public.user_plugins(user_id);
CREATE INDEX idx_user_plugins_position ON public.user_plugins(user_id, position);

-- Enable RLS
ALTER TABLE public.user_plugins ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own plugins"
ON public.user_plugins FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can install their own plugins"
ON public.user_plugins FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own plugins"
ON public.user_plugins FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can remove their own plugins"
ON public.user_plugins FOR DELETE
USING (auth.uid() = user_id);

-- Updated_at trigger
CREATE TRIGGER update_user_plugins_updated_at
BEFORE UPDATE ON public.user_plugins
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Seed existing users with Monochrome plugin
INSERT INTO public.user_plugins (user_id, plugin_id, manifest, config, enabled, position)
SELECT
  id,
  'monochrome',
  '{
    "id": "monochrome",
    "name": "Monochrome",
    "version": "1.0.0",
    "author": "SoundFlow",
    "description": "FLAC streaming via Tidal mirrors",
    "type": "audio-source",
    "transport": "edge-function",
    "endpoint": "monochrome",
    "capabilities": ["search", "stream", "lossless"],
    "config": { "fields": [] }
  }'::jsonb,
  '{}'::jsonb,
  true,
  0
FROM public.profiles
ON CONFLICT (user_id, plugin_id) DO NOTHING;

-- Seed existing users with Real-Debrid plugin (only if they have an API key)
INSERT INTO public.user_plugins (user_id, plugin_id, manifest, config, enabled, position)
SELECT
  id,
  'real-debrid',
  '{
    "id": "real-debrid",
    "name": "Real Debrid",
    "version": "1.0.0",
    "author": "SoundFlow",
    "description": "Streaming via torrents su Real-Debrid",
    "type": "audio-source",
    "transport": "edge-function",
    "endpoint": "real-debrid",
    "capabilities": ["search", "stream"],
    "config": {
      "fields": [
        {
          "key": "apiKey",
          "label": "API Key",
          "type": "password",
          "required": true,
          "verifyAction": "verify",
          "helpUrl": "https://real-debrid.com/apitoken"
        }
      ]
    }
  }'::jsonb,
  jsonb_build_object('apiKey', real_debrid_api_key),
  true,
  1
FROM public.profiles
WHERE real_debrid_api_key IS NOT NULL AND real_debrid_api_key != ''
ON CONFLICT (user_id, plugin_id) DO NOTHING;