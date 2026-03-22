import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ── Uptime tracker URLs ──
const UPTIME_TRACKERS = [
  'https://tidal-uptime.jiffy-puffs-1j.workers.dev',
  'https://tidal-uptime.props-76styles.workers.dev',
];

// Fallback instances if all trackers are down
const FALLBACK_API = [
  'https://eu-central.monochrome.tf',
  'https://us-west.monochrome.tf',
  'https://api.monochrome.tf',
  'https://hifi-one.spotisaver.net',
  'https://tidal.kinoplus.online',
];
const FALLBACK_STREAM = [
  'https://hifi-one.spotisaver.net',
  'https://api.monochrome.tf',
];

// ── Instance cache (lives as long as the edge function isolate, ~5min) ──
let cachedInstances: { api: string[]; stream: string[] } | null = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getLiveInstances(): Promise<{ api: string[]; stream: string[] }> {
  if (cachedInstances && Date.now() - cacheTime < CACHE_TTL) {
    return cachedInstances;
  }

  for (const trackerUrl of UPTIME_TRACKERS) {
    try {
      const res = await fetch(trackerUrl, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) { await res.text(); continue; }

      const data = await res.json();
      const apiInstances: string[] = [];
      const streamInstances: string[] = [];

      // The tracker returns an object with instance URLs as keys
      // Each has { search: status, track: status } where status is HTTP code or "error"
      if (data && typeof data === 'object') {
        for (const [url, status] of Object.entries(data)) {
          const s = status as any;
          // An instance is "up" for search if search status is 200 or 400 (400 = missing param but alive)
          if (s?.search === 200 || s?.search === 400) {
            apiInstances.push(url.replace(/\/$/, ''));
          }
          if (s?.track === 200 || s?.track === 400) {
            streamInstances.push(url.replace(/\/$/, ''));
          }
        }
      }

      if (apiInstances.length > 0) {
        cachedInstances = { api: apiInstances, stream: streamInstances.length > 0 ? streamInstances : apiInstances };
        cacheTime = Date.now();
        console.log(`[Monochrome] Tracker OK: ${apiInstances.length} api, ${streamInstances.length} stream instances`);
        return cachedInstances;
      }
    } catch (e) {
      console.error(`[Monochrome] Tracker ${trackerUrl} failed:`, e);
    }
  }

  console.warn('[Monochrome] All trackers failed, using fallback instances');
  cachedInstances = { api: FALLBACK_API, stream: FALLBACK_STREAM };
  cacheTime = Date.now();
  return cachedInstances;
}

// ── Fetch with fallback across instances ──
async function fetchWithFallback(path: string, instances: string[]): Promise<any> {
  let lastErr: unknown;

  for (const baseUrl of instances) {
    const url = `${baseUrl}${path}`;
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error(`[Monochrome] ${url} -> ${res.status} (${text.substring(0, 120)})`);
        lastErr = new Error(`HTTP ${res.status}`);
        continue;
      }

      const json = await res.json();
      // Normalize: some instances wrap in { data: ... }
      return json?.data ?? json;
    } catch (e) {
      console.error(`[Monochrome] Fetch failed ${url}:`, e);
      lastErr = e;
    }
  }

  throw new Error(`All instances failed${lastErr ? `: ${(lastErr as any)?.message ?? String(lastErr)}` : ''}`);
}

// ── Extract stream URL from manifest ──
function extractStreamUrl(trackData: any): {
  streamUrl: string;
  quality: string;
  bitDepth?: number;
  sampleRate?: number;
} {
  // Some instances return OriginalTrackUrl directly
  if (trackData.OriginalTrackUrl) {
    return {
      streamUrl: trackData.OriginalTrackUrl,
      quality: trackData.audioQuality || 'LOSSLESS',
      bitDepth: trackData.bitDepth,
      sampleRate: trackData.sampleRate,
    };
  }

  const manifest = trackData.manifest;
  const mimeType = trackData.manifestMimeType;

  if (!manifest) {
    throw new Error('No manifest in track data');
  }

  if (mimeType === 'application/vnd.tidal.bts') {
    // manifest can be base64 string or already parsed object
    let parsed: any;
    if (typeof manifest === 'string') {
      parsed = JSON.parse(atob(manifest));
    } else {
      parsed = manifest;
    }

    if (!parsed.urls || parsed.urls.length === 0) {
      throw new Error('No stream URLs in BTS manifest');
    }

    console.log(`[Monochrome] BTS manifest, codec: ${parsed.codecs}`);
    return {
      streamUrl: parsed.urls[0],
      quality: trackData.audioQuality || 'LOSSLESS',
      bitDepth: trackData.bitDepth,
      sampleRate: trackData.sampleRate,
    };
  }

  if (mimeType === 'application/dash+xml') {
    const xml = typeof manifest === 'string' ? atob(manifest) : String(manifest);
    console.log('[Monochrome] DASH manifest (Hi-Res)');

    // Extract BaseURL or initialization URL
    const baseUrlMatch = xml.match(/<BaseURL>([^<]+)<\/BaseURL>/);
    if (baseUrlMatch) {
      return {
        streamUrl: baseUrlMatch[1].replace(/&amp;/g, '&'),
        quality: trackData.audioQuality || 'HI_RES_LOSSLESS',
        bitDepth: trackData.bitDepth,
        sampleRate: trackData.sampleRate,
      };
    }

    const initMatch = xml.match(/initialization="([^"]+)"/);
    if (initMatch) {
      return {
        streamUrl: initMatch[1].replace(/&amp;/g, '&'),
        quality: trackData.audioQuality || 'HI_RES_LOSSLESS',
        bitDepth: trackData.bitDepth,
        sampleRate: trackData.sampleRate,
      };
    }

    throw new Error('Could not parse DASH manifest');
  }

  throw new Error(`Unknown manifest type: ${mimeType}`);
}

// ── Search ──
async function searchTrack(query: string): Promise<any[]> {
  console.log(`[Monochrome] Searching: ${query}`);
  const { api } = await getLiveInstances();
  const data = await fetchWithFallback(`/search/?s=${encodeURIComponent(query)}`, api);
  const items = data?.items || [];
  console.log(`[Monochrome] Found ${items.length} results`);
  return items;
}

// ── Get stream ──
async function getTrackStream(
  tidalId: string,
  quality = 'LOSSLESS'
): Promise<{ streamUrl: string; quality: string; bitDepth?: number; sampleRate?: number }> {
  console.log(`[Monochrome] Getting stream for ID: ${tidalId}, quality: ${quality}`);
  const { stream, api } = await getLiveInstances();

  // Try streaming instances first, then fall back to api instances
  const allInstances = [...new Set([...stream, ...api])];
  const data = await fetchWithFallback(
    `/track/?id=${encodeURIComponent(tidalId)}&quality=${encodeURIComponent(quality)}`,
    allInstances
  );

  return extractStreamUrl(data);
}

// ── Match scoring ──
function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreMatch(track: any, title: string, artist: string): number {
  const nTitle = normalize(title);
  const nArtist = normalize(artist);
  const tTitle = normalize(track.title || '');
  const tArtist = normalize(track.artist?.name || track.artists?.[0]?.name || '');

  let score = 0;

  if (tTitle === nTitle) score += 100;
  else if (tTitle.includes(nTitle) || nTitle.includes(tTitle)) score += 50;
  else {
    const words = nTitle.split(' ').filter(w => w.length > 2);
    const matched = words.filter(w => tTitle.includes(w));
    score += (matched.length / Math.max(words.length, 1)) * 40;
  }

  if (tArtist === nArtist) score += 100;
  else if (tArtist.includes(nArtist) || nArtist.includes(tArtist)) score += 50;
  else {
    const words = nArtist.split(' ').filter(w => w.length > 2);
    const matched = words.filter(w => tArtist.includes(w));
    score += (matched.length / Math.max(words.length, 1)) * 40;
  }

  return score;
}

async function findBestMatch(title: string, artist: string): Promise<{ tidalId: string; score: number } | null> {
  const queries = [`${artist} ${title}`, `${title} ${artist}`, title];
  let best: { id: string; score: number; track: any } | null = null;

  for (const query of queries) {
    try {
      const results = await searchTrack(query);
      if (!results.length) continue;

      const scored = results.map(t => ({
        id: String(t.id),
        score: scoreMatch(t, title, artist),
        track: t,
      }));
      scored.sort((a, b) => b.score - a.score);

      if (scored[0].score > (best?.score ?? 0)) {
        best = scored[0];
      }
      if (scored[0].score >= 80) {
        console.log(`[Monochrome] Match: "${scored[0].track.title}" by ${scored[0].track.artist?.name} (score: ${scored[0].score})`);
        return { tidalId: scored[0].id, score: scored[0].score };
      }
    } catch (e) {
      console.error(`[Monochrome] Search error for "${query}":`, e);
    }
  }

  if (best && best.score >= 40) {
    console.log(`[Monochrome] Low-confidence match: "${best.track.title}" (score: ${best.score})`);
    return { tidalId: best.id, score: best.score };
  }

  return null;
}

// ── Serve ──
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { action, title, artist, tidalId, quality } = await req.json();
    console.log(`[Monochrome] action=${action}`);

    switch (action) {
      case 'search-and-stream': {
        if (!title || !artist) {
          return new Response(JSON.stringify({ error: 'Title and artist required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const match = await findBestMatch(title, artist);
        if (!match) {
          return new Response(JSON.stringify({ error: 'Track not found on Tidal' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const stream = await getTrackStream(match.tidalId, quality || 'LOSSLESS');
        return new Response(JSON.stringify({
          streamUrl: stream.streamUrl,
          tidalId: match.tidalId,
          quality: stream.quality,
          bitDepth: stream.bitDepth,
          sampleRate: stream.sampleRate,
          matchScore: match.score,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'get-stream': {
        if (!tidalId) {
          return new Response(JSON.stringify({ error: 'Tidal ID required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const stream = await getTrackStream(tidalId, quality || 'LOSSLESS');
        return new Response(JSON.stringify({
          streamUrl: stream.streamUrl,
          quality: stream.quality,
          bitDepth: stream.bitDepth,
          sampleRate: stream.sampleRate,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'search': {
        if (!title) {
          return new Response(JSON.stringify({ error: 'Search query required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const results = await searchTrack(artist ? `${artist} ${title}` : title);
        return new Response(JSON.stringify({ results }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      default:
        return new Response(JSON.stringify({ error: 'Unknown action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  } catch (error) {
    console.error('[Monochrome] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
