import { supabase } from '@/integrations/supabase/client';

export interface TidalStreamResult {
  streamUrl: string;
  tidalId?: string;
  quality?: string;
  bitDepth?: number;
  sampleRate?: number;
  matchScore?: number;
}

export interface TidalStreamError {
  error: string;
}

/**
 * Map app quality setting to Tidal quality
 */
export function mapQualityToTidal(appQuality: 'high' | 'medium' | 'low'): string {
  switch (appQuality) {
    case 'high':
      return 'LOSSLESS'; // FLAC
    case 'medium':
      return 'HIGH'; // 320kbps AAC
    case 'low':
      return 'LOW'; // 96kbps
    default:
      return 'LOSSLESS';
  }
}

/**
 * Get audio stream URL for a track by searching on Tidal via SquidWTF
 * @param title - Track title
 * @param artist - Artist name
 * @param quality - Audio quality (HI_RES_LOSSLESS, LOSSLESS, HIGH, LOW)
 * @returns Stream URL or error
 */
export async function getTidalStream(
  title: string,
  artist: string,
  quality = 'LOSSLESS'
): Promise<TidalStreamResult | TidalStreamError> {
  const startTime = Date.now();
  console.log(`[Tidal] Starting search: "${title}" by ${artist} (${quality})`);
  
  try {
    const invokeStart = Date.now();
    const { data, error } = await supabase.functions.invoke('squidwtf', {
      body: { 
        action: 'search-and-stream', 
        title,
        artist,
        quality,
      },
    });
    const invokeDuration = Date.now() - invokeStart;
    console.log(`[Tidal] Edge function responded in ${invokeDuration}ms`);

    if (error) {
      console.error('[Tidal] Supabase function error:', error);
      return { error: error.message || 'Failed to get stream' };
    }

    if (data?.error) {
      console.error('[Tidal] Stream error:', data.error);
      return { error: data.error };
    }

    if (!data?.streamUrl) {
      console.log(`[Tidal] No stream URL returned (total: ${Date.now() - startTime}ms)`);
      return { error: 'No stream URL returned' };
    }

    console.log(`[Tidal] Success! Stream ready in ${Date.now() - startTime}ms`);
    return {
      streamUrl: data.streamUrl,
      tidalId: data.tidalId,
      quality: data.quality,
      bitDepth: data.bitDepth,
      sampleRate: data.sampleRate,
      matchScore: data.matchScore,
    };
  } catch (err) {
    console.error(`[Tidal] Unexpected error after ${Date.now() - startTime}ms:`, err);
    return { 
      error: err instanceof Error ? err.message : 'Unexpected error getting Tidal stream' 
    };
  }
}

/**
 * Get audio stream URL for a known Tidal track ID
 * @param tidalId - Tidal track ID
 * @param quality - Audio quality
 * @returns Stream URL or error
 */
export async function getTidalStreamById(
  tidalId: string,
  quality = 'LOSSLESS'
): Promise<TidalStreamResult | TidalStreamError> {
  try {
    const { data, error } = await supabase.functions.invoke('squidwtf', {
      body: { 
        action: 'get-stream', 
        tidalId,
        quality,
      },
    });

    if (error) {
      console.error('[Tidal] Supabase function error:', error);
      return { error: error.message || 'Failed to get stream' };
    }

    if (data?.error) {
      console.error('[Tidal] Stream error:', data.error);
      return { error: data.error };
    }

    if (!data?.streamUrl) {
      return { error: 'No stream URL returned' };
    }

    return {
      streamUrl: data.streamUrl,
      quality: data.quality,
      bitDepth: data.bitDepth,
      sampleRate: data.sampleRate,
    };
  } catch (err) {
    console.error('[Tidal] Unexpected error:', err);
    return { 
      error: err instanceof Error ? err.message : 'Unexpected error getting Tidal stream' 
    };
  }
}

/**
 * Search for tracks on Tidal
 * @param query - Search query
 * @returns Array of Tidal tracks
 */
export async function searchTidal(
  query: string
): Promise<any[]> {
  try {
    const { data, error } = await supabase.functions.invoke('squidwtf', {
      body: { 
        action: 'search', 
        title: query,
      },
    });

    if (error) {
      console.error('[Tidal] Search error:', error);
      return [];
    }

    return data?.results || [];
  } catch (err) {
    console.error('[Tidal] Unexpected search error:', err);
    return [];
  }
}
