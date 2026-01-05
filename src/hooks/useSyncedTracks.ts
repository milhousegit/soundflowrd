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

export const addSyncedTrack = (trackId: string) => {
  syncedTracksCache.add(trackId);
  syncingTracksCache.delete(trackId);
  notifyListeners();
};

export const useSyncedTracks = (trackIds?: string[]) => {
  const [syncedTracks, setSyncedTracks] = useState<Set<string>>(syncedTracksCache);
  const [syncingTracks, setSyncingTracks] = useState<Set<string>>(syncingTracksCache);
  const [isLoading, setIsLoading] = useState(false);

  // Subscribe to global state changes
  useEffect(() => {
    const listener = () => {
      setSyncedTracks(new Set(syncedTracksCache));
      setSyncingTracks(new Set(syncingTracksCache));
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
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

  return {
    syncedTracks,
    syncingTracks,
    isSynced,
    isSyncing,
    isLoading,
    refetch: fetchSyncedTracks,
  };
};

export default useSyncedTracks;
