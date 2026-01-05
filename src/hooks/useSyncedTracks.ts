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

export const removeSyncedTrack = (trackId: string) => {
  syncedTracksCache.delete(trackId);
  notifyListeners();
};

export const useSyncedTracks = (trackIds?: string[]) => {
  const [syncedTracks, setSyncedTracks] = useState<Set<string>>(syncedTracksCache);
  const [syncingTracks, setSyncingTracks] = useState<Set<string>>(syncingTracksCache);
  const [downloadingTracks, setDownloadingTracks] = useState<Set<string>>(downloadingTracksCache);
  const [isLoading, setIsLoading] = useState(false);

  // Subscribe to global state changes
  useEffect(() => {
    const listener = () => {
      setSyncedTracks(new Set(syncedTracksCache));
      setSyncingTracks(new Set(syncingTracksCache));
      setDownloadingTracks(new Set(downloadingTracksCache));
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
          event: 'INSERT',
          schema: 'public',
          table: 'track_file_mappings'
        },
        (payload) => {
          const trackId = payload.new.track_id;
          if (trackId) {
            syncedTracksCache.add(trackId);
            syncingTracksCache.delete(trackId);
            downloadingTracksCache.delete(trackId);
            notifyListeners();
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'track_file_mappings'
        },
        (payload) => {
          const trackId = payload.old.track_id;
          if (trackId) {
            syncedTracksCache.delete(trackId);
            notifyListeners();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Fetch synced tracks from database
  const fetchSyncedTracks = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('track_file_mappings')
        .select('track_id')
        .in('track_id', ids);

      if (!error && data) {
        data.forEach(item => {
          syncedTracksCache.add(item.track_id);
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

  return {
    syncedTracks,
    syncingTracks,
    downloadingTracks,
    isSynced,
    isSyncing,
    isDownloading,
    isLoading,
    refetch: fetchSyncedTracks,
  };
};

export default useSyncedTracks;
