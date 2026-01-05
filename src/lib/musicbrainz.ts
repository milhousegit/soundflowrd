import { supabase } from '@/integrations/supabase/client';
import { Track, Album, Artist } from '@/types/music';

export async function searchArtists(query: string): Promise<Artist[]> {
  const { data, error } = await supabase.functions.invoke('musicbrainz', {
    body: { action: 'search-artists', query, limit: 20 },
  });

  if (error) throw error;
  return data || [];
}

export async function searchAlbums(query: string): Promise<Album[]> {
  const { data, error } = await supabase.functions.invoke('musicbrainz', {
    body: { action: 'search-releases', query, limit: 20 },
  });

  if (error) throw error;
  return data || [];
}

export async function searchTracks(query: string): Promise<Track[]> {
  const { data, error } = await supabase.functions.invoke('musicbrainz', {
    body: { action: 'search-recordings', query, limit: 30 },
  });

  if (error) throw error;
  return (data || []).map((t: any) => ({
    ...t,
    album: t.album || 'Unknown Album',
  }));
}

export async function getArtist(id: string): Promise<Artist & { releases: Album[] }> {
  const { data, error } = await supabase.functions.invoke('musicbrainz', {
    body: { action: 'get-artist', id },
  });

  if (error) throw error;
  return data;
}

export async function getArtistTopTracks(id: string): Promise<Track[]> {
  const { data, error } = await supabase.functions.invoke('musicbrainz', {
    body: { action: 'get-artist-recordings', id, limit: 10 },
  });

  if (error) throw error;
  return data || [];
}

export async function getAlbum(id: string): Promise<Album & { tracks: Track[] }> {
  const { data, error } = await supabase.functions.invoke('musicbrainz', {
    body: { action: 'get-release', id },
  });

  if (error) throw error;
  return data;
}

export async function getNewReleases(country?: string): Promise<Album[]> {
  const { data, error } = await supabase.functions.invoke('musicbrainz', {
    body: { action: 'get-new-releases', country: country || 'IT', limit: 20 },
  });

  if (error) throw error;
  return data || [];
}

export async function getPopularArtists(country?: string): Promise<Artist[]> {
  const { data, error } = await supabase.functions.invoke('musicbrainz', {
    body: { action: 'get-popular-artists', country: country || 'IT', limit: 12 },
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
