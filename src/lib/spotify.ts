import { supabase } from '@/integrations/supabase/client';
import { Track, Album, Artist } from '@/types/music';

// Cache for merged artists
let mergedArtistsCache: { merged_artist_id: string; master_artist_id: string }[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000;

async function getMergedArtists() {
  const now = Date.now();
  if (mergedArtistsCache && (now - cacheTimestamp) < CACHE_TTL) {
    return mergedArtistsCache;
  }
  const { data } = await supabase
    .from('artist_merges')
    .select('merged_artist_id, master_artist_id');
  mergedArtistsCache = (data as { merged_artist_id: string; master_artist_id: string }[]) || [];
  cacheTimestamp = now;
  return mergedArtistsCache;
}

async function filterMergedArtists(artists: Artist[]): Promise<Artist[]> {
  const merges = await getMergedArtists();
  const mergedIds = new Set(merges.map(m => m.merged_artist_id));
  return artists.filter(a => !mergedIds.has(a.id));
}

function replaceMergedArtistIds<T extends { artistId?: string }>(items: T[], merges: { merged_artist_id: string; master_artist_id: string }[]): T[] {
  return items.map(item => {
    const merge = merges.find(m => m.merged_artist_id === item.artistId);
    if (merge) return { ...item, artistId: merge.master_artist_id };
    return item;
  });
}

// Helper: invoke spotify-api edge function (now Deezer-primary)
async function apiInvoke(body: Record<string, any>): Promise<any> {
  try {
    const { data, error } = await supabase.functions.invoke('spotify-api', { body });
    if (error) throw error;
    return data;
  } catch (error) {
    console.error(`API error for action=${body.action}:`, error);
    throw error;
  }
}

async function resolveArtistId(id: string, artistName?: string): Promise<string | null> {
  const merges = await getMergedArtists();
  const mergeInfo = merges.find(m => m.merged_artist_id === id);
  const candidateId = mergeInfo?.master_artist_id || id;

  // Deezer IDs are numeric - pass through directly
  if (/^\d+$/.test(candidateId)) return candidateId;

  // Legacy Spotify IDs or unknown format - resolve by searching artist name
  if (!artistName?.trim()) return null;
  const results = await searchArtists(artistName);
  if (results.length === 0) return null;
  const normalized = artistName.trim().toLowerCase();
  return results.find(a => a.name.trim().toLowerCase() === normalized)?.id || results[0]?.id || null;
}

// ======================== SEARCH ========================

export async function searchArtists(query: string): Promise<Artist[]> {
  const data = await apiInvoke({ action: 'search-artists', query, limit: 10 });
  return filterMergedArtists(data || []);
}

export async function searchAlbums(query: string): Promise<Album[]> {
  const data = await apiInvoke({ action: 'search-albums', query, limit: 10 });
  const merges = await getMergedArtists();
  return replaceMergedArtistIds(data || [], merges);
}

export async function searchTracks(query: string): Promise<Track[]> {
  const data = await apiInvoke({ action: 'search-tracks', query, limit: 10 });
  const merges = await getMergedArtists();
  return replaceMergedArtistIds(data || [], merges);
}

export async function searchAll(query: string) {
  const [artists, albums, tracks] = await Promise.all([
    searchArtists(query).catch(() => []),
    searchAlbums(query).catch(() => []),
    searchTracks(query).catch(() => []),
  ]);
  return { artists, albums, tracks };
}

// ======================== GET SINGLE ========================

export async function getTrack(id: string): Promise<Track | null> {
  try {
    return await apiInvoke({ action: 'get-track', id });
  } catch {
    return null;
  }
}

export async function getAlbum(id: string): Promise<Album & { tracks: Track[] }> {
  return apiInvoke({ action: 'get-album', id });
}

export async function getArtist(id: string, artistName?: string): Promise<Artist & { releases: Album[]; topTracks: Track[]; relatedArtists: Artist[]; mergedFrom?: string[] }> {
  const resolvedId = await resolveArtistId(id, artistName);

  if (!resolvedId) {
    return {
      id,
      name: artistName || 'Unknown Artist',
      imageUrl: undefined,
      popularity: 0,
      genres: [],
      releases: [],
      topTracks: [],
      relatedArtists: [],
    };
  }

  const merges = await getMergedArtists();
  const mergeInfo = merges.find(m => m.merged_artist_id === resolvedId);
  if (mergeInfo) {
    return getArtist(mergeInfo.master_artist_id, artistName);
  }

  let data = await apiInvoke({ action: 'get-artist', id: resolvedId });

  if ((!data?.topTracks || data.topTracks.length === 0) && (data?.name || artistName)) {
    try {
      const fallbackTopTracks = await getArtistTopTracks(resolvedId, data?.name || artistName);
      if (fallbackTopTracks.length > 0) {
        data = { ...data, topTracks: fallbackTopTracks };
      }
    } catch { /* noop */ }
  }

  // Check for merged artists and combine content
  const mergedArtistIds = merges
    .filter(m => m.master_artist_id === resolvedId)
    .map(m => m.merged_artist_id);

  if (mergedArtistIds.length > 0) {
    const mergedData = await Promise.all(
      mergedArtistIds.map(async (mergedId) => {
        try {
          return await apiInvoke({ action: 'get-artist', id: mergedId });
        } catch { return null; }
      })
    );

    const allReleases = [...(data.releases || [])];
    const existingKeys = new Set(allReleases.map((r: any) => `${r.title.toLowerCase()}-${r.releaseDate?.split('-')[0] || ''}`));
    for (const merged of mergedData) {
      if (merged?.releases) {
        for (const release of merged.releases) {
          const key = `${release.title.toLowerCase()}-${release.releaseDate?.split('-')[0] || ''}`;
          if (!existingKeys.has(key)) { allReleases.push(release); existingKeys.add(key); }
        }
      }
    }

    const allTopTracks = [...(data.topTracks || [])];
    const existingTrackTitles = new Set(allTopTracks.map((t: any) => t.title.toLowerCase()));
    for (const merged of mergedData) {
      if (merged?.topTracks) {
        for (const track of merged.topTracks) {
          if (!existingTrackTitles.has(track.title.toLowerCase())) {
            allTopTracks.push(track);
            existingTrackTitles.add(track.title.toLowerCase());
          }
        }
      }
    }

    return {
      ...data,
      releases: allReleases,
      topTracks: allTopTracks.slice(0, 20),
      mergedFrom: mergedArtistIds,
    };
  }

  return data;
}

export async function getArtistTopTracks(id: string, artistName?: string): Promise<Track[]> {
  const resolvedId = await resolveArtistId(id, artistName);
  if (!resolvedId) return [];
  try {
    return (await apiInvoke({ action: 'get-artist-top', id: resolvedId, limit: 10 })) || [];
  } catch {
    return [];
  }
}

// ======================== CHARTS & BROWSE ========================

export async function getChart(): Promise<{ tracks: Track[]; albums: Album[]; artists: Artist[] }> {
  return apiInvoke({ action: 'get-chart', limit: 10 });
}

export async function getNewReleases(): Promise<Album[]> {
  return (await apiInvoke({ action: 'get-new-releases', limit: 10 })) || [];
}

export async function getTrendingChart(): Promise<{ tracks: Track[]; albums: Album[] }> {
  const data = await apiInvoke({ action: 'get-chart', limit: 10 });
  return { tracks: data?.tracks || [], albums: data?.albums || [] };
}

export async function getPopularArtists(): Promise<Artist[]> {
  return (await apiInvoke({ action: 'get-popular-artists', limit: 10 })) || [];
}

export async function getCountryChart(country: string): Promise<Track[]> {
  return (await apiInvoke({ action: 'get-country-chart', country, limit: 10 })) || [];
}

// ======================== PLAYLISTS ========================

export interface SpotifyPlaylist {
  id: string;
  title: string;
  description?: string;
  coverUrl?: string;
  trackCount: number;
  creator?: string;
  isSpotifyPlaylist?: boolean;
  isDeezerPlaylist?: boolean;
}

export type DeezerPlaylist = SpotifyPlaylist;

export async function searchSpotifyPlaylists(query: string): Promise<SpotifyPlaylist[]> {
  return (await apiInvoke({ action: 'search-playlists', query, limit: 10 })) || [];
}

export async function searchLocalPlaylists(query: string): Promise<SpotifyPlaylist[]> {
  const normalizedQuery = query.toLowerCase().trim();
  const { data, error } = await supabase
    .from('playlists')
    .select('id, name, description, cover_url, track_count')
    .eq('is_public', true)
    .ilike('name', `%${normalizedQuery}%`)
    .limit(10);

  if (error) return [];

  return (data || []).map(p => ({
    id: p.id,
    title: p.name,
    description: p.description || undefined,
    coverUrl: p.cover_url || undefined,
    trackCount: p.track_count || 0,
    creator: 'Utente',
    isSpotifyPlaylist: false,
  }));
}

export async function searchPlaylists(query: string): Promise<SpotifyPlaylist[]> {
  const [localPlaylists, deezerPlaylists] = await Promise.all([
    searchLocalPlaylists(query).catch(() => []),
    searchSpotifyPlaylists(query).catch(() => []),
  ]);
  return [...localPlaylists, ...deezerPlaylists];
}

export async function getSpotifyPlaylist(id: string): Promise<SpotifyPlaylist & { tracks: Track[] }> {
  return apiInvoke({ action: 'get-playlist', id });
}

export async function getArtistPlaylists(artistName: string, artistId?: string): Promise<SpotifyPlaylist[]> {
  const data = await apiInvoke({ action: 'get-artist-playlists', query: artistName });
  let playlists: SpotifyPlaylist[] = data || [];

  if (artistId) {
    const merges = await getMergedArtists();
    const mergedArtists = merges.filter(m => m.master_artist_id === artistId);

    if (mergedArtists.length > 0) {
      const { data: mergeData } = await supabase
        .from('artist_merges')
        .select('merged_artist_name')
        .eq('master_artist_id', artistId);

      const mergedNames = (mergeData as { merged_artist_name: string }[] || []).map(m => m.merged_artist_name);
      const existingIds = new Set(playlists.map(p => p.id));

      for (const mergedName of mergedNames) {
        try {
          const mergedPlaylists = await apiInvoke({ action: 'get-artist-playlists', query: mergedName });
          for (const playlist of (mergedPlaylists || [])) {
            if (!existingIds.has(playlist.id)) {
              playlists.push(playlist);
              existingIds.add(playlist.id);
            }
          }
        } catch { /* skip */ }
      }
    }
  }

  return playlists;
}

// ======================== RECOMMENDATIONS ========================

export async function getTrackRadio(trackId: string): Promise<Track[]> {
  return (await apiInvoke({ action: 'get-track-radio', id: trackId, limit: 50 })) || [];
}

// ======================== ARTIST ALBUMS ========================

export async function getArtistAlbums(artistId: string, limit = 50): Promise<Album[]> {
  return (await apiInvoke({ action: 'get-artist-albums', id: artistId, limit })) || [];
}

// ======================== BACKWARD-COMPAT ALIASES ========================

export const getDeezerPlaylist = getSpotifyPlaylist;
export const searchDeezerPlaylists = searchSpotifyPlaylists;
