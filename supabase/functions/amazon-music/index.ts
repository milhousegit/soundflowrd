import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const browserHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

const knownLucidaErrors = [
  "An error occured trying to process your request.",
  'Message: "Cannot contact any valid server"',
  "An error occurred. Had an issue getting that item, try again.",
];

function parseEnclosedValue(startMarker: string, endMarker: string, text: string): string | null {
  const startIndex = text.indexOf(startMarker);
  if (startIndex === -1) return null;
  const contentStart = startIndex + startMarker.length;
  const endIndex = text.indexOf(endMarker, contentStart);
  if (endIndex === -1) return null;
  return text.substring(contentStart, endIndex);
}

function htmlHasKnownError(html: string): string | null {
  for (const msg of knownLucidaErrors) {
    if (html.includes(msg)) return msg;
  }
  return null;
}

async function fetchLucidaHtml(resolveUrl: string): Promise<{ html: string }> {
  // Try direct fetch first
  try {
    const r = await fetch(resolveUrl, { headers: browserHeaders, redirect: 'follow' });
    if (r.ok) {
      const html = await r.text();
      if (!htmlHasKnownError(html)) return { html };
    }
  } catch (e) {
    console.error('[Amazon-Lucida] direct fetch failed', e);
  }

  // Firecrawl fallback
  const fcKey = Deno.env.get('FIRECRAWL_API_KEY');
  if (!fcKey) throw new Error('Direct fetch failed and FIRECRAWL_API_KEY not set');

  const r = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${fcKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: resolveUrl,
      formats: ['html', 'rawHtml'],
      onlyMainContent: false,
      waitFor: 6000,
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Firecrawl failed: ${r.status}`);
  const html = j?.data?.html ?? j?.html ?? j?.data?.rawHtml ?? j?.rawHtml;
  if (!html) throw new Error('Firecrawl returned no html');
  return { html };
}

// ===== SEARCH =====
interface SearchResult {
  id: string;
  url: string;
  title: string;
  artist: string;
  album?: string;
  cover?: string;
  duration?: number;
}

async function searchAmazon(query: string, country = 'auto'): Promise<SearchResult[]> {
  // Lucida search endpoint
  const searchUrl = `https://lucida.to/?service=amazon&q=${encodeURIComponent(query)}&country=${country}`;
  console.log(`[Amazon-Lucida] Search URL: ${searchUrl}`);

  const { html } = await fetchLucidaHtml(searchUrl);

  // Try SvelteKit data extraction
  const pageDataJson = parseEnclosedValue(
    ',{"type":"data","data":',
    ',"uses":',
    html
  );

  const results: SearchResult[] = [];

  if (pageDataJson) {
    try {
      let s = pageDataJson.trim();
      if (s.endsWith(',')) s = s.slice(0, -1);
      const data = JSON.parse(s);
      console.log('[Amazon-Lucida] pageData keys:', Object.keys(data));

      // Lucida search results may live under data.results / data.tracks / data.items
      const candidates = data.results || data.tracks || data.items || data.searchResults || [];
      if (Array.isArray(candidates)) {
        for (const item of candidates.slice(0, 25)) {
          const id = String(item.id ?? item.asin ?? item.trackId ?? '');
          const url = String(item.url ?? (id ? `https://music.amazon.com/tracks/${id}` : ''));
          if (!url) continue;
          results.push({
            id: id || url,
            url,
            title: String(item.title ?? item.name ?? ''),
            artist: String(
              item.artist ??
              item.artistName ??
              (Array.isArray(item.artists) ? item.artists.map((a: any) => a.name ?? a).join(', ') : '')
            ),
            album: item.album?.title ?? item.album?.name ?? item.albumName,
            cover: item.cover ?? item.image ?? item.album?.coverArtwork?.[0]?.url,
            duration: item.duration ?? item.durationMs ? Math.round((item.durationMs ?? item.duration * 1000) / 1000) : undefined,
          });
        }
      }
    } catch (e) {
      console.error('[Amazon-Lucida] pageData parse failed:', e);
    }
  }

  // HTML regex fallback: look for music.amazon.com track links
  if (results.length === 0) {
    console.log('[Amazon-Lucida] Falling back to HTML regex parse');
    const re = /href="(https?:\/\/music\.amazon\.[a-z.]+\/(?:tracks|albums)\/[A-Z0-9]+(?:\?[^"]*)?)"/gi;
    const seen = new Set<string>();
    let m;
    while ((m = re.exec(html)) !== null && results.length < 20) {
      const u = m[1];
      const idMatch = u.match(/\/tracks\/([A-Z0-9]+)/);
      if (!idMatch) continue;
      const id = idMatch[1];
      if (seen.has(id)) continue;
      seen.add(id);
      results.push({ id, url: u, title: '(unknown)', artist: '' });
    }
  }

  return results;
}

// ===== STREAM (full Lucida flow) =====
interface PageData {
  info: {
    type: 'track' | 'album';
    title: string;
    url: string;
    csrf: string;
    csrfFallback?: string;
  };
  tokenExpiry: number;
}

async function getStream(amazonUrl: string, country = 'auto'): Promise<{ streamUrl: string } | { error: string }> {
  console.log(`[Amazon-Lucida] Resolving: ${amazonUrl}`);

  const resolveUrl = new URL('https://lucida.to/');
  resolveUrl.searchParams.set('url', amazonUrl);
  resolveUrl.searchParams.set('country', country);

  try {
    const { html } = await fetchLucidaHtml(resolveUrl.toString());

    const pageDataJson = parseEnclosedValue(
      ',{"type":"data","data":',
      ',"uses":{"url":1}}];',
      html
    );
    if (!pageDataJson) {
      return { error: 'Could not extract page data from Lucida' };
    }

    let pageData: PageData;
    try {
      let s = pageDataJson.trim();
      if (s.endsWith(',')) s = s.slice(0, -1);
      pageData = JSON.parse(s);
    } catch (e) {
      console.error('[Amazon-Lucida] parse pageData failed', e);
      return { error: 'Failed to parse page data' };
    }

    const { info, tokenExpiry } = pageData;
    if (!info || info.type !== 'track') {
      return { error: 'Unsupported item type (expected track)' };
    }
    if (!info.csrf || !info.url) {
      return { error: 'Missing CSRF or track URL' };
    }

    const streamRequest = await fetch('https://lucida.to/api/load?url=%2Fapi%2Ffetch%2Fstream%2Fv2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': browserHeaders['User-Agent'],
        'Origin': 'https://lucida.to',
        'Referer': resolveUrl.toString(),
      },
      body: JSON.stringify({
        account: { id: country, type: 'country' },
        compat: false,
        downscale: 'original',
        handoff: true,
        metadata: true,
        private: true,
        token: {
          expiry: tokenExpiry || Date.now() + 3600000,
          primary: info.csrf,
          secondary: info.csrfFallback || null,
        },
        upload: { enabled: false },
        url: info.url,
      }),
    });

    if (!streamRequest.ok) {
      const t = await streamRequest.text();
      console.error('[Amazon-Lucida] stream request failed', t.substring(0, 200));
      return { error: `Stream request failed: ${streamRequest.status}` };
    }

    const streamData = await streamRequest.json();
    if (streamData.error) return { error: streamData.error };
    const { server, handoff } = streamData;
    if (!server || !handoff) return { error: 'No server/handoff in response' };

    // Poll
    for (let i = 0; i < 60; i++) {
      const sr = await fetch(`https://${server}.lucida.to/api/fetch/request/${handoff}`, {
        headers: { 'User-Agent': browserHeaders['User-Agent'] },
      });
      if (!sr.ok) {
        if (sr.status === 500) return { error: 'Server error processing track' };
        await new Promise(r => setTimeout(r, 500));
        continue;
      }
      const status = await sr.json();
      console.log(`[Amazon-Lucida] poll ${i + 1}: ${status.status}`);
      if (['completed', 'done', 'complete'].includes(status.status)) {
        return { streamUrl: `https://${server}.lucida.to/api/fetch/request/${handoff}/download` };
      }
      if (['error', 'failed'].includes(status.status)) {
        return { error: status.message || 'Download failed' };
      }
      await new Promise(r => setTimeout(r, 500));
    }
    return { error: 'Timeout waiting for stream' };
  } catch (err) {
    console.error('[Amazon-Lucida] error', err);
    return { error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, config } = body;
    const country = (config?.country as string) || (body.country as string) || 'auto';

    console.log(`[Amazon-Lucida] action=${action} country=${country}`);

    if (action === 'search') {
      const query = [body.title, body.artist].filter(Boolean).join(' ') || body.query || '';
      if (!query.trim()) {
        return new Response(JSON.stringify({ error: 'Missing query/title' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const results = await searchAmazon(query, country);
      return new Response(JSON.stringify({ results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'get-stream' || action === 'search-and-stream') {
      // Determine target Amazon URL
      let amazonUrl: string | null = null;

      if (body.trackUrl && typeof body.trackUrl === 'string' && body.trackUrl.includes('music.amazon.')) {
        amazonUrl = body.trackUrl;
      } else if (body.trackId && typeof body.trackId === 'string') {
        amazonUrl = `https://music.amazon.com/tracks/${body.trackId}`;
      } else if (action === 'search-and-stream' || body.title) {
        // Search first then pick best result
        const q = [body.title, body.artist].filter(Boolean).join(' ');
        if (!q.trim()) {
          return new Response(JSON.stringify({ error: 'Missing trackUrl/trackId/title' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        const results = await searchAmazon(q, country);
        if (results.length === 0) {
          return new Response(JSON.stringify({ error: 'No results found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        amazonUrl = results[0].url;
      }

      if (!amazonUrl) {
        return new Response(JSON.stringify({ error: 'Missing trackUrl/trackId or title' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const result = await getStream(amazonUrl, country);
      if ('error' in result) {
        return new Response(JSON.stringify({ error: result.error }), {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[Amazon-Lucida] handler error', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
