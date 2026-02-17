import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Monochrome.tf Tidal API mirrors
const API_TARGETS = [
  'https://ohio.monochrome.tf',
  'https://virginia.monochrome.tf',
  'https://oregon.monochrome.tf',
] as const;

async function fetchJsonWithFallback(path: string): Promise<any> {
  let lastErr: unknown;

  for (const baseUrl of API_TARGETS) {
    const url = `${baseUrl}${path}`;
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
        },
      });

      if (!res.ok) {
        const text = await res.text();
        console.error(`[Monochrome] ${url} -> ${res.status} (${text.substring(0, 120)})`);
        lastErr = new Error(`HTTP ${res.status}`);
        continue;
      }

      return await res.json();
    } catch (e) {
      console.error(`[Monochrome] Fetch failed for ${url}:`, e);
      lastErr = e;
      continue;
    }
  }

  throw new Error(`All API targets failed${lastErr ? `: ${(lastErr as any)?.message ?? String(lastErr)}` : ''}`);
}

async function searchTrack(query: string): Promise<any[]> {
  console.log(`[Monochrome] Searching: ${query}`);
  const data = await fetchJsonWithFallback(`/search/?s=${encodeURIComponent(query)}`);
  console.log(`[Monochrome] Found ${data?.data?.items?.length || data?.items?.length || 0} results`);
  return data?.data?.items || data?.items || [];
}

async function getTrackStream(
  tidalId: string,
  quality = 'LOSSLESS'
): Promise<{ streamUrl: string; quality: string; bitDepth?: number; sampleRate?: number }> {
  console.log(`[Monochrome] Getting stream for Tidal ID: ${tidalId}, quality: ${quality}`);

  const data = await fetchJsonWithFallback(
    `/track/?id=${encodeURIComponent(tidalId)}&quality=${encodeURIComponent(quality)}`
  );

  if (!data?.data) {
    throw new Error('No track data returned');
  }

  const trackData = data.data;

  if (trackData.manifestMimeType === 'application/vnd.tidal.bts') {
    const manifestJson = JSON.parse(atob(trackData.manifest));
    console.log(`[Monochrome] Manifest decoded, codec: ${manifestJson.codecs}`);

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
    const manifestXml = atob(trackData.manifest);
    console.log(`[Monochrome] DASH manifest, Hi-Res audio`);

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

function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreMatch(tidalTrack: any, title: string, artist: string): number {
  const normalizedTitle = normalize(title);
  const normalizedArtist = normalize(artist);
  const tidalTitle = normalize(tidalTrack.title || '');
  const tidalArtist = normalize(tidalTrack.artist?.name || tidalTrack.artists?.[0]?.name || '');
  
  let score = 0;
  
  if (tidalTitle === normalizedTitle) {
    score += 100;
  } else if (tidalTitle.includes(normalizedTitle) || normalizedTitle.includes(tidalTitle)) {
    score += 50;
  } else {
    const titleWords = normalizedTitle.split(' ').filter(w => w.length > 2);
    const matchingWords = titleWords.filter(w => tidalTitle.includes(w));
    score += (matchingWords.length / titleWords.length) * 40;
  }
  
  if (tidalArtist === normalizedArtist) {
    score += 100;
  } else if (tidalArtist.includes(normalizedArtist) || normalizedArtist.includes(tidalArtist)) {
    score += 50;
  } else {
    const artistWords = normalizedArtist.split(' ').filter(w => w.length > 2);
    const matchingWords = artistWords.filter(w => tidalArtist.includes(w));
    score += (matchingWords.length / Math.max(artistWords.length, 1)) * 40;
  }
  
  return score;
}

async function findBestMatch(title: string, artist: string): Promise<{ tidalId: string; score: number } | null> {
  const queries = [
    `${artist} ${title}`,
    `${title} ${artist}`,
    title,
  ];

  let bestOverall: { id: string; score: number; track: any } | null = null;
  
  for (const query of queries) {
    try {
      const results = await searchTrack(query);
      if (results.length === 0) continue;
      
      const scored = results.map(track => ({
        id: String(track.id),
        score: scoreMatch(track, title, artist),
        track,
      }));
      
      scored.sort((a, b) => b.score - a.score);
      
      if (scored[0].score > (bestOverall?.score ?? 0)) {
        bestOverall = scored[0];
      }

      if (scored[0].score >= 80) {
        console.log(`[Monochrome] Best match: "${scored[0].track.title}" by ${scored[0].track.artist?.name} (score: ${scored[0].score})`);
        return { tidalId: scored[0].id, score: scored[0].score };
      }
    } catch (e) {
      console.error(`[Monochrome] Search error for "${query}":`, e);
    }
  }

  if (bestOverall && bestOverall.score >= 40) {
    console.log(`[Monochrome] Low-confidence match: "${bestOverall.track.title}" by ${bestOverall.track.artist?.name} (score: ${bestOverall.score})`);
    return { tidalId: bestOverall.id, score: bestOverall.score };
  }
  
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, title, artist, tidalId, quality } = await req.json();
    
    console.log(`[Monochrome] Request: action=${action}`);

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
          console.log(`[Monochrome] No match found for "${title}" by ${artist}`);
          return new Response(
            JSON.stringify({ error: 'Track not found on Tidal' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        const stream = await getTrackStream(match.tidalId, quality || 'LOSSLESS');
        
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
    console.error('[Monochrome] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
