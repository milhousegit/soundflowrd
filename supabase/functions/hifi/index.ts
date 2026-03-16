import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// HiFi public REST API (same format as squidwtf mirrors)
const API_TARGETS = [
  'https://hifitui.401658.xyz',
  'https://hifitui.pages.dev',
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
        console.error(`[HiFi] ${url} -> ${res.status} (${text.substring(0, 120)})`);
        lastErr = new Error(`HTTP ${res.status}`);
        continue;
      }
      return await res.json();
    } catch (e) {
      console.error(`[HiFi] Fetch failed for ${url}:`, e);
      lastErr = e;
      continue;
    }
  }
  throw new Error(`All HiFi API targets failed${lastErr ? `: ${(lastErr as any)?.message ?? String(lastErr)}` : ''}`);
}

async function searchTrack(query: string): Promise<any[]> {
  console.log(`[HiFi] Searching: ${query}`);
  const data = await fetchJsonWithFallback(`/search/?s=${encodeURIComponent(query)}`);
  console.log(`[HiFi] Found ${data?.data?.items?.length || data?.items?.length || 0} results`);
  return data?.data?.items || data?.items || [];
}

async function getTrackStream(
  tidalId: string,
  quality = 'LOSSLESS'
): Promise<{ streamUrl: string; quality: string; bitDepth?: number; sampleRate?: number }> {
  console.log(`[HiFi] Getting stream for Tidal ID: ${tidalId}, quality: ${quality}`);
  const data = await fetchJsonWithFallback(`/track/?id=${encodeURIComponent(tidalId)}&quality=${encodeURIComponent(quality)}`);
  if (!data?.data) throw new Error('No track data returned');
  const trackData = data.data;

  if (trackData.manifestMimeType === 'application/vnd.tidal.bts') {
    const manifestJson = JSON.parse(atob(trackData.manifest));
    if (!manifestJson.urls || manifestJson.urls.length === 0) throw new Error('No stream URLs in manifest');
    return { streamUrl: manifestJson.urls[0], quality: trackData.audioQuality, bitDepth: trackData.bitDepth, sampleRate: trackData.sampleRate };
  } else if (trackData.manifestMimeType === 'application/dash+xml') {
    const manifestXml = atob(trackData.manifest);
    const initMatch = manifestXml.match(/initialization="([^"]+)"/);
    if (initMatch) {
      return { streamUrl: initMatch[1].replace(/&amp;/g, '&'), quality: trackData.audioQuality, bitDepth: trackData.bitDepth, sampleRate: trackData.sampleRate };
    }
    throw new Error('Could not parse DASH manifest');
  }
  throw new Error(`Unknown manifest type: ${trackData.manifestMimeType}`);
}

function normalize(str: string): string {
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function scoreMatch(tidalTrack: any, title: string, artist: string): number {
  const nTitle = normalize(title), nArtist = normalize(artist);
  const tTitle = normalize(tidalTrack.title || ''), tArtist = normalize(tidalTrack.artist?.name || tidalTrack.artists?.[0]?.name || '');
  let score = 0;
  if (tTitle === nTitle) score += 100;
  else if (tTitle.includes(nTitle) || nTitle.includes(tTitle)) score += 50;
  else { const w = nTitle.split(' ').filter(x => x.length > 2); score += (w.filter(x => tTitle.includes(x)).length / Math.max(w.length, 1)) * 40; }
  if (tArtist === nArtist) score += 100;
  else if (tArtist.includes(nArtist) || nArtist.includes(tArtist)) score += 50;
  else { const w = nArtist.split(' ').filter(x => x.length > 2); score += (w.filter(x => tArtist.includes(x)).length / Math.max(w.length, 1)) * 40; }
  return score;
}

async function findBestMatch(title: string, artist: string): Promise<{ tidalId: string; score: number } | null> {
  const queries = [`${artist} ${title}`, `${title} ${artist}`, title];
  let best: { id: string; score: number; track: any } | null = null;
  for (const q of queries) {
    try {
      const results = await searchTrack(q);
      if (!results.length) continue;
      const scored = results.map(t => ({ id: String(t.id), score: scoreMatch(t, title, artist), track: t }));
      scored.sort((a, b) => b.score - a.score);
      if (scored[0].score > (best?.score ?? 0)) best = scored[0];
      if (scored[0].score >= 80) return { tidalId: scored[0].id, score: scored[0].score };
    } catch (e) { console.error(`[HiFi] Search error for "${q}":`, e); }
  }
  if (best && best.score >= 40) return { tidalId: best.id, score: best.score };
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const { action, title, artist, tidalId, quality } = await req.json();
    console.log(`[HiFi] Request: action=${action}`);
    switch (action) {
      case 'search-and-stream': {
        if (!title || !artist) return new Response(JSON.stringify({ error: 'Title and artist are required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        const match = await findBestMatch(title, artist);
        if (!match) return new Response(JSON.stringify({ error: 'Track not found on HiFi' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        const stream = await getTrackStream(match.tidalId, quality || 'LOSSLESS');
        return new Response(JSON.stringify({ streamUrl: stream.streamUrl, tidalId: match.tidalId, quality: stream.quality, bitDepth: stream.bitDepth, sampleRate: stream.sampleRate, matchScore: match.score }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      case 'get-stream': {
        if (!tidalId) return new Response(JSON.stringify({ error: 'Tidal ID is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        const stream = await getTrackStream(tidalId, quality || 'LOSSLESS');
        return new Response(JSON.stringify({ streamUrl: stream.streamUrl, quality: stream.quality, bitDepth: stream.bitDepth, sampleRate: stream.sampleRate }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      case 'search': {
        if (!title) return new Response(JSON.stringify({ error: 'Search query required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        return new Response(JSON.stringify({ results: await searchTrack(artist ? `${artist} ${title}` : title) }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      default: return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  } catch (error) {
    console.error('[HiFi] Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
