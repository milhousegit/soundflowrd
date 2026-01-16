import { supabase } from '@/integrations/supabase/client';
import { Track } from '@/types/music';
import { DeezerPlaylist } from './deezer';

export interface YouTubePlaylist extends Omit<DeezerPlaylist, 'isDeezerPlaylist'> {
  source: 'youtube';
}

export interface YouTubeTrack {
  id: string;
  title: string;
  artist: string;
  artistId?: string;
  album: string;
  albumId?: string;
  duration: number;
  coverUrl?: string;
}

// Search playlists on YouTube Music
export async function searchYouTubePlaylists(query: string): Promise<DeezerPlaylist[]> {
  try {
    const { data, error } = await supabase.functions.invoke('youtube-music', {
      body: { action: 'search-playlists', query },
    });

    if (error) {
      console.error('YouTube Music search error:', error);
      return [];
    }

    // Transform to DeezerPlaylist format with source
    return (data || []).map((p: YouTubePlaylist) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      coverUrl: p.coverUrl,
      trackCount: p.trackCount,
      creator: p.creator || 'YouTube Music',
      isDeezerPlaylist: false, // Not a Deezer playlist
      source: 'youtube' as const,
    }));
  } catch (error) {
    console.error('YouTube Music search error:', error);
    return [];
  }
}

// Get artist-related playlists from YouTube Music
export async function getYouTubeArtistPlaylists(artistName: string): Promise<DeezerPlaylist[]> {
  try {
    const { data, error } = await supabase.functions.invoke('youtube-music', {
      body: { action: 'get-artist-playlists', artistName },
    });

    if (error) {
      console.error('YouTube Music artist playlists error:', error);
      return [];
    }

    // Transform to DeezerPlaylist format with source
    return (data || []).map((p: YouTubePlaylist) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      coverUrl: p.coverUrl,
      trackCount: p.trackCount,
      creator: p.creator || 'YouTube Music',
      isDeezerPlaylist: false,
      source: 'youtube' as const,
    }));
  } catch (error) {
    console.error('YouTube Music artist playlists error:', error);
    return [];
  }
}

// Get YouTube Music playlist details and tracks
export async function getYouTubePlaylist(playlistId: string): Promise<{
  playlist: DeezerPlaylist & { source: 'youtube' };
  tracks: Track[];
} | null> {
  try {
    const { data, error } = await supabase.functions.invoke('youtube-music', {
      body: { action: 'get-playlist', playlistId },
    });

    if (error || !data) {
      console.error('YouTube Music get playlist error:', error);
      return null;
    }

    const { playlist, tracks } = data;

    // Transform tracks to Track format
    const transformedTracks: Track[] = (tracks || []).map((t: YouTubeTrack) => ({
      id: `yt-${t.id}`, // Prefix with yt- to distinguish from Deezer IDs
      title: t.title,
      artist: t.artist,
      artistId: t.artistId,
      album: t.album || '',
      albumId: t.albumId,
      duration: t.duration,
      coverUrl: t.coverUrl,
      // YouTube tracks need special handling for streaming
      streamUrl: undefined, // Will be resolved when playing
    }));

    return {
      playlist: {
        id: playlist.id,
        title: playlist.title,
        description: playlist.description,
        coverUrl: playlist.coverUrl,
        trackCount: playlist.trackCount,
        creator: playlist.creator || 'YouTube Music',
        isDeezerPlaylist: false,
        source: 'youtube' as const,
      },
      tracks: transformedTracks,
    };
  } catch (error) {
    console.error('YouTube Music get playlist error:', error);
    return null;
  }
}
