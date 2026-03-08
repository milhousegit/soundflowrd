import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEEZER_API = 'https://api.deezer.com';

interface SpotifyTrack {
  id: string;
  title: string;
  artist: string;
  artistId: string;
  album: string;
  albumId: string;
  coverUrl: string;
  duration: number;
}

// ── Spotify fetch helpers (reused from spotify-import) ──

async function getAnonymousToken(): Promise<string | null> {
  try {
    console.log('Fetching anonymous Spotify token...');
    const tokenResponse = await fetch('https://open.spotify.com/get_access_token?reason=transport&productType=web_player', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://open.spotify.com/',
        'Origin': 'https://open.spotify.com',
      },
    });
    console.log('Token response status:', tokenResponse.status);
    if (tokenResponse.ok) {
      const data = await tokenResponse.json();
      if (data.accessToken) {
        console.log('Got anonymous token via get_access_token');
        return data.accessToken;
      }
      console.log('No accessToken in response:', JSON.stringify(data).substring(0, 200));
    }
    
    console.log('Trying embed page for token...');
    const embedResponse = await fetch('https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    console.log('Embed response status:', embedResponse.status);
    if (embedResponse.ok) {
      const html = await embedResponse.text();
      const m = html.match(/"accessToken":"([^"]+)"/);
      if (m) {
        console.log('Got anonymous token via embed page');
        return m[1];
      }
      // Try alt pattern
      const altM = html.match(/accessToken['"]\s*:\s*['"]([^'"]+)['"]/);
      if (altM) {
        console.log('Got anonymous token via embed page (alt)');
        return altM[1];
      }
      console.log('No token found in embed HTML');
    }
    
    return null;
  } catch (e) {
    console.error('Token fetch error:', e);
    return null;
  }
}

async function fetchPlaylistTracks(playlistId: string, token: string): Promise<SpotifyTrack[]> {
  console.log(`fetchPlaylistTracks: playlistId=${playlistId}`);
  const variables = { uri: `spotify:playlist:${playlistId}`, offset: 0, limit: 100 };
  const extensions = { persistedQuery: { version: 1, sha256Hash: "b39f62e9b566aa849b1780927de1f9583b1e753861cc9eb4e7db49ec82a9a76a" } };
  const url = `https://api-partner.spotify.com/pathfinder/v1/query?operationName=fetchPlaylist&variables=${encodeURIComponent(JSON.stringify(variables))}&extensions=${encodeURIComponent(JSON.stringify(extensions))}`;

  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Origin': 'https://open.spotify.com',
        'Referer': 'https://open.spotify.com/',
        'app-platform': 'WebPlayer',
        'spotify-app-version': '1.2.0.0',
      },
    });

    console.log(`GraphQL response status: ${response.status}`);

    if (!response.ok) {
      console.log(`GraphQL failed, trying web API...`);
      return await fetchPlaylistTracksWebAPI(playlistId, token);
    }

    const data = await response.json();
    console.log(`GraphQL response keys: ${Object.keys(data || {}).join(', ')}`);
    const items = data?.data?.playlistV2?.content?.items || [];
    const tracks: SpotifyTrack[] = [];

    for (let i = 0; i < items.length; i++) {
      const track = items[i]?.itemV2?.data;
      if (!track || track.__typename !== 'Track') continue;
      const artists = track.artists?.items || [];
      const artistNames = artists.map((a: any) => a?.profile?.name).filter(Boolean).join(', ');
      const album = track.albumOfTrack || {};
      tracks.push({
        id: track.uri?.replace('spotify:track:', '') || `sp-${i}`,
        title: track.name || 'Unknown',
        artist: artistNames || 'Unknown',
        artistId: (artists[0]?.uri || '').replace('spotify:artist:', ''),
        album: album.name || '',
        albumId: (album.uri || '').replace('spotify:album:', ''),
        coverUrl: album.coverArt?.sources?.[0]?.url || '',
        duration: Math.floor((track.duration?.totalMilliseconds || 0) / 1000),
      });
    }

    console.log(`GraphQL: got ${tracks.length} tracks`);
    if (tracks.length === 0) return await fetchPlaylistTracksWebAPI(playlistId, token);
    return tracks;
  } catch (e) {
    console.error('fetchPlaylistTracks error:', e);
    return await fetchPlaylistTracksWebAPI(playlistId, token);
  }
}

async function fetchPlaylistTracksWebAPI(playlistId: string, token: string): Promise<SpotifyTrack[]> {
  console.log(`Trying Spotify Web API for ${playlistId}...`);
  const response = await fetch(
    `https://api.spotify.com/v1/playlists/${playlistId}?fields=tracks.items(track(id,name,duration_ms,artists(id,name),album(id,name,images)))&limit=100`,
    { headers: { 'Authorization': `Bearer ${token}`, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'application/json' } }
  );
  console.log(`Web API response status: ${response.status}`);
  if (!response.ok) {
    const body = await response.text();
    console.log(`Web API error body: ${body.substring(0, 300)}`);
    return [];
  }
  const data = await response.json();
  console.log(`Web API tracks count: ${data.tracks?.items?.length || 0}`);
  return (data.tracks?.items || []).filter((i: any) => i?.track).map((item: any, idx: number) => ({
    id: item.track.id || `sp-${idx}`,
    title: item.track.name || 'Unknown',
    artist: item.track.artists?.map((a: any) => a.name).join(', ') || 'Unknown',
    artistId: String(item.track.artists?.[0]?.id || ''),
    album: item.track.album?.name || '',
    albumId: String(item.track.album?.id || ''),
    coverUrl: item.track.album?.images?.[0]?.url || '',
    duration: Math.floor((item.track.duration_ms || 0) / 1000),
  }));
}

// ── Deezer matching ──

function normalizeString(str: string): string {
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\s]/g, '').trim();
}

function cleanTitle(title: string): string {
  return title.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
}

interface DeezerMatch {
  id: string; title: string; artist: string; artistId: string;
  album: string; albumId: string; coverUrl: string; duration: number;
}

async function searchDeezer(title: string, artist: string): Promise<DeezerMatch | null> {
  const firstArtist = artist.split(',')[0].trim();
  const cleaned = cleanTitle(title);
  const queries = [`${cleaned} ${firstArtist}`];
  if (cleaned !== title) queries.push(`${title} ${firstArtist}`);

  for (const q of queries) {
    try {
      const res = await fetch(`${DEEZER_API}/search/track?q=${encodeURIComponent(q)}&limit=5`, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
      });
      if (!res.ok) continue;
      const data = await res.json();
      const tracks = data.data || [];
      if (!tracks.length) continue;

      const nt = normalizeString(cleaned);
      const na = normalizeString(firstArtist);
      let best = tracks[0], bestScore = 0;

      for (const t of tracks) {
        const tt = normalizeString(t.title || '');
        const ta = normalizeString(t.artist?.name || '');
        let score = 0;
        if (tt === nt) score += 50; else if (tt.includes(nt) || nt.includes(tt)) score += 30;
        if (ta === na) score += 50; else if (ta.includes(na) || na.includes(ta)) score += 30;
        if (score > bestScore) { bestScore = score; best = t; }
      }

      if (bestScore >= 40) {
        return {
          id: String(best.id), title: best.title,
          artist: best.artist?.name || artist,
          artistId: String(best.artist?.id || ''),
          album: best.album?.title || '',
          albumId: String(best.album?.id || ''),
          coverUrl: best.album?.cover_medium || best.album?.cover || '',
          duration: best.duration || 0,
        };
      }
    } catch { /* continue */ }
  }
  return null;
}

async function matchAll(tracks: SpotifyTrack[]): Promise<DeezerMatch[]> {
  const matched: DeezerMatch[] = [];
  const batchSize = 5;
  for (let i = 0; i < tracks.length; i += batchSize) {
    const batch = tracks.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(t => searchDeezer(t.title, t.artist)));
    for (const r of results) { if (r) matched.push(r); }
    if (i + batchSize < tracks.length) await new Promise(r => setTimeout(r, 200));
  }
  return matched;
}

// ── Main handler ──

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get all chart configs that have a spotify_url linked via sf: prefix
    const { data: configs, error: cfgErr } = await supabase
      .from('chart_configurations')
      .select('*')
      .like('playlist_id', 'sf:%');

    if (cfgErr) throw cfgErr;
    if (!configs || configs.length === 0) {
      return new Response(JSON.stringify({ message: 'No chart playlists to sync' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results: any[] = [];

    for (const config of configs) {
      const sfId = config.playlist_id.replace('sf:', '');

      // Get the playlist to find its spotify_url
      const { data: playlist } = await supabase
        .from('playlists')
        .select('id, name, spotify_url, cover_url')
        .eq('id', sfId)
        .single();

      if (!playlist?.spotify_url) {
        results.push({ country: config.country_code, status: 'skipped', reason: 'no spotify_url' });
        continue;
      }

      const spotifyId = extractSpotifyId(playlist.spotify_url);
      if (!spotifyId) {
        results.push({ country: config.country_code, status: 'skipped', reason: 'invalid spotify_url' });
        continue;
      }

      console.log(`Syncing ${config.country_code}: Spotify ${spotifyId} -> SoundFlow ${sfId}`);

      // 1. Get Spotify tracks - use the spotify-import function
      console.log(`Calling spotify-import for ${playlist.spotify_url}`);
      const importRes = await fetch(`${supabaseUrl}/functions/v1/spotify-import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({ url: playlist.spotify_url }),
      });

      if (!importRes.ok) {
        const err = await importRes.text();
        console.error(`spotify-import failed: ${importRes.status} ${err}`);
        results.push({ country: config.country_code, status: 'error', reason: `import failed: ${importRes.status}` });
        continue;
      }

      const importData = await importRes.json();
      if (importData.error || !importData.tracks?.length) {
        results.push({ country: config.country_code, status: 'error', reason: importData.error || 'no tracks' });
        continue;
      }

      const spotifyTracks = importData.tracks;
      console.log(`Got ${spotifyTracks.length} tracks from spotify-import for ${config.country_code}`);

      console.log(`Got ${spotifyTracks.length} Spotify tracks for ${config.country_code}`);

      // 2. The tracks are already Deezer-matched from spotify-import
      // Insert them directly
      const deezerTracks = spotifyTracks.filter((t: any) => !t.id.startsWith('spotify-'));
      console.log(`${deezerTracks.length}/${spotifyTracks.length} matched with Deezer`);

      if (deezerTracks.length === 0) {
        results.push({ country: config.country_code, status: 'error', reason: 'no deezer matches' });
        continue;
      }

      // 3. Replace playlist tracks
      // Delete existing tracks
      await supabase.from('playlist_tracks').delete().eq('playlist_id', sfId);

      // Insert new tracks
      const trackRows = deezerTracks.map((t, idx) => ({
        playlist_id: sfId,
        track_id: t.id,
        track_title: t.title,
        track_artist: t.artist,
        track_album: t.album,
        track_album_id: t.albumId,
        track_cover_url: t.coverUrl,
        track_duration: t.duration,
        position: idx,
      }));

      const { error: insertErr } = await supabase.from('playlist_tracks').insert(trackRows);
      if (insertErr) {
        console.error('Insert error:', insertErr);
        results.push({ country: config.country_code, status: 'error', reason: insertErr.message });
        continue;
      }

      // 4. Update playlist track_count
      await supabase.from('playlists').update({
        track_count: deezerTracks.length,
        updated_at: new Date().toISOString(),
      }).eq('id', sfId);

      results.push({
        country: config.country_code,
        status: 'synced',
        tracks: deezerTracks.length,
        matched: `${deezerTracks.length}/${spotifyTracks.length}`,
      });

      console.log(`✅ ${config.country_code} synced: ${deezerTracks.length} tracks`);
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Sync error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function extractSpotifyId(url: string): string | null {
  const m = url.match(/spotify\.com\/playlist\/([a-zA-Z0-9]+)/);
  return m ? m[1] : null;
}
