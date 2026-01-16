import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Public Tidal API mirrors used by tidal.squid.wtf.
// We avoid calling api.binimum.org directly because DNS resolution can fail in our runtime.
const API_TARGETS = [
  'https://triton.squid.wtf',
  'https://tidal-api.binimum.org',
  'https://tidal.kinoplus.online',
  'https://hund.qqdl.site',
  'https://katze.qqdl.site',
  'https://maus.qqdl.site',
] as const;

/**
 * Race all API targets in parallel and return the first successful response
 */
async function fetchJsonWithFallback(path: string): Promise<any> {
  const startTime = Date.now();
  console.log(`[SquidWTF] ⚡ Parallel fetch: ${path}`);

  // Create abort controllers for each request so we can cancel losers
  const controllers = API_TARGETS.map(() => new AbortController());

  const fetchPromises = API_TARGETS.map(async (baseUrl, index) => {
    const url = `${baseUrl}${path}`;
    const fetchStart = Date.now();
    
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
        },
        signal: controllers[index].signal,
      });

      const fetchDuration = Date.now() - fetchStart;

      if (!res.ok) {
        const text = await res.text();
        console.log(`[SquidWTF] ❌ ${baseUrl} -> ${res.status} (${fetchDuration}ms)`);
        throw new Error(`HTTP ${res.status}: ${text.substring(0, 80)}`);
      }

      const data = await res.json();
      console.log(`[SquidWTF] ✅ ${baseUrl} -> OK (${fetchDuration}ms)`);
      
      // Cancel all other pending requests
      controllers.forEach((c, i) => {
        if (i !== index) c.abort();
      });
      
      return { data, source: baseUrl };
    } catch (e: any) {
      if (e.name === 'AbortError') {
        // This is expected when we cancel losers
        throw e;
      }
      const fetchDuration = Date.now() - fetchStart;
      console.log(`[SquidWTF] ❌ ${baseUrl} -> Error (${fetchDuration}ms): ${e.message?.substring(0, 50)}`);
      throw e;
    }
  });

  try {
    // Promise.any resolves with the first successful promise
    const result = await Promise.any(fetchPromises);
    const totalTime = Date.now() - startTime;
    console.log(`[SquidWTF] 🏁 Fastest response from ${result.source} in ${totalTime}ms`);
    return result.data;
  } catch (aggregateError: any) {
    const totalTime = Date.now() - startTime;
    console.error(`[SquidWTF] 💥 All ${API_TARGETS.length} targets failed in ${totalTime}ms`);
    
    // Extract the actual errors from AggregateError
    const errors = aggregateError.errors || [];
    const errorMsgs = errors
      .filter((e: any) => e.name !== 'AbortError')
      .map((e: any) => e.message)
      .slice(0, 3);
    
    throw new Error(`All API targets failed: ${errorMsgs.join('; ')}`);
  }
}

/**
 * Search for a track on Tidal
 */
async function searchTrack(query: string): Promise<any[]> {
  console.log(`[SquidWTF] Searching: ${query}`);

  const data = await fetchJsonWithFallback(`/search/?s=${encodeURIComponent(query)}`);

  console.log(`[SquidWTF] Found ${data?.data?.items?.length || data?.items?.length || 0} results`);
  return data?.data?.items || data?.items || [];
}

/**
 * Get stream URL for a Tidal track
 */
async function getTrackStream(
  tidalId: string,
  quality = 'LOSSLESS'
): Promise<{ streamUrl: string; quality: string; bitDepth?: number; sampleRate?: number }> {
  console.log(`[SquidWTF] Getting stream for Tidal ID: ${tidalId}, quality: ${quality}`);

  const data = await fetchJsonWithFallback(
    `/track/?id=${encodeURIComponent(tidalId)}&quality=${encodeURIComponent(quality)}`
  );

  if (!data?.data) {
    throw new Error('No track data returned');
  }

  const trackData = data.data;

  // Decode the manifest to get the stream URL
  if (trackData.manifestMimeType === 'application/vnd.tidal.bts') {
    // Base64 encoded JSON manifest
    const manifestJson = JSON.parse(atob(trackData.manifest));
    console.log(`[SquidWTF] Manifest decoded, codec: ${manifestJson.codecs}`);

    if (!manifestJson.urls || manifestJson.urls.length === 0) {
      throw new Error('No stream URLs in manifest');
    }

    return {
      streamUrl: manifestJson.urls[0],
      quality: trackData.audioQuality,
      bitDepth: trackData.bitDepth,
      sampleRate: trackData.sampleRate,
    };
  } else if (trackData.manifestMimeType === 'application/dash+xml') {
    // DASH manifest for Hi-Res - decode and extract first segment URL
    const manifestXml = atob(trackData.manifest);
    console.log(`[SquidWTF] DASH manifest, Hi-Res audio`);

    // Extract initialization URL from the manifest
    const initMatch = manifestXml.match(/initialization="([^"]+)"/);
    if (initMatch) {
      const initUrl = initMatch[1].replace(/&amp;/g, '&');
      return {
        streamUrl: initUrl,
        quality: trackData.audioQuality,
        bitDepth: trackData.bitDepth,
        sampleRate: trackData.sampleRate,
      };
    }

    throw new Error('Could not parse DASH manifest');
  }

  throw new Error(`Unknown manifest type: ${trackData.manifestMimeType}`);
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
 * Score how well a Tidal track matches the Deezer track
 */
function scoreMatch(tidalTrack: any, title: string, artist: string): number {
  const normalizedTitle = normalize(title);
  const normalizedArtist = normalize(artist);
  const tidalTitle = normalize(tidalTrack.title || '');
  const tidalArtist = normalize(tidalTrack.artist?.name || tidalTrack.artists?.[0]?.name || '');
  
  let score = 0;
  
  // Title matching
  if (tidalTitle === normalizedTitle) {
    score += 100;
  } else if (tidalTitle.includes(normalizedTitle) || normalizedTitle.includes(tidalTitle)) {
    score += 50;
  } else {
    // Partial word matching
    const titleWords = normalizedTitle.split(' ').filter(w => w.length > 2);
    const matchingWords = titleWords.filter(w => tidalTitle.includes(w));
    score += (matchingWords.length / titleWords.length) * 40;
  }
  
  // Artist matching
  if (tidalArtist === normalizedArtist) {
    score += 100;
  } else if (tidalArtist.includes(normalizedArtist) || normalizedArtist.includes(tidalArtist)) {
    score += 50;
  } else {
    const artistWords = normalizedArtist.split(' ').filter(w => w.length > 2);
    const matchingWords = artistWords.filter(w => tidalArtist.includes(w));
    score += (matchingWords.length / Math.max(artistWords.length, 1)) * 40;
  }
  
  // Duration similarity bonus (if within 5 seconds)
  // We don't have duration here but could add if needed
  
  return score;
}

/**
 * Find the best matching track on Tidal
 */
async function findBestMatch(title: string, artist: string): Promise<{ tidalId: string; score: number } | null> {
  // Try different search strategies
  const queries = [
    `${artist} ${title}`,
    `${title} ${artist}`,
    title,
  ];
  
  for (const query of queries) {
    try {
      const results = await searchTrack(query);
      
      if (results.length === 0) continue;
      
      // Score each result
      const scored = results.map(track => ({
        id: String(track.id),
        score: scoreMatch(track, title, artist),
        track,
      }));
      
      // Sort by score
      scored.sort((a, b) => b.score - a.score);
      
      // Return best match if score is good enough
      if (scored[0].score >= 80) {
        console.log(`[SquidWTF] Best match: "${scored[0].track.title}" by ${scored[0].track.artist?.name} (score: ${scored[0].score})`);
        return { tidalId: scored[0].id, score: scored[0].score };
      }
    } catch (e) {
      console.error(`[SquidWTF] Search error for "${query}":`, e);
    }
  }
  
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, title, artist, tidalId, quality } = await req.json();
    
    console.log(`[SquidWTF] Request: action=${action}`);

    switch (action) {
      case 'search-and-stream': {
        const totalStart = Date.now();
        // Search for the track on Tidal and get stream
        if (!title || !artist) {
          return new Response(
            JSON.stringify({ error: 'Title and artist are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        console.log(`[SquidWTF] 🔍 Step 1: Finding best match...`);
        const matchStart = Date.now();
        const match = await findBestMatch(title, artist);
        const matchDuration = Date.now() - matchStart;
        console.log(`[SquidWTF] 🔍 Step 1 done: ${matchDuration}ms`);
        
        if (!match) {
          console.log(`[SquidWTF] ❌ No match found for "${title}" by ${artist} (total: ${Date.now() - totalStart}ms)`);
          return new Response(
            JSON.stringify({ error: 'Track not found on Tidal' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        console.log(`[SquidWTF] 🎵 Step 2: Getting stream for ID ${match.tidalId}...`);
        const streamStart = Date.now();
        const stream = await getTrackStream(match.tidalId, quality || 'LOSSLESS');
        const streamDuration = Date.now() - streamStart;
        console.log(`[SquidWTF] 🎵 Step 2 done: ${streamDuration}ms`);
        
        const totalDuration = Date.now() - totalStart;
        console.log(`[SquidWTF] ✅ Total time: ${totalDuration}ms (match: ${matchDuration}ms, stream: ${streamDuration}ms)`);
        
        return new Response(
          JSON.stringify({
            streamUrl: stream.streamUrl,
            tidalId: match.tidalId,
            quality: stream.quality,
            bitDepth: stream.bitDepth,
            sampleRate: stream.sampleRate,
            matchScore: match.score,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get-stream': {
        // Get stream for a known Tidal ID
        if (!tidalId) {
          return new Response(
            JSON.stringify({ error: 'Tidal ID is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        const stream = await getTrackStream(tidalId, quality || 'LOSSLESS');
        
        return new Response(
          JSON.stringify({
            streamUrl: stream.streamUrl,
            quality: stream.quality,
            bitDepth: stream.bitDepth,
            sampleRate: stream.sampleRate,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'search': {
        // Just search, don't get stream
        if (!title) {
          return new Response(
            JSON.stringify({ error: 'Search query (title) is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        const query = artist ? `${artist} ${title}` : title;
        const results = await searchTrack(query);
        
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
    console.error('[SquidWTF] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
