import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// HiFi managed server (OpenSubsonic API)
const HIFI_BASE = 'https://hifi.401658.xyz';
const HIFI_USER = 'hifi';
const HIFI_PASS = 'local';
const SUBSONIC_VERSION = '1.16.1';
const CLIENT_NAME = 'SoundFlow';

function subsonicParams(): string {
  return `u=${HIFI_USER}&p=${HIFI_PASS}&v=${SUBSONIC_VERSION}&c=${CLIENT_NAME}&f=json`;
}

async function fetchSubsonic(path: string): Promise<any> {
  const url = `${HIFI_BASE}${path}${path.includes('?') ? '&' : '?'}${subsonicParams()}`;
  console.log(`[HiFi] Fetching: ${url.replace(HIFI_PASS, '***')}`);
  
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'SoundFlow/1.0',
      'Accept': 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[HiFi] HTTP ${res.status}: ${text.substring(0, 200)}`);
    throw new Error(`HiFi API error: HTTP ${res.status}`);
  }

  const data = await res.json();
  
  // OpenSubsonic wraps responses in subsonic-response
  const resp = data['subsonic-response'];
  if (resp && resp.status === 'failed') {
    throw new Error(resp.error?.message || 'HiFi API error');
  }
  
  return resp || data;
}

/**
 * Search for tracks on HiFi (Tidal via OpenSubsonic)
 */
async function searchTracks(query: string, count = 20): Promise<any[]> {
  console.log(`[HiFi] Searching: ${query}`);
  
  const data = await fetchSubsonic(`/rest/search3?query=${encodeURIComponent(query)}&songCount=${count}&artistCount=0&albumCount=0`);
  
  const songs = data?.searchResult3?.song || [];
  console.log(`[HiFi] Found ${songs.length} results`);
  return songs;
}

/**
 * Get stream URL for a track
 */
function getStreamUrl(songId: string): string {
  return `${HIFI_BASE}/rest/stream?id=${encodeURIComponent(songId)}&${subsonicParams()}`;
}

/**
 * Normalize strings for matching
 */
function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Score how well a HiFi song matches the requested track
 */
function scoreMatch(song: any, title: string, artist: string): number {
  const normalizedTitle = normalize(title);
  const normalizedArtist = normalize(artist);
  const songTitle = normalize(song.title || '');
  const songArtist = normalize(song.artist || '');
  
  let score = 0;
  
  // Title matching
  if (songTitle === normalizedTitle) {
    score += 100;
  } else if (songTitle.includes(normalizedTitle) || normalizedTitle.includes(songTitle)) {
    score += 50;
  } else {
    const titleWords = normalizedTitle.split(' ').filter((w: string) => w.length > 2);
    const matchingWords = titleWords.filter((w: string) => songTitle.includes(w));
    score += (matchingWords.length / Math.max(titleWords.length, 1)) * 40;
  }
  
  // Artist matching
  if (songArtist === normalizedArtist) {
    score += 100;
  } else if (songArtist.includes(normalizedArtist) || normalizedArtist.includes(songArtist)) {
    score += 50;
  } else {
    const artistWords = normalizedArtist.split(' ').filter((w: string) => w.length > 2);
    const matchingWords = artistWords.filter((w: string) => songArtist.includes(w));
    score += (matchingWords.length / Math.max(artistWords.length, 1)) * 40;
  }
  
  return score;
}

/**
 * Find the best matching track
 */
async function findBestMatch(title: string, artist: string): Promise<{ songId: string; score: number; song: any } | null> {
  const queries = [
    `${artist} ${title}`,
    `${title} ${artist}`,
    title,
  ];

  let bestOverall: { songId: string; score: number; song: any } | null = null;
  
  for (const query of queries) {
    try {
      const results = await searchTracks(query);
      
      if (results.length === 0) continue;
      
      const scored = results.map((song: any) => ({
        songId: String(song.id),
        score: scoreMatch(song, title, artist),
        song,
      }));
      
      scored.sort((a: any, b: any) => b.score - a.score);
      
      if (scored[0].score > (bestOverall?.score ?? 0)) {
        bestOverall = scored[0];
      }

      if (scored[0].score >= 80) {
        console.log(`[HiFi] Best match: "${scored[0].song.title}" by ${scored[0].song.artist} (score: ${scored[0].score})`);
        return bestOverall;
      }
    } catch (e) {
      console.error(`[HiFi] Search error for "${query}":`, e);
    }
  }

  if (bestOverall && bestOverall.score >= 40) {
    console.log(`[HiFi] Low-confidence match: "${bestOverall.song.title}" by ${bestOverall.song.artist} (score: ${bestOverall.score})`);
    return bestOverall;
  }
  
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, title, artist, songId, quality } = await req.json();
    
    console.log(`[HiFi] Request: action=${action}`);

    switch (action) {
      case 'search-and-stream': {
        if (!title || !artist) {
          return new Response(
            JSON.stringify({ error: 'Title and artist are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        const match = await findBestMatch(title, artist);
        
        if (!match) {
          console.log(`[HiFi] No match found for "${title}" by ${artist}`);
          return new Response(
            JSON.stringify({ error: 'Track not found on HiFi' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        const streamUrl = getStreamUrl(match.songId);
        
        return new Response(
          JSON.stringify({
            streamUrl,
            songId: match.songId,
            quality: quality || 'LOSSLESS',
            matchScore: match.score,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get-stream': {
        if (!songId) {
          return new Response(
            JSON.stringify({ error: 'Song ID is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        const streamUrl = getStreamUrl(songId);
        
        return new Response(
          JSON.stringify({
            streamUrl,
            quality: quality || 'LOSSLESS',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'search': {
        if (!title) {
          return new Response(
            JSON.stringify({ error: 'Search query (title) is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        const query = artist ? `${artist} ${title}` : title;
        const results = await searchTracks(query);
        
        return new Response(
          JSON.stringify({ results }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Unknown action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('[HiFi] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
