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

async function spotifyFetch(path: string, retries = 3): Promise<any> {
  let rateLimitRetries = 0;
  const maxRateLimitRetries = 5;
  let authRetries = 0;

  while (true) {
    const token = await getAccessToken();
    const res = await fetch(`${SPOTIFY_API}${path}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (res.status === 401 && authRetries < retries) {
      cachedToken = null;
      tokenExpiresAt = 0;
      authRetries++;
      continue;
    }

    if (res.status === 429 && rateLimitRetries < maxRateLimitRetries) {
      const retryAfter = Math.min(parseInt(res.headers.get('Retry-After') || '2'), 5);
      console.log(`Rate limited on ${path}, waiting ${retryAfter}s (attempt ${rateLimitRetries + 1})`);
      await new Promise(r => setTimeout(r, retryAfter * 1000));
      rateLimitRetries++;
      continue;
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Spotify API ${res.status}: ${text.substring(0, 200)}`);
    }

    return await res.json();
  }
}

async function spotifyFetchUrl(url: string, retries = 2): Promise<any> {
  for (let i = 0; i <= retries; i++) {
    const token = await getAccessToken();
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (res.status === 401 && i < retries) {
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
    let token = await getAccessToken();

    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(`${SPOTIFY_API}${path}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (res.status === 401 && attempt === 0) {
        cachedToken = null;
        tokenExpiresAt = 0;
        token = await getAccessToken();
        continue;
      }

      if (res.status === 403 || res.status === 429) {
        const text = await res.text();
        console.warn(`Spotify optional endpoint blocked for ${label}: ${res.status} ${text.substring(0, 120)}`);
        return fallback;
      }

      if (!res.ok) {
        const text = await res.text();
        console.warn(`Spotify optional endpoint failed for ${label}: ${res.status} ${text.substring(0, 120)}`);
        return fallback;
      }

      return await res.json();
    }

    return fallback;
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

function normalizeText(value: string | undefined | null): string {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function artistMatches(artists: any[] | undefined, artistId?: string, artistName?: string): boolean {
  const normalizedArtistName = normalizeText(artistName);
  return (artists || []).some((artist) => {
    if (artistId && artist?.id === artistId) return true;
    if (!normalizedArtistName) return false;
    return normalizeText(artist?.name) === normalizedArtistName;
  });
}

function dedupeById<T extends { id?: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!item?.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

async function searchArtistTracksFallback(artistId: string, artistName: string, market: string, limit = 10) {
  const searchQueries = [
    `artist:"${artistName}"`,
    artistName,
  ];

  const foundTracks: any[] = [];
  const seenIds = new Set<string>();

  for (const searchQuery of searchQueries) {
    try {
      const searchData = await spotifyFetch(
        `/search?q=${encodeURIComponent(searchQuery)}&type=track&limit=${Math.min(limit, 10)}&market=${market}`,
      );

      for (const track of searchData.tracks?.items || []) {
        if (!track?.id || seenIds.has(track.id)) continue;
        if (!artistMatches(track.artists, artistId, artistName)) continue;
        seenIds.add(track.id);
        foundTracks.push(track);
        if (foundTracks.length >= limit) {
          return foundTracks.map((item) => mapTrack(item));
        }
      }
    } catch (error) {
      console.warn(`Search fallback for artist tracks failed for ${artistName}:`, error);
    }
  }

  return foundTracks.map((item) => mapTrack(item));
}

async function fetchPlaylistTracks(playlistId: string, market: string, maxTracks = 200) {
  const collected: any[] = [];
  let offset = 0;
  let total = 0;

  while (offset < maxTracks) {
    const pageLimit = Math.min(100, maxTracks - offset);
    const data = await spotifyFetch(
      `/playlists/${playlistId}/tracks?market=${market}&limit=${pageLimit}&offset=${offset}`,
    );

    const items = data.items || [];
    total = data.total || total;
    collected.push(...items.filter((item: any) => item?.track));

    if (!data.next || items.length === 0) {
      break;
    }

    offset += items.length;
  }

  return {
    total: total || collected.length,
    items: collected,
  };
}

async function collectPlaylistTracksFromPlaylistResponse(playlistData: any, maxTracks = 200) {
  const collected = (playlistData?.tracks?.items || []).filter((item: any) => item?.track);
  let next = playlistData?.tracks?.next as string | null;
  const total = playlistData?.tracks?.total || collected.length;

  while (next && collected.length < maxTracks) {
    const page = await spotifyFetchUrl(next);
    const items = (page?.items || []).filter((item: any) => item?.track);
    collected.push(...items);
    next = page?.next || null;
  }

  return {
    total,
    items: collected.slice(0, maxTracks),
  };
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

        const artistName = artistData.name || '';

        // Search-based fallbacks when direct endpoints are blocked (403/429)
        let releases = (albumsData.items || []).map((a: any) => mapAlbum(a));
        let topTracks = (topData.tracks || []).map((t: any) => mapTrack(t));
        let relatedArtists = (relatedData.artists || []).slice(0, 10).map((a: any) => mapArtist(a));

        if (releases.length === 0 && artistName) {
          console.log(`Using search fallback for albums of "${artistName}"`);
          try {
            const searchAlbums = await spotifyFetch(
              `/search?q=${encodeURIComponent(`artist:"${artistName}"`)}&type=album&limit=10&market=${mkt}`
            );
            releases = (searchAlbums.albums?.items || [])
              .filter((a: any) => {
                const artists = (a.artists || []).map((ar: any) => ar.name?.toLowerCase());
                return artists.includes(artistName.toLowerCase());
              })
              .map((a: any) => mapAlbum(a));
          } catch (e) {
            console.warn('Search fallback for albums failed:', e);
          }
        }

        if (topTracks.length === 0 && artistName) {
          console.log(`Using search fallback for top tracks of "${artistName}"`);
          topTracks = await searchArtistTracksFallback(id, artistName, mkt, 10);
        }

        topTracks = dedupeById(topTracks).slice(0, 10);

        if (relatedArtists.length === 0 && artistData.genres?.length > 0) {
          console.log(`Using search fallback for related artists via genre`);
          try {
            const genre = artistData.genres[0];
            const searchRelated = await spotifyFetch(
              `/search?q=${encodeURIComponent(`genre:"${genre}"`)}&type=artist&limit=10&market=${mkt}`
            );
            relatedArtists = (searchRelated.artists?.items || [])
              .filter((a: any) => a.id !== id)
              .slice(0, 10)
              .map((a: any) => mapArtist(a));
          } catch (e) {
            console.warn('Search fallback for related artists failed:', e);
          }
        }

        const artist = {
          ...mapArtist(artistData),
          releases,
          topTracks,
          relatedArtists,
        };
        return json(artist);
      }

      case 'get-artist-top': {
        if (!/^[a-zA-Z0-9]{22}$/.test(String(id || ''))) {
          return json([]);
        }

        const topResult = await spotifyFetchOptional(
          `/artists/${id}/top-tracks?market=${mkt}`,
          { tracks: [] },
          `get-artist-top ${id}`,
        );
        let topResultTracks = (topResult.tracks || []).slice(0, limit).map((t: any) => mapTrack(t));

        // Search fallback if direct endpoint blocked
        if (topResultTracks.length === 0) {
          try {
            const artistInfo = await spotifyFetch(`/artists/${id}`);
            const aName = artistInfo.name;
            if (aName) {
              topResultTracks = await searchArtistTracksFallback(id, aName, mkt, limit);
            }
          } catch (e) {
            console.warn('Search fallback for get-artist-top failed:', e);
          }
        }

        return json(dedupeById(topResultTracks).slice(0, limit));
      }

      // ======================== PLAYLISTS ========================
      case 'get-playlist': {
        try {
          const playlistData = await spotifyFetch(`/playlists/${id}?market=${mkt}`);
          let playlistTracksData = await collectPlaylistTracksFromPlaylistResponse(playlistData);

          if (playlistTracksData.items.length === 0 && (playlistData?.tracks?.total || 0) > 0) {
            playlistTracksData = await fetchPlaylistTracks(String(id), mkt);
          }

          const mappedTracks = playlistTracksData.items
            .map((item: any, index: number) => ({
              ...mapTrack(item.track),
              trackNumber: index + 1,
            }))
            .filter((track: any) => !!track.id);

          const playlist = {
            id: playlistData.id,
            title: playlistData.name,
            description: playlistData.description || '',
            coverUrl: bestImage(playlistData.images),
            trackCount: playlistTracksData.total || playlistData.tracks?.total || mappedTracks.length,
            creator: playlistData.owner?.display_name || 'Spotify',
            duration: 0,
            tracks: mappedTracks,
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
                  trackCount: p.tracks?.total ?? 0,
                  creator: p.owner?.display_name || 'Spotify',
                  isSpotifyPlaylist: true,
                });
              }
            }
          } catch (e) {
            console.error(`Error searching playlists for "${q}":`, e);
          }
        }

        const enrichedPlaylists = [];

        for (const playlist of allPlaylists.slice(0, 6)) {
          if (playlist.trackCount > 0 && playlist.coverUrl) {
            enrichedPlaylists.push(playlist);
            continue;
          }

          const details = await spotifyFetchOptional<any | null>(
            `/playlists/${playlist.id}?fields=images,tracks(total),owner(display_name),description`,
            null,
            `artist playlist details ${playlist.id}`,
          );

          enrichedPlaylists.push({
            ...playlist,
            coverUrl: playlist.coverUrl || bestImage(details?.images || []),
            description: playlist.description || details?.description || '',
            creator: details?.owner?.display_name || playlist.creator,
            trackCount: details?.tracks?.total ?? playlist.trackCount ?? 0,
          });
        }

        return json(enrichedPlaylists);
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
