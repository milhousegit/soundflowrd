import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Track } from '@/types/music';

export interface Playlist {
  id: string;
  name: string;
  description: string | null;
  cover_url: string | null;
  spotify_url: string | null;
  deezer_id: string | null;
  is_synced: boolean;
  track_count: number;
  created_at: string;
  updated_at: string;
}

export interface PlaylistTrack {
  id: string;
  playlist_id: string;
  track_id: string;
  track_title: string;
  track_artist: string;
  track_album: string | null;
  track_album_id: string | null;
  track_cover_url: string | null;
  track_duration: number;
  position: number;
  added_at: string;
}

export const usePlaylists = () => {
  const { user } = useAuth();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPlaylists = useCallback(async () => {
    if (!user) {
      setPlaylists([]);
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('playlists')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setPlaylists((data as Playlist[]) || []);
    } catch (error) {
      console.error('Error fetching playlists:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchPlaylists();
  }, [fetchPlaylists]);

  const createPlaylist = async (
    name: string,
    coverUrl?: string,
    description?: string,
    spotifyUrl?: string,
    deezerId?: string
  ): Promise<Playlist | null> => {
    if (!user) {
      toast.error('Devi essere loggato per creare una playlist');
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('playlists')
        .insert({
          user_id: user.id,
          name,
          cover_url: coverUrl || null,
          description: description || null,
          spotify_url: spotifyUrl || null,
          deezer_id: deezerId || null,
        })
        .select()
        .single();

      if (error) throw error;

      const playlist = data as Playlist;
      setPlaylists(prev => [playlist, ...prev]);
      return playlist;
    } catch (error) {
      console.error('Error creating playlist:', error);
      toast.error('Errore nella creazione della playlist');
      return null;
    }
  };

  const deletePlaylist = async (playlistId: string) => {
    try {
      const { error } = await supabase
        .from('playlists')
        .delete()
        .eq('id', playlistId);

      if (error) throw error;

      setPlaylists(prev => prev.filter(p => p.id !== playlistId));
      toast.success('Playlist eliminata');
    } catch (error) {
      console.error('Error deleting playlist:', error);
      toast.error('Errore eliminazione playlist');
    }
  };

  const updatePlaylist = async (
    playlistId: string,
    updates: { name?: string; cover_url?: string; description?: string }
  ) => {
    try {
      const { error } = await supabase
        .from('playlists')
        .update(updates)
        .eq('id', playlistId);

      if (error) throw error;

      setPlaylists(prev =>
        prev.map(p => (p.id === playlistId ? { ...p, ...updates } : p))
      );
    } catch (error) {
      console.error('Error updating playlist:', error);
      toast.error('Errore aggiornamento playlist');
    }
  };

  const addTrackToPlaylist = async (playlistId: string, track: Track) => {
    if (!user) return false;

    try {
      // Get current max position
      const { data: existingTracks } = await supabase
        .from('playlist_tracks')
        .select('position')
        .eq('playlist_id', playlistId)
        .order('position', { ascending: false })
        .limit(1);

      const nextPosition = existingTracks?.[0]?.position ?? -1;

      // Check if track already exists
      const { data: existing } = await supabase
        .from('playlist_tracks')
        .select('id')
        .eq('playlist_id', playlistId)
        .eq('track_id', track.id)
        .maybeSingle();

      if (existing) {
        toast.info('Traccia già presente nella playlist');
        return false;
      }

      const { error } = await supabase
        .from('playlist_tracks')
        .insert({
          playlist_id: playlistId,
          track_id: track.id,
          track_title: track.title,
          track_artist: track.artist,
          track_album: track.album || null,
          track_album_id: track.albumId || null,
          track_cover_url: track.coverUrl || null,
          track_duration: track.duration || 0,
          position: nextPosition + 1,
        });

      if (error) throw error;

      // Update track count
      await supabase
        .from('playlists')
        .update({ track_count: nextPosition + 2 })
        .eq('id', playlistId);

      // Update local state
      setPlaylists(prev =>
        prev.map(p =>
          p.id === playlistId ? { ...p, track_count: p.track_count + 1 } : p
        )
      );

      toast.success('Traccia aggiunta alla playlist');
      return true;
    } catch (error) {
      console.error('Error adding track to playlist:', error);
      toast.error('Errore aggiunta traccia');
      return false;
    }
  };

  const addTracksToPlaylist = async (playlistId: string, tracks: Track[]) => {
    if (!user || tracks.length === 0) return false;

    try {
      // Get current max position
      const { data: existingTracks } = await supabase
        .from('playlist_tracks')
        .select('position')
        .eq('playlist_id', playlistId)
        .order('position', { ascending: false })
        .limit(1);

      let nextPosition = (existingTracks?.[0]?.position ?? -1) + 1;

      const trackInserts = tracks.map((track, index) => ({
        playlist_id: playlistId,
        track_id: track.id,
        track_title: track.title,
        track_artist: track.artist,
        track_album: track.album || null,
        track_album_id: track.albumId || null,
        track_cover_url: track.coverUrl || null,
        track_duration: track.duration || 0,
        position: nextPosition + index,
      }));

      const { error } = await supabase
        .from('playlist_tracks')
        .insert(trackInserts);

      if (error) throw error;

      // Update track count
      await supabase
        .from('playlists')
        .update({ track_count: nextPosition + tracks.length })
        .eq('id', playlistId);

      // Update local state
      setPlaylists(prev =>
        prev.map(p =>
          p.id === playlistId
            ? { ...p, track_count: p.track_count + tracks.length }
            : p
        )
      );

      return true;
    } catch (error) {
      console.error('Error adding tracks to playlist:', error);
      return false;
    }
  };

  const getPlaylistTracks = async (playlistId: string): Promise<PlaylistTrack[]> => {
    try {
      const { data, error } = await supabase
        .from('playlist_tracks')
        .select('*')
        .eq('playlist_id', playlistId)
        .order('position', { ascending: true });

      if (error) throw error;
      return (data as PlaylistTrack[]) || [];
    } catch (error) {
      console.error('Error fetching playlist tracks:', error);
      return [];
    }
  };

  const removeTrackFromPlaylist = async (playlistId: string, trackId: string) => {
    try {
      const { error } = await supabase
        .from('playlist_tracks')
        .delete()
        .eq('playlist_id', playlistId)
        .eq('track_id', trackId);

      if (error) throw error;

      // Update track count
      const playlist = playlists.find(p => p.id === playlistId);
      if (playlist) {
        await supabase
          .from('playlists')
          .update({ track_count: Math.max(0, playlist.track_count - 1) })
          .eq('id', playlistId);

        setPlaylists(prev =>
          prev.map(p =>
            p.id === playlistId
              ? { ...p, track_count: Math.max(0, p.track_count - 1) }
              : p
          )
        );
      }

      toast.success('Traccia rimossa dalla playlist');
    } catch (error) {
      console.error('Error removing track:', error);
      toast.error('Errore rimozione traccia');
    }
  };

  return {
    playlists,
    isLoading,
    fetchPlaylists,
    createPlaylist,
    deletePlaylist,
    updatePlaylist,
    addTrackToPlaylist,
    addTracksToPlaylist,
    getPlaylistTracks,
    removeTrackFromPlaylist,
  };
};