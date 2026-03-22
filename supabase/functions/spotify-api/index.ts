import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEEZER_API = 'https://api.deezer.com';

// Spotify kept ONLY for playlist backward compatibility (existing Spotify playlist IDs)
const SPOTIFY_API = 'https://api.spotify.com/v1';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
let cachedSpotifyToken: string | null = null;
let spotifyTokenExpiresAt = 0;

async function getSpotifyToken(): Promise<string> {
  const now = Date.now();
  if (cachedSpotifyToken && now < spotifyTokenExpiresAt - 60_000) return cachedSpotifyToken;
  const clientId = Deno.env.get('SPOTIFY_CLIENT_ID');
  const clientSecret = Deno.env.get('SPOTIFY_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new Error('Missing Spotify credentials');
  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`Spotify token failed ${res.status}`);
  const data = await res.json();
  cachedSpotifyToken = data.access_token;
  spotifyTokenExpiresAt = now + data.expires_in * 1000;
  return cachedSpotifyToken!;
}

async function spotifyFetchPlaylist(url: string, retries = 2): Promise<any> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const token = await getSpotifyToken();
    const fullUrl = url.startsWith('http') ? url : `${SPOTIFY_API}${url}`;
    console.log(`[Spotify] Fetching: ${fullUrl} (attempt ${attempt + 1})`);
    const res = await fetch(fullUrl, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    console.log(`[Spotify] Response: ${res.status} ${res.statusText}`);
    if (res.status === 401 && attempt < retries) {
      cachedSpotifyToken = null;
      spotifyTokenExpiresAt = 0;
      continue;
    }
    if (res.status === 429) {
      const wait = Math.min(parseInt(res.headers.get('Retry-After') || '2'), 5);
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, wait * 1000));
        continue;
      }
      throw new Error('Spotify rate limited');
    }
    if (!res.ok) {
      const errorBody = await res.text().catch(() => '');
      console.error(`[Spotify] Error body: ${errorBody.slice(0, 200)}`);
      throw new Error(`Spotify ${res.status}`);
    }
    return await res.json();
  }
  throw new Error('Max retries exceeded');
}

// ======================== DEEZER HELPERS ========================

async function deezerFetch(path: string): Promise<any> {
  const res = await fetch(`${DEEZER_API}${path}`, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
  });
  if (!res.ok) throw new Error(`Deezer ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'Deezer error');
  return data;
}

function deezerCover(obj: any): string | undefined {
  return obj?.cover_xl || obj?.cover_big || obj?.cover_medium || obj?.cover ||
    obj?.picture_xl || obj?.picture_big || obj?.picture_medium || obj?.picture;
}

function mapDeezerTrack(track: any, albumOverride?: any): any {
  const album = albumOverride || track?.album;
  return {
    id: String(track?.id || ''),
    title: track?.title || 'Unknown Track',
    artist: track?.artist?.name || album?.artist?.name || 'Unknown Artist',
    artistId: String(track?.artist?.id || album?.artist?.id || ''),
    album: album?.title || 'Unknown Album',
    albumId: String(album?.id || ''),
    duration: Math.round(track?.duration || 0),
    coverUrl: deezerCover(album) || deezerCover(track?.artist),
    previewUrl: track?.preview || undefined,
  };
}

function mapDeezerAlbum(album: any): any {
  return {
    id: String(album?.id || ''),
    title: album?.title || 'Unknown Album',
    artist: album?.artist?.name || 'Unknown Artist',
    artistId: String(album?.artist?.id || ''),
    coverUrl: deezerCover(album),
    releaseDate: album?.release_date || undefined,
    trackCount: album?.nb_tracks || undefined,
    recordType: album?.record_type || 'album',
  };
}

function mapDeezerArtist(artist: any): any {
  return {
    id: String(artist?.id || ''),
    name: artist?.name || 'Unknown Artist',
    imageUrl: deezerCover(artist),
    popularity: artist?.nb_fan || 0,
    genres: [],
  };
}

// Spotify track/playlist mapping (backward compat)
function bestSpotifyImage(images: any[]): string | undefined {
  if (!images?.length) return undefined;
  return [...images].sort((a, b) => (b.width || 0) - (a.width || 0))[0]?.url;
}

function mapSpotifyTrack(track: any, albumOverride?: any): any {
  const album = albumOverride || track.album;
  return {
    id: String(track.id),
    title: track.name,
    artist: track.artists?.map((a: any) => a.name).join(', ') || 'Unknown Artist',
    artistId: String(track.artists?.[0]?.id || ''),
    album: album?.name || 'Unknown Album',
    albumId: String(album?.id || ''),
    duration: Math.round((track.duration_ms || 0) / 1000),
    coverUrl: bestSpotifyImage(album?.images),
    previewUrl: track.preview_url || undefined,
  };
}

function isSpotifyId(value: unknown): boolean {
  return /^[a-zA-Z0-9]{22}$/.test(String(value || ''));
}

// ======================== HANDLER ========================

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action, query, id, limit: rawLimit = 10, country, market } = body;
    const limit = Math.min(Number(rawLimit) || 10, 50);
    const mkt = market || country || 'IT';

    console.log(`API request: action=${action}, query=${query || ''}, id=${id || ''}, limit=${limit}`);

    switch (action) {
      // ======================== SEARCH (Deezer) ========================
      case 'search-tracks': {
        if (!query?.trim()) return json([]);
        const data = await deezerFetch(`/search/track?q=${encodeURIComponent(query)}&limit=${limit}`);
        return json((data?.data || []).map((t: any) => mapDeezerTrack(t)));
      }
      case 'search-albums': {
        if (!query?.trim()) return json([]);
        const data = await deezerFetch(`/search/album?q=${encodeURIComponent(query)}&limit=${limit}`);
        return json((data?.data || []).map((a: any) => mapDeezerAlbum(a)));
      }
      case 'search-artists': {
        if (!query?.trim()) return json([]);
        const data = await deezerFetch(`/search/artist?q=${encodeURIComponent(query)}&limit=${limit}`);
        return json((data?.data || []).map((a: any) => mapDeezerArtist(a)));
      }
      case 'search-playlists': {
        if (!query?.trim()) return json([]);
        const data = await deezerFetch(`/search/playlist?q=${encodeURIComponent(query)}&limit=${limit}`);
        return json((data?.data || []).map((p: any) => ({
          id: String(p.id),
          title: p.title,
          description: '',
          coverUrl: deezerCover(p),
          trackCount: p.nb_tracks || 0,
          creator: p.user?.name || 'Deezer',
          isDeezerPlaylist: true,
        })));
      }

      // ======================== GET SINGLE (Deezer) ========================
      case 'get-track': {
        const data = await deezerFetch(`/track/${id}`);
        return json(mapDeezerTrack(data));
      }
      case 'get-album': {
        const data = await deezerFetch(`/album/${id}`);
        return json({
          ...mapDeezerAlbum(data),
          tracks: (data?.tracks?.data || []).map((t: any, i: number) => ({
            ...mapDeezerTrack(t, data),
            trackNumber: i + 1,
          })),
        });
      }
      case 'get-artist': {
        const [artistRes, albumsRes, topRes, relatedRes] = await Promise.allSettled([
          deezerFetch(`/artist/${id}`),
          deezerFetch(`/artist/${id}/albums?limit=50`),
          deezerFetch(`/artist/${id}/top?limit=10`),
          deezerFetch(`/artist/${id}/related?limit=10`),
        ]);

        const artist = artistRes.status === 'fulfilled' ? artistRes.value : null;
        if (!artist) {
          return json({
            id: String(id || ''), name: 'Unknown Artist', imageUrl: undefined,
            popularity: 0, genres: [], releases: [], topTracks: [], relatedArtists: [], error: true,
          });
        }

        const albums = albumsRes.status === 'fulfilled' ? albumsRes.value : { data: [] };
        const top = topRes.status === 'fulfilled' ? topRes.value : { data: [] };
        const related = relatedRes.status === 'fulfilled' ? relatedRes.value : { data: [] };

        return json({
          ...mapDeezerArtist(artist),
          releases: (albums?.data || []).map((a: any) => mapDeezerAlbum(a)),
          topTracks: (top?.data || []).map((t: any) => mapDeezerTrack(t)),
          relatedArtists: (related?.data || []).map((a: any) => mapDeezerArtist(a)).slice(0, 10),
        });
      }
      case 'get-artist-top': {
        const data = await deezerFetch(`/artist/${id}/top?limit=${limit}`);
        return json((data?.data || []).map((t: any) => mapDeezerTrack(t)));
      }
      case 'get-artist-albums': {
        const data = await deezerFetch(`/artist/${id}/albums?limit=${limit}`);
        return json((data?.data || []).map((a: any) => mapDeezerAlbum(a)));
      }

      // ======================== CHARTS (Deezer) ========================
      case 'get-chart': {
        const data = await deezerFetch(`/chart?limit=${limit}`);
        return json({
          tracks: (data?.tracks?.data || []).map((t: any) => mapDeezerTrack(t)),
          albums: (data?.albums?.data || []).map((a: any) => mapDeezerAlbum(a)),
          artists: (data?.artists?.data || []).map((a: any) => mapDeezerArtist(a)),
        });
      }
      case 'get-new-releases': {
        try {
          const data = await deezerFetch(`/editorial/0/releases?limit=${limit}`);
          return json((data?.data || []).map((a: any) => mapDeezerAlbum(a)));
        } catch {
          const data = await deezerFetch(`/chart/0/albums?limit=${limit}`);
          return json((data?.data || []).map((a: any) => mapDeezerAlbum(a)));
        }
      }
      case 'get-popular-artists': {
        const data = await deezerFetch(`/chart/0/artists?limit=${limit}`);
        return json((data?.data || []).map((a: any) => mapDeezerArtist(a)));
      }

      // ======================== TRACK RADIO (Deezer artist radio) ========================
      case 'get-track-radio': {
        try {
          const track = await deezerFetch(`/track/${id}`);
          const artistId = track?.artist?.id;
          if (!artistId) return json([]);
          const radio = await deezerFetch(`/artist/${artistId}/radio?limit=${limit}`);
          return json(
            (radio?.data || [])
              .filter((t: any) => String(t.id) !== String(id))
              .map((t: any) => mapDeezerTrack(t))
          );
        } catch {
          return json([]);
        }
      }

      // ======================== COUNTRY CHART ========================
      case 'get-country-chart': {
        // Check DB for configured playlist
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

        if (supabaseUrl && supabaseKey) {
          try {
            const configRes = await fetch(
              `${supabaseUrl}/rest/v1/chart_configurations?country_code=eq.${mkt.toUpperCase()}&select=playlist_id`,
              { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } }
            );
            if (configRes.ok) {
              const configData = await configRes.json();
              let pid = configData?.[0]?.playlist_id;
              if (pid) {
                if (pid.startsWith('sf:')) pid = pid.replace('sf:', '');
                // Numeric = Deezer playlist
                if (/^\d+$/.test(pid)) {
                  const data = await deezerFetch(`/playlist/${pid}`);
                  return json((data?.tracks?.data || []).slice(0, limit).map((t: any) => mapDeezerTrack(t)));
                }
                // Alphanumeric = Spotify playlist
                try {
                  const plData = await spotifyFetchPlaylist(`/playlists/${pid}?market=${mkt}`);
                  const items = (plData?.tracks?.items || []).filter((i: any) => i?.track).slice(0, limit);
                  return json(items.map((i: any) => mapSpotifyTrack(i.track)));
                } catch (spotifyErr) {
                  console.warn('Spotify chart fetch failed, falling back to Deezer:', spotifyErr);
                }
              }
            }
          } catch (e) {
            console.warn('Chart config lookup failed:', e);
          }
        }

        // Fallback: Deezer global chart
        const data = await deezerFetch(`/chart/0/tracks?limit=${limit}`);
        return json((data?.data || []).map((t: any) => mapDeezerTrack(t)));
      }

      // ======================== PLAYLISTS ========================
      case 'get-playlist': {
        // Numeric ID = Deezer playlist
        if (/^\d+$/.test(String(id))) {
          const data = await deezerFetch(`/playlist/${id}`);
          return json({
            id: String(data.id),
            title: data.title,
            description: data.description || '',
            coverUrl: deezerCover(data),
            trackCount: data.nb_tracks || 0,
            creator: data.creator?.name || 'Deezer',
            duration: data.duration || 0,
            tracks: (data?.tracks?.data || []).map((t: any, i: number) => ({
              ...mapDeezerTrack(t),
              trackNumber: i + 1,
            })),
          });
        }

        // Spotify playlist ID (backward compat)
        try {
          const plData = await spotifyFetchPlaylist(`/playlists/${id}?market=${mkt}`);
          let allItems = (plData?.tracks?.items || []).filter((i: any) => i?.track);
          let next = plData?.tracks?.next;
          while (next && allItems.length < 200) {
            try {
              const page = await spotifyFetchPlaylist(next);
              allItems.push(...(page?.items || []).filter((i: any) => i?.track));
              next = page?.next;
            } catch { break; }
          }
          return json({
            id: plData.id,
            title: plData.name,
            description: plData.description || '',
            coverUrl: bestSpotifyImage(plData.images),
            trackCount: plData.tracks?.total || allItems.length,
            creator: plData.owner?.display_name || 'Spotify',
            duration: 0,
            tracks: allItems.map((i: any, idx: number) => ({
              ...mapSpotifyTrack(i.track),
              trackNumber: idx + 1,
            })),
          });
        } catch (error) {
          console.error(`Playlist fetch failed for ${id}:`, error);
          return json({ id: String(id), title: '', description: '', coverUrl: null, trackCount: 0, creator: '', duration: 0, tracks: [], error: true });
        }
      }

      case 'get-artist-playlists': {
        const artistName = query;
        if (!artistName?.trim()) return json([]);
        const data = await deezerFetch(`/search/playlist?q=${encodeURIComponent(artistName)}&limit=10`);
        const playlists = (data?.data || [])
          .filter((p: any) => {
            const title = (p.title || '').toLowerCase();
            const name = artistName.toLowerCase();
            return title.includes(name);
          })
          .map((p: any) => ({
            id: String(p.id),
            title: p.title,
            description: '',
            coverUrl: deezerCover(p),
            trackCount: p.nb_tracks || 0,
            creator: p.user?.name || 'Deezer',
            isDeezerPlaylist: true,
          }));
        return json(playlists);
      }

      case 'get-several-artists': {
        const ids = body.ids || [];
        if (!ids.length) return json([]);
        const results = await Promise.allSettled(
          ids.slice(0, 10).map((aid: string) => deezerFetch(`/artist/${aid}`))
        );
        return json(
          results
            .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
            .map(r => mapDeezerArtist(r.value))
        );
      }

      default:
        return json({ error: `Unknown action: ${action}` });
    }
  } catch (error) {
    console.error('API error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function json(data: any) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
