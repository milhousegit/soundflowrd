import { supabase } from '@/integrations/supabase/client';
import type { TidalStreamResult, TidalStreamError } from '@/lib/tidal';

/**
 * Get audio stream URL for a track by searching on HiFi (Tidal via OpenSubsonic)
 */
export async function getHifiStream(
  title: string,
  artist: string,
  quality = 'LOSSLESS'
): Promise<TidalStreamResult | TidalStreamError> {
  try {
    const { data, error } = await supabase.functions.invoke('hifi', {
      body: { 
        action: 'search-and-stream', 
        title,
        artist,
        quality,
      },
    });

    if (error) {
      console.error('[HiFi] Supabase function error:', error);
      return { error: error.message || 'Failed to get stream' };
    }

    if (data?.error) {
      console.error('[HiFi] Stream error:', data.error);
      return { error: data.error };
    }

    if (!data?.streamUrl) {
      return { error: 'No stream URL returned' };
    }

    return {
      streamUrl: data.streamUrl,
      quality: data.quality || 'LOSSLESS',
      matchScore: data.matchScore,
    };
  } catch (err) {
    console.error('[HiFi] Unexpected error:', err);
    return { 
      error: err instanceof Error ? err.message : 'Unexpected error getting HiFi stream' 
    };
  }
}
