import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Track } from '@/types/music';

export interface DailyMix {
  id: string;
  mix_index: number;
  mix_label: string;
  top_artists: string[];
  genre_tags: string[];
  tracks: Track[];
  dominant_color: string; // "color1,color2" for gradient
  cover_url: string | null;
  generated_at: string;
  expires_at: string;
}

export function useDailyMixes() {
  const { user } = useAuth();
  const [mixes, setMixes] = useState<DailyMix[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMixes = useCallback(async (action: 'get' | 'regenerate' = 'get') => {
    if (!user) return;
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('daily-mix', {
        body: { action },
      });

      if (fnError) throw fnError;

      const parsed: DailyMix[] = (data || []).map((m: any) => ({
        id: m.id,
        mix_index: m.mix_index,
        mix_label: m.mix_label,
        top_artists: m.top_artists || [],
        genre_tags: m.genre_tags || [],
        tracks: (m.tracks || []) as Track[],
        dominant_color: m.dominant_color || '#6366F1,#EC4899',
        cover_url: m.cover_url,
        generated_at: m.generated_at,
        expires_at: m.expires_at,
      }));

      setMixes(parsed);
    } catch (err: any) {
      console.error('Failed to fetch daily mixes:', err);
      setError(err.message || 'Failed to load mixes');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchMixes('get');
    }
  }, [user, fetchMixes]);

  const regenerate = useCallback(() => {
    return fetchMixes('regenerate');
  }, [fetchMixes]);

  return { mixes, isLoading, error, regenerate };
}
