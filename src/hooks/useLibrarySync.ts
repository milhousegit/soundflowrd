import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Track } from '@/types/music';
import { syncTrackInBackground } from '@/hooks/useSyncTrack';
import { getAlbum } from '@/lib/spotify';
import { toast } from 'sonner';

// Global state that persists across component mounts
let _isSyncing = false;
let _progress = { current: 0, total: 0 };
let _listeners: Set<() => void> = new Set();

const notify = () => _listeners.forEach(l => l());

export const getLibrarySyncState = () => ({
  isSyncing: _isSyncing,
  progress: { ..._progress },
});

export const startLibrarySync = async (userId: string, apiKey: string) => {
  if (_isSyncing) return;
  _isSyncing = true;
  _progress = { current: 0, total: 0 };
  notify();

  try {
    // Fetch favorite tracks
    const { data: favTracks } = await supabase
      .from('favorites')
      .select('item_id, item_title, item_artist, item_cover_url, item_data')
      .eq('user_id', userId)
      .eq('item_type', 'track');

    // Fetch favorite albums
    const { data: favAlbums } = await supabase
      .from('favorites')
      .select('item_id')
      .eq('user_id', userId)
      .eq('item_type', 'album');

    // Fetch user playlists
    const { data: playlists } = await supabase
      .from('playlists')
      .select('id')
      .eq('user_id', userId);

    // Build track list from direct favorites
    const trackIds = new Set<string>();
    const tracks: Track[] = [];

    for (const f of (favTracks || [])) {
      if (trackIds.has(f.item_id)) continue;
      trackIds.add(f.item_id);
      const data = f.item_data as Record<string, any> | null;
      tracks.push({
        id: f.item_id,
        title: f.item_title,
        artist: f.item_artist || '',
        coverUrl: f.item_cover_url || '',
        album: data?.album || '',
        albumId: data?.albumId || '',
        duration: data?.duration || 0,
      });
    }

    // Fetch tracks from favorite albums
    for (const fav of (favAlbums || [])) {
      try {
        const albumData = await getAlbum(fav.item_id);
        if (albumData?.tracks) {
          for (const tr of albumData.tracks) {
            if (!trackIds.has(tr.id)) {
              trackIds.add(tr.id);
              tracks.push({
                ...tr,
                artist: (tr as any).artist || albumData.artist,
                album: albumData.title,
                albumId: albumData.id,
                coverUrl: (tr as any).coverUrl || albumData.coverUrl,
              } as Track);
            }
          }
        }
      } catch (e) {
        console.error('[LibrarySync] Failed to fetch album:', fav.item_id, e);
      }
    }

    // Fetch tracks from user playlists
    for (const pl of (playlists || [])) {
      try {
        const { data: playlistTracks } = await supabase
          .from('playlist_tracks')
          .select('track_id, track_title, track_artist, track_album, track_album_id, track_cover_url, track_duration')
          .eq('playlist_id', pl.id);

        for (const pt of (playlistTracks || [])) {
          if (!trackIds.has(pt.track_id)) {
            trackIds.add(pt.track_id);
            tracks.push({
              id: pt.track_id,
              title: pt.track_title,
              artist: pt.track_artist,
              album: pt.track_album || '',
              albumId: pt.track_album_id || '',
              coverUrl: pt.track_cover_url || '',
              duration: pt.track_duration || 0,
            });
          }
        }
      } catch (e) {
        console.error('[LibrarySync] Failed to fetch playlist tracks:', pl.id, e);
      }
    }

    _progress = { current: 0, total: tracks.length };
    notify();

    toast.info(`Sincronizzazione libreria: ${tracks.length} brani...`);

    for (let i = 0; i < tracks.length; i++) {
      _progress = { current: i + 1, total: tracks.length };
      notify();
      await syncTrackInBackground(tracks[i], apiKey);
      await new Promise(r => setTimeout(r, 500));
    }

    toast.success(`Libreria sincronizzata! ${tracks.length} brani elaborati`);
  } catch (err) {
    console.error('[LibrarySync] Error:', err);
    toast.error('Errore sincronizzazione libreria');
  } finally {
    _isSyncing = false;
    _progress = { current: 0, total: 0 };
    notify();
  }
};

export const useLibrarySync = () => {
  const [isSyncing, setIsSyncing] = useState(_isSyncing);
  const [progress, setProgress] = useState({ ..._progress });

  useEffect(() => {
    const listener = () => {
      setIsSyncing(_isSyncing);
      setProgress({ ..._progress });
    };
    _listeners.add(listener);
    // Sync initial state
    listener();
    return () => { _listeners.delete(listener); };
  }, []);

  return { isSyncing, progress, startSync: startLibrarySync };
};
