import { supabase } from '@/integrations/supabase/client';
import { Track, Album, Artist } from '@/types/music';

export async function searchArtists(query: string): Promise<Artist[]> {
  const { data, error } = await supabase.functions.invoke('deezer', {
    body: { action: 'search-artists', query, limit: 20 },
  });

  if (error) throw error;
  return data || [];
}

export async function searchAlbums(query: string): Promise<Album[]> {
  const { data, error } = await supabase.functions.invoke('deezer', {
    body: { action: 'search-albums', query, limit: 20 },
  });

  if (error) throw error;
  return data || [];
}

export async function searchTracks(query: string): Promise<Track[]> {
  const { data, error } = await supabase.functions.invoke('deezer', {
    body: { action: 'search-tracks', query, limit: 30 },
  });

  if (error) throw error;
  return data || [];
}

export async function getTrack(id: string): Promise<Track | null> {
  const { data, error } = await supabase.functions.invoke('deezer', {
    body: { action: 'get-track', id },
  });

  if (error) return null;
  return data || null;
}

export async function getArtist(id: string): Promise<Artist & { releases: Album[]; topTracks: Track[]; relatedArtists: Artist[] }> {
  const { data, error } = await supabase.functions.invoke('deezer', {
    body: { action: 'get-artist', id },
  });

  if (error) throw error;
  return data;
}

export async function getArtistTopTracks(id: string): Promise<Track[]> {
  const { data, error } = await supabase.functions.invoke('deezer', {
    body: { action: 'get-artist-top', id, limit: 10 },
  });

  if (error) throw error;
  return data || [];
}

export async function getAlbum(id: string): Promise<Album & { tracks: Track[] }> {
  const { data, error } = await supabase.functions.invoke('deezer', {
    body: { action: 'get-album', id },
  });

  if (error) throw error;
  return data;
}

export async function getChart(): Promise<{ tracks: Track[]; albums: Album[]; artists: Artist[] }> {
  const { data, error } = await supabase.functions.invoke('deezer', {
    body: { action: 'get-chart', limit: 20 },
  });

  if (error) throw error;
  return data;
}

export async function getNewReleases(): Promise<Album[]> {
  const { data, error } = await supabase.functions.invoke('deezer', {
    body: { action: 'get-new-releases', limit: 20 },
  });

  if (error) throw error;
  return data || [];
}

export async function getPopularArtists(): Promise<Artist[]> {
  const { data, error } = await supabase.functions.invoke('deezer', {
    body: { action: 'get-popular-artists', limit: 12 },
  });

  if (error) throw error;
  return data || [];
}

export async function searchAll(query: string) {
  const [artists, albums, tracks] = await Promise.all([
    searchArtists(query).catch(() => []),
    searchAlbums(query).catch(() => []),
    searchTracks(query).catch(() => []),
  ]);

  return { artists, albums, tracks };
}

export interface DeezerPlaylist {
  id: string;
  title: string;
  description?: string;
  coverUrl?: string;
  trackCount: number;
  creator?: string;
  isDeezerPlaylist?: boolean;
}

export async function searchDeezerPlaylists(query: string): Promise<DeezerPlaylist[]> {
  const { data, error } = await supabase.functions.invoke('deezer', {
    body: { action: 'search-playlists', query, limit: 20 },
  });

  if (error) throw error;
  return data || [];
}

// Search public playlists from local database
export async function searchLocalPlaylists(query: string): Promise<DeezerPlaylist[]> {
  const normalizedQuery = query.toLowerCase().trim();
  
  const { data, error } = await supabase
    .from('playlists')
    .select('id, name, description, cover_url, track_count')
    .eq('is_public', true)
    .ilike('name', `%${normalizedQuery}%`)
    .limit(10);

  if (error) {
    console.error('Error searching local playlists:', error);
    return [];
  }

  return (data || []).map(p => ({
    id: p.id,
    title: p.name,
    description: p.description || undefined,
    coverUrl: p.cover_url || undefined,
    trackCount: p.track_count || 0,
    creator: 'Utente',
    isDeezerPlaylist: false,
  }));
}

// Combined search: local public playlists + Deezer playlists
export async function searchPlaylists(query: string): Promise<DeezerPlaylist[]> {
  const [localPlaylists, deezerPlaylists] = await Promise.all([
    searchLocalPlaylists(query).catch(() => []),
    searchDeezerPlaylists(query).catch(() => []),
  ]);

  // Local playlists first, then Deezer ones
  return [...localPlaylists, ...deezerPlaylists];
}

export async function getDeezerPlaylist(id: string): Promise<DeezerPlaylist & { tracks: Track[] }> {
  const { data, error } = await supabase.functions.invoke('deezer', {
    body: { action: 'get-playlist', id },
  });

  if (error) throw error;
  return data;
}

export async function getArtistPlaylists(artistName: string): Promise<DeezerPlaylist[]> {
  const { data, error } = await supabase.functions.invoke('deezer', {
    body: { action: 'get-artist-playlists', query: artistName },
  });

  if (error) throw error;
  return data || [];
}

export async function getCountryChart(country: string): Promise<Track[]> {
  const { data, error } = await supabase.functions.invoke('deezer', {
    body: { action: 'get-country-chart', country, limit: 20 },
  });

  if (error) throw error;
  return data || [];
}
