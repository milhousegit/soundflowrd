import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Track } from '@/types/music';

const RECENTLY_PLAYED_KEY = 'recentlyPlayed';
const MAX_RECENT_TRACKS = 50;

export const useRecentlyPlayed = () => {
  const { user } = useAuth();
  const [recentTracks, setRecentTracks] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load recently played tracks
  const loadRecentTracks = useCallback(async () => {
    setIsLoading(true);
    try {
      if (user?.id) {
        // Load from database for logged-in users
        const { data, error } = await supabase
          .from('recently_played')
          .select('*')
          .eq('user_id', user.id)
          .order('played_at', { ascending: false })
          .limit(MAX_RECENT_TRACKS);

        if (error) {
          console.error('Failed to load recently played from DB:', error);
          // Fallback to localStorage
          const stored = localStorage.getItem(RECENTLY_PLAYED_KEY);
          setRecentTracks(stored ? JSON.parse(stored) : []);
        } else {
          // Transform DB records to Track format
          const tracks: Track[] = (data || []).map((record) => ({
            id: record.track_id,
            title: record.track_title,
            artist: record.track_artist,
            album: record.track_album || undefined,
            albumId: record.track_album_id || undefined,
            coverUrl: record.track_cover_url || undefined,
            duration: record.track_duration || 0,
            artistId: record.artist_id || undefined,
          }));
          setRecentTracks(tracks);
          
          // Sync to localStorage as backup
          localStorage.setItem(RECENTLY_PLAYED_KEY, JSON.stringify(tracks));
        }
      } else {
        // Load from localStorage for non-logged-in users
        const stored = localStorage.getItem(RECENTLY_PLAYED_KEY);
        setRecentTracks(stored ? JSON.parse(stored) : []);
      }
    } catch (error) {
      console.error('Failed to load recently played:', error);
      const stored = localStorage.getItem(RECENTLY_PLAYED_KEY);
      setRecentTracks(stored ? JSON.parse(stored) : []);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  // Save a track to recently played
  const saveRecentTrack = useCallback(async (track: Track) => {
    try {
      if (user?.id) {
        // Save to database with upsert (updates played_at if track exists)
        const { error } = await supabase
          .from('recently_played')
          .upsert(
            {
              user_id: user.id,
              track_id: track.id,
              track_title: track.title,
              track_artist: track.artist,
              track_album: track.album || null,
              track_album_id: track.albumId || null,
              track_cover_url: track.coverUrl || null,
              track_duration: track.duration || null,
              artist_id: track.artistId || null,
              played_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,track_id' }
          );

        if (error) {
          console.error('Failed to save recently played to DB:', error);
        }

        // Clean up old entries (keep only MAX_RECENT_TRACKS)
        const { data: allRecords } = await supabase
          .from('recently_played')
          .select('id, played_at')
          .eq('user_id', user.id)
          .order('played_at', { ascending: false });

        if (allRecords && allRecords.length > MAX_RECENT_TRACKS) {
          const idsToDelete = allRecords.slice(MAX_RECENT_TRACKS).map((r) => r.id);
          await supabase.from('recently_played').delete().in('id', idsToDelete);
        }
      }

      // Always update localStorage as fallback/backup
      const stored = localStorage.getItem(RECENTLY_PLAYED_KEY);
      const recent: Track[] = stored ? JSON.parse(stored) : [];
      const filtered = recent.filter((t) => t.id !== track.id);
      const updated = [track, ...filtered].slice(0, MAX_RECENT_TRACKS);
      localStorage.setItem(RECENTLY_PLAYED_KEY, JSON.stringify(updated));

      // Update local state
      setRecentTracks(updated);
    } catch (error) {
      console.error('Failed to save recently played:', error);
      
      // Fallback to localStorage only
      const stored = localStorage.getItem(RECENTLY_PLAYED_KEY);
      const recent: Track[] = stored ? JSON.parse(stored) : [];
      const filtered = recent.filter((t) => t.id !== track.id);
      const updated = [track, ...filtered].slice(0, MAX_RECENT_TRACKS);
      localStorage.setItem(RECENTLY_PLAYED_KEY, JSON.stringify(updated));
      setRecentTracks(updated);
    }
  }, [user?.id]);

  // Clear all recently played
  const clearRecentTracks = useCallback(async () => {
    try {
      if (user?.id) {
        await supabase.from('recently_played').delete().eq('user_id', user.id);
      }
      localStorage.removeItem(RECENTLY_PLAYED_KEY);
      setRecentTracks([]);
    } catch (error) {
      console.error('Failed to clear recently played:', error);
    }
  }, [user?.id]);

  // Migrate localStorage data to database on login
  const migrateLocalStorageToDb = useCallback(async () => {
    if (!user?.id) return;

    const stored = localStorage.getItem(RECENTLY_PLAYED_KEY);
    if (!stored) return;

    try {
      const tracks: Track[] = JSON.parse(stored);
      if (tracks.length === 0) return;

      // Upsert all tracks from localStorage to database
      const records = tracks.map((track, index) => ({
        user_id: user.id,
        track_id: track.id,
        track_title: track.title,
        track_artist: track.artist,
        track_album: track.album || null,
        track_album_id: track.albumId || null,
        track_cover_url: track.coverUrl || null,
        track_duration: track.duration || null,
        artist_id: track.artistId || null,
        // Set played_at based on position (first = most recent)
        played_at: new Date(Date.now() - index * 1000).toISOString(),
      }));

      await supabase.from('recently_played').upsert(records, {
        onConflict: 'user_id,track_id',
      });

      console.log('[useRecentlyPlayed] Migrated localStorage to database');
    } catch (error) {
      console.error('Failed to migrate localStorage to DB:', error);
    }
  }, [user?.id]);

  // Load tracks on mount and when user changes
  useEffect(() => {
    loadRecentTracks();
  }, [loadRecentTracks]);

  // Migrate localStorage to DB when user logs in
  useEffect(() => {
    if (user?.id) {
      migrateLocalStorageToDb();
    }
  }, [user?.id, migrateLocalStorageToDb]);

  return {
    recentTracks,
    isLoading,
    saveRecentTrack,
    clearRecentTracks,
    loadRecentTracks,
  };
};

// Standalone function for use in PlayerContext (doesn't need hook)
export const saveRecentlyPlayedTrack = async (track: Track, userId?: string) => {
  try {
    if (userId) {
      // Save to database
      await supabase.from('recently_played').upsert(
        {
          user_id: userId,
          track_id: track.id,
          track_title: track.title,
          track_artist: track.artist,
          track_album: track.album || null,
          track_album_id: track.albumId || null,
          track_cover_url: track.coverUrl || null,
          track_duration: track.duration || null,
          artist_id: track.artistId || null,
          played_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,track_id' }
      );
    }

    // Always update localStorage
    const stored = localStorage.getItem(RECENTLY_PLAYED_KEY);
    const recent: Track[] = stored ? JSON.parse(stored) : [];
    const filtered = recent.filter((t) => t.id !== track.id);
    const updated = [track, ...filtered].slice(0, MAX_RECENT_TRACKS);
    localStorage.setItem(RECENTLY_PLAYED_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error('Failed to save recently played:', error);
    
    // Fallback to localStorage
    const stored = localStorage.getItem(RECENTLY_PLAYED_KEY);
    const recent: Track[] = stored ? JSON.parse(stored) : [];
    const filtered = recent.filter((t) => t.id !== track.id);
    const updated = [track, ...filtered].slice(0, MAX_RECENT_TRACKS);
    localStorage.setItem(RECENTLY_PLAYED_KEY, JSON.stringify(updated));
  }
};
