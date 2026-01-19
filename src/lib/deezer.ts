import { supabase } from '@/integrations/supabase/client';
import { Track, Album, Artist } from '@/types/music';

// Cache for merged artists
let mergedArtistsCache: { merged_artist_id: string; master_artist_id: string }[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

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

// Filter out merged artists from search results
async function filterMergedArtists(artists: Artist[]): Promise<Artist[]> {
  const merges = await getMergedArtists();
  const mergedIds = new Set(merges.map(m => m.merged_artist_id));
  return artists.filter(a => !mergedIds.has(a.id));
}

export async function searchArtists(query: string): Promise<Artist[]> {
  const { data, error } = await supabase.functions.invoke('deezer', {
    body: { action: 'search-artists', query, limit: 20 },
  });

  if (error) throw error;
  
  // Filter out merged artists
  const artists = data || [];
  return filterMergedArtists(artists);
}

export async function searchAlbums(query: string): Promise<Album[]> {
  const { data, error } = await supabase.functions.invoke('deezer', {
    body: { action: 'search-albums', query, limit: 20 },
  });

  if (error) throw error;
  
  // Replace merged artist names/IDs with master artist
  const merges = await getMergedArtists();
  const albums = (data || []).map((album: Album) => {
    const merge = merges.find(m => m.merged_artist_id === album.artistId);
    if (merge) {
      // Get master info from cache - we already have it loaded
      const masterMerge = merges.find(m => m.master_artist_id === merge.master_artist_id);
      return { 
        ...album, 
        artistId: merge.master_artist_id,
        // Keep original artist name as we don't have master name in this cache
      };
    }
    return album;
  });
  
  return albums;
}

export async function searchTracks(query: string): Promise<Track[]> {
  const { data, error } = await supabase.functions.invoke('deezer', {
    body: { action: 'search-tracks', query, limit: 30 },
  });

  if (error) throw error;
  
  // Replace merged artist IDs with master artist IDs
  const merges = await getMergedArtists();
  const tracks = (data || []).map((track: Track) => {
    const merge = merges.find(m => m.merged_artist_id === track.artistId);
    if (merge) {
      return { 
        ...track, 
        artistId: merge.master_artist_id,
      };
    }
    return track;
  });
  
  return tracks;
}

export async function getTrack(id: string): Promise<Track | null> {
  const { data, error } = await supabase.functions.invoke('deezer', {
    body: { action: 'get-track', id },
  });

  if (error) return null;
  return data || null;
}

export async function getArtist(id: string): Promise<Artist & { releases: Album[]; topTracks: Track[]; relatedArtists: Artist[]; mergedFrom?: string[] }> {
  // Check if this artist has been merged into another
  const merges = await getMergedArtists();
  const mergeInfo = merges.find(m => m.merged_artist_id === id);
  
  if (mergeInfo) {
    // Redirect to master artist
    const masterData = await getArtist(mergeInfo.master_artist_id);
    return masterData;
  }
  
  const { data, error } = await supabase.functions.invoke('deezer', {
    body: { action: 'get-artist', id },
  });

  if (error) throw error;
  
  // Check if this master has any merged artists
  const mergedArtistIds = merges
    .filter(m => m.master_artist_id === id)
    .map(m => m.merged_artist_id);
  
  if (mergedArtistIds.length > 0) {
    // Merge content from merged artists
    const mergedData = await Promise.all(
      mergedArtistIds.map(async (mergedId) => {
        try {
          const { data: merged } = await supabase.functions.invoke('deezer', {
            body: { action: 'get-artist', id: mergedId },
          });
          return merged;
        } catch {
          return null;
        }
      })
    );
    
    // Combine releases, removing duplicates by title+year
    const allReleases = [...(data.releases || [])];
    const existingKeys = new Set(allReleases.map(r => `${r.title.toLowerCase()}-${r.releaseDate?.split('-')[0] || ''}`));
    
    for (const merged of mergedData) {
      if (merged?.releases) {
        for (const release of merged.releases) {
          const key = `${release.title.toLowerCase()}-${release.releaseDate?.split('-')[0] || ''}`;
          if (!existingKeys.has(key)) {
            allReleases.push(release);
            existingKeys.add(key);
          }
        }
      }
    }
    
    // Combine top tracks, removing duplicates by title
    const allTopTracks = [...(data.topTracks || [])];
    const existingTrackTitles = new Set(allTopTracks.map(t => t.title.toLowerCase()));
    
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

export async function getArtistPlaylists(artistName: string, artistId?: string): Promise<DeezerPlaylist[]> {
  const { data, error } = await supabase.functions.invoke('deezer', {
    body: { action: 'get-artist-playlists', query: artistName },
  });

  if (error) throw error;
  
  let playlists: DeezerPlaylist[] = data || [];
  
  // If artistId is provided, check for merged artists and fetch their playlists too
  if (artistId) {
    const merges = await getMergedArtists();
    const mergedArtists = merges.filter(m => m.master_artist_id === artistId);
    
    if (mergedArtists.length > 0) {
      // Get merged artist names from the merges table
      const { data: mergeData } = await supabase
        .from('artist_merges')
        .select('merged_artist_name')
        .eq('master_artist_id', artistId);
      
      const mergedNames = (mergeData as { merged_artist_name: string }[] || []).map(m => m.merged_artist_name);
      
      // Fetch playlists for each merged artist
      for (const mergedName of mergedNames) {
        try {
          const { data: mergedPlaylists } = await supabase.functions.invoke('deezer', {
            body: { action: 'get-artist-playlists', query: mergedName },
          });
          
          if (mergedPlaylists?.length) {
            // Add unique playlists (by ID)
            const existingIds = new Set(playlists.map(p => p.id));
            for (const playlist of mergedPlaylists) {
              if (!existingIds.has(playlist.id)) {
                playlists.push(playlist);
                existingIds.add(playlist.id);
              }
            }
          }
        } catch (e) {
          console.error(`Failed to fetch playlists for merged artist ${mergedName}:`, e);
        }
      }
    }
  }
  
  return playlists;
}

export async function getCountryChart(country: string): Promise<Track[]> {
  const { data, error } = await supabase.functions.invoke('deezer', {
    body: { action: 'get-country-chart', country, limit: 20 },
  });

  if (error) throw error;
  return data || [];
}

