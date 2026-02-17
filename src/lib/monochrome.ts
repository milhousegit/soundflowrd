import { supabase } from '@/integrations/supabase/client';
import type { TidalStreamResult, TidalStreamError } from '@/lib/tidal';

export { mapQualityToTidal } from '@/lib/tidal';

/**
 * Get audio stream URL for a track by searching on Tidal via Monochrome
 */
export async function getMonochromeStream(
  title: string,
  artist: string,
  quality = 'LOSSLESS'
): Promise<TidalStreamResult | TidalStreamError> {
  try {
    const { data, error } = await supabase.functions.invoke('monochrome', {
      body: { 
        action: 'search-and-stream', 
        title,
        artist,
        quality,
      },
    });

    if (error) {
      console.error('[Monochrome] Supabase function error:', error);
      return { error: error.message || 'Failed to get stream' };
    }

    if (data?.error) {
      console.error('[Monochrome] Stream error:', data.error);
      return { error: data.error };
    }

    if (!data?.streamUrl) {
      return { error: 'No stream URL returned' };
    }

    return {
      streamUrl: data.streamUrl,
      tidalId: data.tidalId,
      quality: data.quality,
      bitDepth: data.bitDepth,
      sampleRate: data.sampleRate,
      matchScore: data.matchScore,
    };
  } catch (err) {
    console.error('[Monochrome] Unexpected error:', err);
    return { 
      error: err instanceof Error ? err.message : 'Unexpected error getting Monochrome stream' 
    };
  }
}
