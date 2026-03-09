import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const useTrackCanvas = (trackId: string | undefined) => {
  const [canvasUrl, setCanvasUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const fetchCanvas = async () => {
      if (!trackId) {
        setCanvasUrl(null);
        return;
      }

      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('track_canvases')
          .select('canvas_url')
          .eq('track_id', trackId)
          .maybeSingle();

        if (error) throw error;

        if (isMounted) {
          setCanvasUrl(data?.canvas_url || null);
        }
      } catch (error) {
        console.error('Error fetching track canvas:', error);
        if (isMounted) {
          setCanvasUrl(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchCanvas();

    return () => {
      isMounted = false;
    };
  }, [trackId]);

  return { canvasUrl, isLoading };
};
