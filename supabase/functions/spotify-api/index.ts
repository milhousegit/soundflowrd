import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SPOTIFY_API = 'https://api.spotify.com/v1';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';

// In-memory token cache
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt - 60_000) {
    return cachedToken;
  }

  const clientId = Deno.env.get('SPOTIFY_CLIENT_ID');
  const clientSecret = Deno.env.get('SPOTIFY_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    throw new Error('Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET');
  }

  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token request failed ${res.status}: ${text}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = now + data.expires_in * 1000;
  console.log('Spotify token refreshed, expires in', data.expires_in, 's');
  return cachedToken!;
}

async function spotifyFetch(path: string, retries = 2): Promise<any> {
  for (let i = 0; i <= retries; i++) {
    const token = await getAccessToken();
    const res = await fetch(`${SPOTIFY_API}${path}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (res.status === 401 && i < retries) {
      // Token expired, force refresh
      cachedToken = null;
      tokenExpiresAt = 0;
      continue;
    }

    if (res.status === 429) {
      const retryAfter = Math.min(parseInt(res.headers.get('Retry-After') || '2'), 10);
      console.log(`Rate limited, waiting ${retryAfter}s`);
      await new Promise(r => setTimeout(r, retryAfter * 1000));
      continue;
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Spotify API ${res.status}: ${text.substring(0, 200)}`);
    }

    return await res.json();
  }
  throw new Error('Max retries exceeded');
}

async function spotifyFetchOptional<T>(path: string, fallback: T, label: string): Promise<T> {
  try {
    return await spotifyFetch(path);
  } catch (error) {
    console.warn(`Spotify optional endpoint failed for ${label}:`, error);
    return fallback;
  }
}

// Helpers to get best image
function bestImage(images: any[]): string | undefined {
  if (!images || images.length === 0) return undefined;
  // Prefer 640px, then largest available
  const sorted = [...images].sort((a, b) => (b.width || 0) - (a.width || 0));
  return sorted[0]?.url;
}

function mediumImage(images: any[]): string | undefined {
  if (!images || images.length === 0) return undefined;
  // Prefer ~300px for cards
  const medium = images.find(i => i.width && i.width >= 250 && i.width <= 400);
  if (medium) return medium.url;
  const sorted = [...images].sort((a, b) => (b.width || 0) - (a.width || 0));
  return sorted[0]?.url;
}

function mapTrack(track: any, albumOverride?: any): any {
  const album = albumOverride || track.album;
  return {
    id: track.id,
    title: track.name,
    artist: track.artists?.map((a: any) => a.name).join(', ') || 'Unknown Artist',
    artistId: track.artists?.[0]?.id || '',
    album: album?.name || 'Unknown Album',
    albumId: album?.id || '',
    duration: Math.round((track.duration_ms || 0) / 1000),
    coverUrl: bestImage(album?.images),
    previewUrl: track.preview_url || undefined,
  };
}

function mapAlbum(album: any): any {
  return {
    id: album.id,
    title: album.name,
    artist: album.artists?.map((a: any) => a.name).join(', ') || 'Unknown Artist',
    artistId: album.artists?.[0]?.id || '',
    coverUrl: bestImage(album.images),
    releaseDate: album.release_date || undefined,
    trackCount: album.total_tracks || undefined,
    recordType: album.album_type || 'album',
  };
}

function mapArtist(artist: any): any {
  return {
    id: artist.id,
    name: artist.name,
    imageUrl: bestImage(artist.images),
    popularity: artist.popularity || artist.followers?.total || 0,
    genres: artist.genres || [],
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, query, id, limit: rawLimit = 10, country, market } = await req.json();
    const mkt = market || country || 'US';
    // Spotify Client Credentials search is capped at 10
    const limit = Math.min(Number(rawLimit) || 10, 10);

    console.log(`Spotify request: action=${action}, query=${query}, id=${id}, market=${mkt}`);

    switch (action) {
      // ======================== SEARCH ========================
      case 'search-tracks': {
        const data = await spotifyFetch(
          `/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}&market=${mkt}`
        );
        const tracks = (data.tracks?.items || []).map((t: any) => mapTrack(t));
        return json(tracks);
      }

      case 'search-albums': {
        const data = await spotifyFetch(
          `/search?q=${encodeURIComponent(query)}&type=album&limit=${limit}&market=${mkt}`
        );
        const albums = (data.albums?.items || []).map((a: any) => mapAlbum(a));
        return json(albums);
      }

      case 'search-artists': {
        const data = await spotifyFetch(
          `/search?q=${encodeURIComponent(query)}&type=artist&limit=${limit}&market=${mkt}`
        );
        const artists = (data.artists?.items || []).map((a: any) => mapArtist(a));
        return json(artists);
      }

      case 'search-playlists': {
        const data = await spotifyFetch(
          `/search?q=${encodeURIComponent(query)}&type=playlist&limit=${limit}&market=${mkt}`
        );
        const playlists = (data.playlists?.items || []).filter(Boolean).map((p: any) => ({
          id: p.id,
          title: p.name,
          description: p.description || '',
          coverUrl: bestImage(p.images),
          trackCount: p.tracks?.total || 0,
          creator: p.owner?.display_name || 'Spotify',
          isSpotifyPlaylist: true,
        }));
        return json(playlists);
      }

      // ======================== GET SINGLE ========================
      case 'get-track': {
        const data = await spotifyFetch(`/tracks/${id}?market=${mkt}`);
        return json(mapTrack(data));
      }

      case 'get-album': {
        const data = await spotifyFetch(`/albums/${id}?market=${mkt}`);
        const album = {
          ...mapAlbum(data),
          tracks: (data.tracks?.items || []).map((track: any, index: number) => ({
            ...mapTrack(track, data),
            trackNumber: index + 1,
          })),
        };
        return json(album);
      }

      case 'get-artist': {
        if (!/^[a-zA-Z0-9]{22}$/.test(String(id || ''))) {
          return json({
            id: String(id || ''),
            name: 'Unknown Artist',
            imageUrl: undefined,
            popularity: 0,
            genres: [],
            releases: [],
            topTracks: [],
            relatedArtists: [],
            error: true,
          });
        }

        const artistData = await spotifyFetch(`/artists/${id}`);
        const [albumsData, topData, relatedData] = await Promise.all([
          spotifyFetchOptional(
            `/artists/${id}/albums?include_groups=album,single&limit=50&market=${mkt}`,
            { items: [] },
            `artist albums ${id}`,
          ),
          spotifyFetchOptional(
            `/artists/${id}/top-tracks?market=${mkt}`,
            { tracks: [] },
            `artist top tracks ${id}`,
          ),
          spotifyFetchOptional(
            `/artists/${id}/related-artists`,
            { artists: [] },
            `artist related artists ${id}`,
          ),
        ]);

        const artist = {
          ...mapArtist(artistData),
          releases: (albumsData.items || []).map((a: any) => mapAlbum(a)),
          topTracks: (topData.tracks || []).map((t: any) => mapTrack(t)),
          relatedArtists: (relatedData.artists || []).slice(0, 10).map((a: any) => mapArtist(a)),
        };
        return json(artist);
      }

      case 'get-artist-top': {
        if (!/^[a-zA-Z0-9]{22}$/.test(String(id || ''))) {
          return json([]);
        }

        const data = await spotifyFetch(`/artists/${id}/top-tracks?market=${mkt}`).catch(() => ({ tracks: [] }));
        const tracks = (data.tracks || []).slice(0, limit).map((t: any) => mapTrack(t));
        return json(tracks);
      }

      // ======================== PLAYLISTS ========================
      case 'get-playlist': {
        try {
          const data = await spotifyFetch(`/playlists/${id}?market=${mkt}`);
          const playlist = {
            id: data.id,
            title: data.name,
            description: data.description || '',
            coverUrl: bestImage(data.images),
            trackCount: data.tracks?.total || 0,
            creator: data.owner?.display_name || 'Spotify',
            duration: 0,
            tracks: (data.tracks?.items || [])
              .filter((item: any) => item.track)
              .map((item: any, index: number) => ({
                ...mapTrack(item.track),
                trackNumber: index + 1,
              })),
          };
          return json(playlist);
        } catch (error) {
          console.error(`Error fetching playlist ${id}:`, error);
          return json({
            id: String(id),
            title: '',
            description: '',
            coverUrl: null,
            trackCount: 0,
            creator: '',
            duration: 0,
            tracks: [],
            error: true,
          });
        }
      }

      case 'get-artist-playlists': {
        // Search for curated playlists related to an artist
        const artistName = query;
        const searchQueries = [
          `This Is ${artistName}`,
          `${artistName} Radio`,
          `Best of ${artistName}`,
          artistName,
        ];

        const allPlaylists: any[] = [];
        const seenIds = new Set<string>();

        for (const q of searchQueries) {
          try {
            const data = await spotifyFetch(
              `/search?q=${encodeURIComponent(q)}&type=playlist&limit=5&market=${mkt}`
            );

            for (const p of (data.playlists?.items || [])) {
              if (!p || seenIds.has(p.id)) continue;
              const title = p.name?.toLowerCase() || '';
              const artistLower = artistName.toLowerCase();
              if (
                title.includes(artistLower) ||
                title.includes('this is') ||
                title.includes('radio') ||
                title.includes('best of')
              ) {
                seenIds.add(p.id);
                allPlaylists.push({
                  id: p.id,
                  title: p.name,
                  description: p.description || '',
                  coverUrl: bestImage(p.images),
                  trackCount: p.tracks?.total || 0,
                  creator: p.owner?.display_name || 'Spotify',
                  isSpotifyPlaylist: true,
                });
              }
            }
          } catch (e) {
            console.error(`Error searching playlists for "${q}":`, e);
          }
        }

        return json(allPlaylists.slice(0, 6));
      }

      // ======================== BROWSE / CHARTS ========================
      case 'get-chart': {
        // Use search-based approaches since browse endpoints are restricted
        const [newReleasesSearch, topTracksSearch] = await Promise.all([
          spotifyFetch(`/search?q=tag:new&type=album&limit=${limit}&market=${mkt}`).catch(() => ({ albums: { items: [] } })),
          spotifyFetch(`/search?q=year:2026&type=track&limit=${limit}&market=${mkt}`).catch(() => ({ tracks: { items: [] } })),
        ]);

        const chartTracks = (topTracksSearch.tracks?.items || []).map((t: any) => mapTrack(t));
        const albums = (newReleasesSearch.albums?.items || []).map((a: any) => mapAlbum(a));

        return json({
          tracks: chartTracks,
          albums,
          artists: [],
        });
      }

      case 'get-new-releases': {
        // /browse/new-releases is restricted with client credentials, use search with tag:new
        try {
          const data = await spotifyFetch(`/search?q=tag:new&type=album&limit=${limit}&market=${mkt}`);
          const albums = (data.albums?.items || []).map((a: any) => mapAlbum(a));
          return json(albums);
        } catch {
          return json([]);
        }
      }

      case 'get-popular-artists': {
        // Spotify doesn't have a direct "popular artists" endpoint
        // Use search with popular genres or use a known playlist
        try {
          const data = await spotifyFetch(
            `/search?q=genre:pop&type=artist&limit=${limit}&market=${mkt}`
          );
          const artists = (data.artists?.items || []).map((a: any) => mapArtist(a));
          return json(artists);
        } catch {
          return json([]);
        }
      }

      // ======================== TRACK RADIO (recommendations) ========================
      case 'get-track-radio': {
        try {
          const data = await spotifyFetch(
            `/recommendations?seed_tracks=${id}&limit=${limit}&market=${mkt}`
          );
          const tracks = (data.tracks || []).map((t: any) => mapTrack(t));
          return json(tracks);
        } catch (error) {
          console.error('Recommendations error:', error);
          return json([]);
        }
      }

      // ======================== COUNTRY CHART ========================
      case 'get-country-chart': {
        // Check for configured playlist in DB
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        let playlistId: string | null = null;

        if (supabaseUrl && supabaseKey) {
          try {
            const configRes = await fetch(
              `${supabaseUrl}/rest/v1/chart_configurations?country_code=eq.${(country || mkt).toUpperCase()}&select=playlist_id`,
              {
                headers: {
                  'apikey': supabaseKey,
                  'Authorization': `Bearer ${supabaseKey}`,
                },
              }
            );
            if (configRes.ok) {
              const configData = await configRes.json();
              if (configData?.[0]?.playlist_id) {
                let pid = configData[0].playlist_id;
                if (pid.startsWith('sf:')) pid = pid.replace('sf:', '');
                // Check if it's a Spotify playlist ID (22 char alphanumeric)
                if (/^[a-zA-Z0-9]{22}$/.test(pid)) {
                  playlistId = pid;
                }
              }
            }
          } catch (e) {
            console.error('Error fetching chart config:', e);
          }
        }

        if (playlistId) {
          try {
            const plData = await spotifyFetch(`/playlists/${playlistId}?market=${mkt}`);
            const tracks = (plData.tracks?.items || [])
              .filter((item: any) => item.track)
              .slice(0, limit)
              .map((item: any) => mapTrack(item.track));
            return json(tracks);
          } catch { /* fall through */ }
        }

        // Fallback: search for "Top 50 <country>"
        const countryNames: Record<string, string> = {
          IT: 'Italy', US: 'USA', ES: 'Spain', FR: 'France',
          DE: 'Germany', PT: 'Portugal', GB: 'UK', BR: 'Brazil',
        };
        const countryName = countryNames[(country || mkt).toUpperCase()] || country || mkt;
        try {
          const searchData = await spotifyFetch(
            `/search?q=${encodeURIComponent(`Top 50 ${countryName}`)}&type=playlist&limit=1&market=${mkt}`
          );
          const firstPlaylist = searchData.playlists?.items?.[0];
          if (firstPlaylist) {
            const plData = await spotifyFetch(`/playlists/${firstPlaylist.id}?market=${mkt}`);
            const tracks = (plData.tracks?.items || [])
              .filter((item: any) => item.track)
              .slice(0, limit)
              .map((item: any) => mapTrack(item.track));
            return json(tracks);
          }
        } catch { /* fall through */ }

        return json([]);
      }

      // ======================== ARTIST ALBUMS (for new releases check) ========================
      case 'get-artist-albums': {
        const data = await spotifyFetch(
          `/artists/${id}/albums?include_groups=album,single&limit=${limit}&market=${mkt}`
        );
        const albums = (data.items || []).map((a: any) => mapAlbum(a));
        return json(albums);
      }

      // ======================== MULTIPLE ARTISTS ========================
      case 'get-several-artists': {
        // id should be comma-separated artist IDs (max 50)
        const data = await spotifyFetch(`/artists?ids=${id}`);
        const artists = (data.artists || []).filter(Boolean).map((a: any) => mapArtist(a));
        return json(artists);
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
  } catch (error) {
    console.error('Spotify API error:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function json(data: any) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
