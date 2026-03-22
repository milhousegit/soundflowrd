const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// --- Spotify Client Credentials token (for search API to resolve track IDs) ---
let cachedClientToken: string | null = null;
let clientTokenExpiry = 0;

async function getSpotifyClientToken(): Promise<string | null> {
  const now = Date.now();
  if (cachedClientToken && now < clientTokenExpiry - 60_000) return cachedClientToken;
  const clientId = Deno.env.get('SPOTIFY_CLIENT_ID');
  const clientSecret = Deno.env.get('SPOTIFY_CLIENT_SECRET');
  if (!clientId || !clientSecret) return null;
  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) return null;
    const data = await res.json();
    cachedClientToken = data.access_token;
    clientTokenExpiry = now + data.expires_in * 1000;
    return cachedClientToken;
  } catch { return null; }
}

// --- Resolve Deezer track ID to Spotify track ID via search ---
async function resolveSpotifyTrackId(track: { id: string; title: string; artist: string }): Promise<string | null> {
  // Already a Spotify-format ID (22-char alphanumeric)
  if (/^[a-zA-Z0-9]{22}$/.test(track.id)) return track.id;

  const token = await getSpotifyClientToken();
  if (!token) return null;

  try {
    const query = `track:${track.title} artist:${track.artist}`;
    const res = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.tracks?.items?.[0]?.id || null;
  } catch { return null; }
}

// --- Scrape canvas URL from canvasdownloader.com ---
async function fetchCanvasUrlFromScraper(spotifyTrackId: string): Promise<string | null> {
  try {
    const url = `https://www.canvasdownloader.com/canvas?link=https://open.spotify.com/track/${spotifyTrackId}`;
    console.log(`[Canvas] Scraping: ${url}`);
    
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    
    if (!res.ok) {
      console.log(`[Canvas] Scraper returned ${res.status}`);
      return null;
    }
    
    const html = await res.text();
    
    // Extract canvas URL from <source src="..."> tag
    const sourceMatch = html.match(/<source\s+src="(https:\/\/canvaz\.scdn\.co\/[^"]+)"/);
    if (sourceMatch?.[1]) {
      console.log(`[Canvas] Found canvas URL: ${sourceMatch[1]}`);
      return sourceMatch[1];
    }
    
    // Fallback: look for any canvaz.scdn.co URL in the page
    const fallbackMatch = html.match(/(https:\/\/canvaz\.scdn\.co\/[^\s"'<>]+\.mp4)/);
    if (fallbackMatch?.[1]) {
      console.log(`[Canvas] Found canvas URL (fallback): ${fallbackMatch[1]}`);
      return fallbackMatch[1];
    }
    
    console.log(`[Canvas] No canvas found in HTML for track ${spotifyTrackId}`);
    return null;
  } catch (error) {
    console.error(`[Canvas] Scraper error:`, error);
    return null;
  }
}

// --- Main handler ---
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json() as {
      tracks: { id: string; title: string; artist: string }[];
    };

    const tracks = body.tracks;
    if (!tracks?.length) {
      return new Response(
        JSON.stringify({ error: 'No tracks provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const batch = tracks.slice(0, 10);
    console.log(`[Canvas] Processing ${batch.length} tracks...`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const results: { track_id: string; canvas_url: string }[] = [];

    for (const track of batch) {
      // 1. Resolve to Spotify ID
      console.log(`[Canvas] Resolving: "${track.title}" by ${track.artist} (id: ${track.id})`);
      const spotifyId = await resolveSpotifyTrackId(track);
      if (!spotifyId) {
        console.log(`[Canvas] Could not resolve Spotify ID for ${track.id}`);
        continue;
      }
      console.log(`[Canvas] Spotify ID: ${spotifyId}`);

      // 2. Scrape canvas URL from canvasdownloader.com
      const canvasUrl = await fetchCanvasUrlFromScraper(spotifyId);
      if (!canvasUrl) continue;

      // 3. Store with ORIGINAL track ID (Deezer ID)
      results.push({ track_id: track.id, canvas_url: canvasUrl });
      await supabase.from('track_canvases').upsert(
        { track_id: track.id, canvas_url: canvasUrl, updated_at: new Date().toISOString() },
        { onConflict: 'track_id' }
      );
    }

    console.log(`[Canvas] Found ${results.length}/${batch.length} canvases`);

    return new Response(
      JSON.stringify({ results, found: results.length, total: batch.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in spotify-canvas:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
