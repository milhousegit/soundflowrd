import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

// ======================== SPOTIFY GENRE CACHE ========================

function getSupabaseServiceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
}

async function fetchArtistGenresFromLastFm(artistName: string, deezerId: string): Promise<{ genres: string[]; popularity: number; spotifyId?: string; imageUrl?: string } | null> {
  try {
    const sb = getSupabaseServiceClient();
    const { data: cached } = await sb
      .from('artist_genres_cache')
      .select('genres, popularity, spotify_id, image_url')
      .eq('artist_id', deezerId)
      .maybeSingle();

    if (cached) {
      console.log(`[Genres] Cache hit for ${artistName} (${deezerId})`);
      return { genres: cached.genres || [], popularity: cached.popularity || 0, spotifyId: cached.spotify_id, imageUrl: cached.image_url };
    }

    const lastfmKey = Deno.env.get('LASTFM_API_KEY');
    if (!lastfmKey) {
      console.warn('[Genres] LASTFM_API_KEY not set');
      return null;
    }

    const url = `https://ws.audioscrobbler.com/2.0/?method=artist.getinfo&artist=${encodeURIComponent(artistName)}&api_key=${lastfmKey}&format=json`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[Genres] Last.fm failed: ${res.status}`);
      return null;
    }

    const data = await res.json();
    const artist = data?.artist;
    if (!artist) {
      console.log(`[Genres] No Last.fm match for ${artistName}`);
      await sb.from('artist_genres_cache').upsert({
        artist_id: deezerId, artist_name: artistName, genres: [], popularity: 0, updated_at: new Date().toISOString(),
      }, { onConflict: 'artist_id' });
      return null;
    }

    const tags = (artist.tags?.tag || []).map((t: any) => t.name).filter(Boolean).slice(0, 5);
    const listeners = parseInt(artist.stats?.listeners || '0', 10);
    // Normalize listeners to 0-100 scale (rough: 10M+ = 100)
    const popularity = Math.min(100, Math.round((listeners / 100000) * 1));
    const imageUrl = artist.image?.find((i: any) => i.size === 'extralarge')?.['#text'] || undefined;

    const result = { genres: tags, popularity, imageUrl: imageUrl || undefined };

    await sb.from('artist_genres_cache').upsert({
      artist_id: deezerId,
      artist_name: artistName,
      genres: result.genres,
      popularity: result.popularity,
      image_url: result.imageUrl || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'artist_id' });

    console.log(`[Genres] Cached ${result.genres.length} genres from Last.fm for ${artistName}: ${result.genres.join(', ')}`);
    return result;
  } catch (err) {
    console.warn(`[Genres] Error fetching genres for ${artistName}:`, err);
    return null;
  }
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

        // Fetch genres from Spotify (cached)
        const artistName = artist?.name || '';
        const genreData = await fetchArtistGenresFromLastFm(artistName, String(id));

        const mappedArtist = mapDeezerArtist(artist);
        if (genreData) {
          mappedArtist.genres = genreData.genres;
          if (genreData.popularity > 0) mappedArtist.popularity = genreData.popularity;
        }

        return json({
          ...mappedArtist,
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
                // Alphanumeric = Spotify playlist → use spotify-import (anonymous token)
                try {
                  const spotifyUrl = `https://open.spotify.com/playlist/${pid}`;
                  console.log(`[Chart] Fetching Spotify playlist via import: ${pid}`);
                  const importRes = await fetch(`${supabaseUrl}/functions/v1/spotify-import`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${supabaseKey}`,
                    },
                    body: JSON.stringify({ url: spotifyUrl }),
                  });
                  if (importRes.ok) {
                    const importData = await importRes.json();
                    if (importData.tracks?.length > 0) {
                      console.log(`[Chart] Got ${importData.tracks.length} tracks from Spotify import`);
                      return json(importData.tracks.slice(0, limit));
                    }
                  }
                  console.warn('[Chart] Spotify import returned no tracks, falling back');
                } catch (spotifyErr) {
                  console.warn('[Chart] Spotify import failed, falling back to Deezer:', spotifyErr);
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

        // Spotify playlist ID — try client credentials first, then spotify-import
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
          console.warn(`[Playlist] Client credentials failed for ${id}, trying spotify-import...`);
          // Fallback: use spotify-import (anonymous token)
          const supabaseUrlPl = Deno.env.get('SUPABASE_URL');
          const supabaseKeyPl = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
          if (supabaseUrlPl && supabaseKeyPl) {
            try {
              const importRes = await fetch(`${supabaseUrlPl}/functions/v1/spotify-import`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${supabaseKeyPl}`,
                },
                body: JSON.stringify({ url: `https://open.spotify.com/playlist/${id}` }),
              });
              if (importRes.ok) {
                const importData = await importRes.json();
                if (importData.tracks?.length > 0) {
                  return json({
                    id: String(id),
                    title: importData.playlistName || 'Spotify Playlist',
                    description: '',
                    coverUrl: importData.coverUrl || null,
                    trackCount: importData.tracks.length,
                    creator: 'Spotify',
                    duration: 0,
                    tracks: importData.tracks.map((t: any, idx: number) => ({ ...t, trackNumber: idx + 1 })),
                  });
                }
              }
            } catch (importErr) {
              console.error(`[Playlist] spotify-import also failed for ${id}:`, importErr);
            }
          }
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

      // ======================== TRACK TAGS (Last.fm) ========================
      case 'track-tags': {
        const { title: trackTitle, artist: trackArtist } = body;
        if (!trackTitle || !trackArtist) return json({ error: 'title and artist required' });

        const lastfmKey = Deno.env.get('LASTFM_API_KEY');
        if (!lastfmKey) return json({ tags: [] });

        try {
          const lfmUrl = `https://ws.audioscrobbler.com/2.0/?method=track.getTopTags&track=${encodeURIComponent(trackTitle)}&artist=${encodeURIComponent(trackArtist)}&api_key=${lastfmKey}&format=json`;
          const lfmRes = await fetch(lfmUrl);
          if (!lfmRes.ok) return json({ tags: [] });
          const lfmData = await lfmRes.json();
          const tags = (lfmData?.toptags?.tag || [])
            .filter((t: any) => (t.count || 0) > 10)
            .map((t: any) => ({ name: t.name, count: Number(t.count) }))
            .slice(0, 10);
          return json({ tags });
        } catch {
          return json({ tags: [] });
        }
      }

      // ======================== GENRE BROWSE (Last.fm + Deezer) ========================
      case 'genre-browse': {
        const { genre } = body;
        if (!genre) return json({ error: 'genre required' });

        const lastfmKey = Deno.env.get('LASTFM_API_KEY');
        
        // Genre tag mapping for Last.fm (more accurate than Deezer genre IDs)
        const TAG_MAP: Record<string, string> = {
          'pop': 'pop', 'hip-hop': 'hip-hop', 'rap': 'hip-hop', 
          'rock': 'rock', 'electronic': 'electronic', 'r&b': 'rnb',
          'jazz': 'jazz', 'classical': 'classical', 'country': 'country',
          'latin': 'latin', 'k-pop': 'k-pop', 'indie': 'indie',
          'alternative': 'alternative', 'metal': 'metal', 'soul': 'soul',
        };
        const tag = TAG_MAP[genre.toLowerCase().trim()] || genre.toLowerCase().trim();

        try {
          // Fetch genre-accurate data from Last.fm tag + weekly charts for recency
          const [tagArtistsRes, tagTracksRes, weeklyArtistsRes, weeklyTracksRes] = await Promise.all([
            lastfmKey 
              ? fetch(`https://ws.audioscrobbler.com/2.0/?method=tag.gettopartists&tag=${encodeURIComponent(tag)}&api_key=${lastfmKey}&format=json&limit=30`)
              : Promise.resolve(null),
            lastfmKey
              ? fetch(`https://ws.audioscrobbler.com/2.0/?method=tag.gettoptracks&tag=${encodeURIComponent(tag)}&api_key=${lastfmKey}&format=json&limit=50`)
              : Promise.resolve(null),
            lastfmKey
              ? fetch(`https://ws.audioscrobbler.com/2.0/?method=chart.gettopartists&api_key=${lastfmKey}&format=json&limit=200`)
              : Promise.resolve(null),
            // Weekly track chart for recent track popularity
            lastfmKey
              ? fetch(`https://ws.audioscrobbler.com/2.0/?method=chart.gettoptracks&api_key=${lastfmKey}&format=json&limit=300`)
              : Promise.resolve(null),
          ]);

          const tagArtistsData = tagArtistsRes?.ok ? await tagArtistsRes.json() : {};
          const tagTracksData = tagTracksRes?.ok ? await tagTracksRes.json() : {};
          const weeklyData = weeklyArtistsRes?.ok ? await weeklyArtistsRes.json() : {};
          const weeklyTracksData = weeklyTracksRes?.ok ? await weeklyTracksRes.json() : {};

          // --- ARTISTS: weekly rank cross-referenced with genre tag ---
          const tagArtistNames = new Set(
            (tagArtistsData?.topartists?.artist || []).map((a: any) => a.name.toLowerCase())
          );
          const weeklyArtists = (weeklyData?.artists?.artist || []) as any[];
          const weeklyRank = new Map<string, number>();
          weeklyArtists.forEach((a: any, i: number) => {
            weeklyRank.set(a.name.toLowerCase(), i + 1);
          });

          const genreWeeklyArtists = weeklyArtists
            .filter((a: any) => tagArtistNames.has(a.name.toLowerCase()))
            .slice(0, 15);

          const tagArtists = (tagArtistsData?.topartists?.artist || []) as any[];
          const usedNames = new Set(genreWeeklyArtists.map((a: any) => a.name.toLowerCase()));
          for (const a of tagArtists) {
            if (genreWeeklyArtists.length >= 15) break;
            if (!usedNames.has(a.name.toLowerCase())) {
              genreWeeklyArtists.push(a);
              usedNames.add(a.name.toLowerCase());
            }
          }

          // --- TRACKS: weekly rank cross-referenced with genre tag tracks ---
          const tagTrackKeys = new Set(
            (tagTracksData?.tracks?.track || []).map((t: any) => `${(t.artist?.name || '').toLowerCase()}::${t.name.toLowerCase()}`)
          );
          const weeklyTracks = (weeklyTracksData?.tracks?.track || []) as any[];
          const weeklyTrackRank = new Map<string, number>();
          weeklyTracks.forEach((t: any, i: number) => {
            weeklyTrackRank.set(`${(t.artist?.name || '').toLowerCase()}::${t.name.toLowerCase()}`, i + 1);
          });

          // Filter weekly tracks that match genre tag
          const genreWeeklyTracks = weeklyTracks
            .filter((t: any) => tagTrackKeys.has(`${(t.artist?.name || '').toLowerCase()}::${t.name.toLowerCase()}`))
            .slice(0, 25);

          // Fill with tag tracks if not enough
          const tagTracks = (tagTracksData?.tracks?.track || []) as any[];
          const usedTrackKeys = new Set(genreWeeklyTracks.map((t: any) => `${(t.artist?.name || '').toLowerCase()}::${t.name.toLowerCase()}`));
          for (const t of tagTracks) {
            if (genreWeeklyTracks.length >= 25) break;
            const key = `${(t.artist?.name || '').toLowerCase()}::${t.name.toLowerCase()}`;
            if (!usedTrackKeys.has(key)) {
              genreWeeklyTracks.push(t);
              usedTrackKeys.add(key);
            }
          }

          console.log(`[genre-browse] Tag "${tag}": ${genreWeeklyArtists.length} artists, ${genreWeeklyTracks.length} tracks (weekly+tag merged)`);

          // Resolve to Deezer for images
          const artistPromises = genreWeeklyArtists.slice(0, 12).map(async (a: any) => {
            try {
              const searchRes = await fetch(`${DEEZER_API}/search/artist?q=${encodeURIComponent(a.name)}&limit=1`, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
              });
              const searchData = searchRes.ok ? await searchRes.json() : { data: [] };
              const deezerArtist = searchData?.data?.[0];
              const rank = weeklyRank.get(a.name.toLowerCase()) || 9999;
              return {
                id: deezerArtist ? String(deezerArtist.id) : a.mbid || a.name,
                name: a.name,
                imageUrl: deezerArtist?.picture_xl || deezerArtist?.picture_big || deezerArtist?.picture_medium || a.image?.[3]?.['#text'] || '',
                popularity: rank,
              };
            } catch {
              return { id: a.mbid || a.name, name: a.name, imageUrl: a.image?.[3]?.['#text'] || '', popularity: 9999 };
            }
          });

          // Resolve tracks to Deezer
          const trackPromises = genreWeeklyTracks.slice(0, 20).map(async (t: any) => {
            try {
              const q = `${t.artist?.name || ''} ${t.name}`;
              const searchRes = await fetch(`${DEEZER_API}/search/track?q=${encodeURIComponent(q)}&limit=1`, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
              });
              const searchData = searchRes.ok ? await searchRes.json() : { data: [] };
              const dt = searchData?.data?.[0];
              if (!dt) return null;
              const trackKey = `${(t.artist?.name || '').toLowerCase()}::${t.name.toLowerCase()}`;
              const rank = weeklyTrackRank.get(trackKey) || 9999;
              return {
                id: String(dt.id),
                title: dt.title,
                artist: dt.artist?.name || t.artist?.name || 'Unknown',
                artistId: String(dt.artist?.id || ''),
                album: dt.album?.title || '',
                albumId: String(dt.album?.id || ''),
                duration: Math.round(dt.duration || 0),
                coverUrl: dt.album?.cover_xl || dt.album?.cover_big || dt.album?.cover_medium || '',
                weeklyRank: rank,
              };
            } catch {
              return null;
            }
          });

          const [artists, trackResults] = await Promise.all([
            Promise.all(artistPromises),
            Promise.all(trackPromises),
          ]);

          const tracks = trackResults.filter(Boolean);

          // Sort by weekly rank (lower = more popular this week)
          artists.sort((a: any, b: any) => (a.popularity || 9999) - (b.popularity || 9999));
          tracks.sort((a: any, b: any) => (a.weeklyRank || 9999) - (b.weeklyRank || 9999));

          return json({ artists, tracks });
        } catch (err) {
          console.error('Genre browse error:', err);
          return json({ artists: [], tracks: [] });
        }
      }

      case 'get-top-tags': {
        try {
          const lastfmKey = Deno.env.get('LASTFM_API_KEY');
          if (!lastfmKey) return json({ tags: [] });
          const limit = body.limit || 50;
          const res = await fetch(`https://ws.audioscrobbler.com/2.0/?method=chart.gettoptags&api_key=${lastfmKey}&format=json&limit=${limit}`);
          if (!res.ok) return json({ tags: [] });
          const data = await res.json();
          const tags = (data?.tags?.tag || []).map((t: any) => ({
            name: t.name,
            reach: parseInt(t.reach || '0', 10),
            taggings: parseInt(t.taggings || '0', 10),
          }));
          return json({ tags });
        } catch (err) {
          console.error('get-top-tags error:', err);
          return json({ tags: [] });
        }
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
