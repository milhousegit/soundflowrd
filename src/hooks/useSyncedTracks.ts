import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface SyncedTrackInfo {
  trackId: string;
  albumMappingId: string;
  fileId: number;
}

// Global state for synced tracks
let syncedTracksCache: Set<string> = new Set();
let syncingTracksCache: Set<string> = new Set();
let downloadingTracksCache: Set<string> = new Set();
let youtubeSyncedTracksCache: Set<string> = new Set(); // Tracks synced via YouTube
let listeners: Set<() => void> = new Set();

const notifyListeners = () => {
  listeners.forEach(listener => listener());
};

export const addSyncingTrack = (trackId: string) => {
  syncingTracksCache.add(trackId);
  notifyListeners();
};

export const removeSyncingTrack = (trackId: string) => {
  syncingTracksCache.delete(trackId);
  notifyListeners();
};

export const addDownloadingTrack = (trackId: string) => {
  downloadingTracksCache.add(trackId);
  notifyListeners();
};

export const removeDownloadingTrack = (trackId: string) => {
  downloadingTracksCache.delete(trackId);
  notifyListeners();
};

export const addSyncedTrack = (trackId: string) => {
  syncedTracksCache.add(trackId);
  syncingTracksCache.delete(trackId);
  downloadingTracksCache.delete(trackId);
  notifyListeners();
};

export const addYouTubeSyncedTrack = (trackId: string) => {
  youtubeSyncedTracksCache.add(trackId);
  syncingTracksCache.delete(trackId);
  downloadingTracksCache.delete(trackId);
  notifyListeners();
};

export const removeSyncedTrack = (trackId: string) => {
  syncedTracksCache.delete(trackId);
  youtubeSyncedTracksCache.delete(trackId);
  notifyListeners();
};

export const useSyncedTracks = (trackIds?: string[]) => {
  const [syncedTracks, setSyncedTracks] = useState<Set<string>>(syncedTracksCache);
  const [syncingTracks, setSyncingTracks] = useState<Set<string>>(syncingTracksCache);
  const [downloadingTracks, setDownloadingTracks] = useState<Set<string>>(downloadingTracksCache);
  const [youtubeSyncedTracks, setYouTubeSyncedTracks] = useState<Set<string>>(youtubeSyncedTracksCache);
  const [isLoading, setIsLoading] = useState(false);

  // Subscribe to global state changes
  useEffect(() => {
    const listener = () => {
      setSyncedTracks(new Set(syncedTracksCache));
      setSyncingTracks(new Set(syncingTracksCache));
      setDownloadingTracks(new Set(downloadingTracksCache));
      setYouTubeSyncedTracks(new Set(youtubeSyncedTracksCache));
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  // Subscribe to realtime updates from database
  useEffect(() => {
    const channel = supabase
      .channel('track-sync-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'track_file_mappings'
        },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const trackId = payload.new.track_id;
            const directLink = payload.new.direct_link;
            if (trackId) {
              if (directLink) {
                // Has direct_link = fully synced
                syncedTracksCache.add(trackId);
                syncingTracksCache.delete(trackId);
                downloadingTracksCache.delete(trackId);
              } else {
                // No direct_link = downloading
                downloadingTracksCache.add(trackId);
                syncingTracksCache.delete(trackId);
              }
              notifyListeners();
            }
          } else if (payload.eventType === 'DELETE') {
            const trackId = payload.old.track_id;
            if (trackId) {
              syncedTracksCache.delete(trackId);
              downloadingTracksCache.delete(trackId);
              notifyListeners();
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Fetch synced tracks from database - only count as synced if direct_link exists
  const fetchSyncedTracks = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('track_file_mappings')
        .select('track_id, direct_link')
        .in('track_id', ids);

      if (!error && data) {
        data.forEach(item => {
          if (item.direct_link) {
            // Has direct_link = fully synced
            syncedTracksCache.add(item.track_id);
            downloadingTracksCache.delete(item.track_id);
          } else {
            // No direct_link = still downloading
            downloadingTracksCache.add(item.track_id);
          }
        });
        notifyListeners();
      }
    } catch (error) {
      console.error('Failed to fetch synced tracks:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch on mount if trackIds provided
  useEffect(() => {
    if (trackIds && trackIds.length > 0) {
      // Filter out already known synced tracks
      const unknownIds = trackIds.filter(id => !syncedTracksCache.has(id));
      if (unknownIds.length > 0) {
        fetchSyncedTracks(unknownIds);
      }
    }
  }, [trackIds?.join(','), fetchSyncedTracks]);

  const isSynced = useCallback((trackId: string) => {
    return syncedTracks.has(trackId);
  }, [syncedTracks]);

  const isSyncing = useCallback((trackId: string) => {
    return syncingTracks.has(trackId);
  }, [syncingTracks]);

  const isDownloading = useCallback((trackId: string) => {
    return downloadingTracks.has(trackId);
  }, [downloadingTracks]);

  const isYouTubeSynced = useCallback((trackId: string) => {
    return youtubeSyncedTracks.has(trackId);
  }, [youtubeSyncedTracks]);

  return {
    syncedTracks,
    syncingTracks,
    downloadingTracks,
    youtubeSyncedTracks,
    isSynced,
    isSyncing,
    isDownloading,
    isYouTubeSynced,
    isLoading,
    refetch: fetchSyncedTracks,
  };
};

export default useSyncedTracks;
