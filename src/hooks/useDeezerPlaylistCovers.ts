import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface DeezerPlaylistCover {
  deezer_playlist_id: string;
  cover_url: string;
}

export const useDeezerPlaylistCovers = (playlistIds: string[]) => {
  return useQuery({
    queryKey: ['deezer-playlist-covers', playlistIds],
    queryFn: async () => {
      if (!playlistIds.length) return {};
      
      const { data, error } = await supabase
        .from('deezer_playlist_covers')
        .select('deezer_playlist_id, cover_url')
        .in('deezer_playlist_id', playlistIds);

      if (error) {
        console.error('Error fetching deezer playlist covers:', error);
        return {};
      }

      // Return as a map for easy lookup
      const coverMap: Record<string, string> = {};
      data?.forEach((item) => {
        coverMap[item.deezer_playlist_id] = item.cover_url;
      });
      
      return coverMap;
    },
    enabled: playlistIds.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

// Helper function to get effective cover URL
export const getEffectiveCover = (
  playlistId: string,
  originalCover: string | undefined,
  coverMap: Record<string, string> | undefined
): string => {
  return coverMap?.[playlistId] || originalCover || '/placeholder.svg';
};
