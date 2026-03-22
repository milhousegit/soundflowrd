import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

// In-memory set to avoid re-fetching canvases we already tried and failed
const fetchedTrackIds = new Set<string>();

export const useTrackCanvas = (trackId: string | undefined, trackTitle?: string, trackArtist?: string) => {
  const [canvasUrl, setCanvasUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef(false);

  useEffect(() => {
    abortRef.current = false;

    const fetchCanvas = async () => {
      if (!trackId) {
        setCanvasUrl(null);
        return;
      }

      setIsLoading(true);
      try {
        // 1. Check DB first
        const { data, error } = await supabase
          .from('track_canvases')
          .select('canvas_url')
          .eq('track_id', trackId)
          .maybeSingle();

        if (error) throw error;
        if (abortRef.current) return;

        if (data?.canvas_url) {
          setCanvasUrl(data.canvas_url);
          return;
        }

        // 2. No canvas in DB — try fetching from Spotify (only once per session per track)
        if (!trackTitle || !trackArtist || fetchedTrackIds.has(trackId)) {
          setCanvasUrl(null);
          return;
        }

        fetchedTrackIds.add(trackId);

        const { data: canvasData, error: fnError } = await supabase.functions.invoke('spotify-canvas', {
          body: {
            tracks: [{ id: trackId, title: trackTitle, artist: trackArtist }],
          },
        });

        if (abortRef.current) return;

        if (fnError) {
          console.error('[Canvas] Edge function error:', fnError);
          setCanvasUrl(null);
          return;
        }

        const result = canvasData?.results?.[0];
        if (result?.canvas_url) {
          setCanvasUrl(result.canvas_url);
        } else {
          setCanvasUrl(null);
        }
      } catch (error) {
        console.error('Error fetching track canvas:', error);
        if (!abortRef.current) setCanvasUrl(null);
      } finally {
        if (!abortRef.current) setIsLoading(false);
      }
    };

    fetchCanvas();

    return () => {
      abortRef.current = true;
    };
  }, [trackId, trackTitle, trackArtist]);

  return { canvasUrl, isLoading };
};
