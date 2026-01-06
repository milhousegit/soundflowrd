import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface YouTubeMapping {
  track_id: string;
  video_id: string;
  video_title: string;
}

// Cache for YouTube mappings - shared across all components
const youtubeMappingsCache = new Map<string, boolean>();

export function useYouTubeMappings(trackIds: string[]) {
  return useQuery({
    queryKey: ['youtube-mappings', trackIds.sort().join(',')],
    queryFn: async () => {
      if (trackIds.length === 0) return {};
      
      // Check cache first
      const uncachedIds = trackIds.filter(id => !youtubeMappingsCache.has(id));
      
      if (uncachedIds.length === 0) {
        // All in cache
        const result: Record<string, boolean> = {};
        trackIds.forEach(id => {
          result[id] = youtubeMappingsCache.get(id) || false;
        });
        return result;
      }
      
      // Fetch uncached
      const { data } = await supabase
        .from('youtube_track_mappings')
        .select('track_id')
        .in('track_id', uncachedIds);
      
      const mappedIds = new Set((data || []).map(m => m.track_id));
      
      // Update cache
      uncachedIds.forEach(id => {
        youtubeMappingsCache.set(id, mappedIds.has(id));
      });
      
      // Return all results
      const result: Record<string, boolean> = {};
      trackIds.forEach(id => {
        result[id] = youtubeMappingsCache.get(id) || false;
      });
      return result;
    },
    staleTime: 30000, // 30 seconds
    gcTime: 60000, // 1 minute
  });
}

export function useHasYouTubeMapping(trackId: string) {
  const { data } = useYouTubeMappings([trackId]);
  return data?.[trackId] || false;
}

// Invalidate cache for a specific track (call after saving a new mapping)
export function invalidateYouTubeMappingCache(trackId: string) {
  youtubeMappingsCache.delete(trackId);
}