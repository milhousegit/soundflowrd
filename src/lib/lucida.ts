import { supabase } from '@/integrations/supabase/client';

export interface DeezerStreamResult {
  streamUrl: string;
  server?: string;
  handoff?: string;
}

export interface DeezerStreamError {
  error: string;
}

/**
 * Get audio stream URL for a Deezer track using Lucida.to service
 * @param trackId - Deezer track ID (numeric)
 * @param country - Country code for regional availability (default: 'auto')
 * @returns Stream URL or error
 */
export async function getDeezerStream(
  trackId: string,
  country = 'auto'
): Promise<DeezerStreamResult | DeezerStreamError> {
  try {
    const { data, error } = await supabase.functions.invoke('lucida', {
      body: { 
        action: 'get-stream', 
        trackId,
        country,
      },
    });

    if (error) {
      console.error('[Lucida] Supabase function error:', error);
      return { error: error.message || 'Failed to get stream' };
    }

    if (data?.error) {
      console.error('[Lucida] Stream error:', data.error);
      return { error: data.error };
    }

    if (!data?.streamUrl) {
      return { error: 'No stream URL returned' };
    }

    return {
      streamUrl: data.streamUrl,
      server: data.server,
      handoff: data.handoff,
    };
  } catch (err) {
    console.error('[Lucida] Unexpected error:', err);
    return { 
      error: err instanceof Error ? err.message : 'Unexpected error getting Deezer stream' 
    };
  }
}

/**
 * Check if Lucida stream service is available
 * This is a lightweight check - doesn't actually fetch a stream
 */
export async function checkLucidaAvailability(): Promise<boolean> {
  try {
    // Try to resolve a known track without actually downloading
    const response = await fetch('https://lucida.to/', {
      method: 'HEAD',
      mode: 'no-cors', // Just check if reachable
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Build Deezer track URL from track ID
 */
export function buildDeezerTrackUrl(trackId: string): string {
  return `https://www.deezer.com/track/${trackId}`;
}
