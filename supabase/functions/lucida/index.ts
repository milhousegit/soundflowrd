import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// User agent and headers to mimic a real browser
const browserHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'DNT': '1',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Cache-Control': 'max-age=0',
};

const knownLucidaErrors = [
  "An error occured trying to process your request.",
  'Message: "Cannot contact any valid server"',
  "An error occurred. Had an issue getting that item, try again.",
];

// Parse enclosed value from HTML like the Rust client does
function parseEnclosedValue(startMarker: string, endMarker: string, text: string): string | null {
  const startIndex = text.indexOf(startMarker);
  if (startIndex === -1) {
    console.log(`[Lucida] Start marker not found: ${startMarker.substring(0, 50)}`);
    return null;
  }

  const contentStart = startIndex + startMarker.length;
  const endIndex = text.indexOf(endMarker, contentStart);
  if (endIndex === -1) {
    console.log(`[Lucida] End marker not found: ${endMarker.substring(0, 50)}`);
    return null;
  }

  return text.substring(contentStart, endIndex);
}

function htmlHasKnownError(html: string): string | null {
  for (const msg of knownLucidaErrors) {
    if (html.includes(msg)) return msg;
  }
  return null;
}

async function fetchLucidaHtml(resolveUrl: string): Promise<{ html: string; source: 'direct' | 'firecrawl' }> {
  // 1) Try direct fetch first
  try {
    const pageResponse = await fetch(resolveUrl, {
      headers: browserHeaders,
      redirect: 'follow',
    });

    console.log(`[Lucida] Page response status: ${pageResponse.status}`);

    if (pageResponse.ok) {
      const html = await pageResponse.text();
      console.log(`[Lucida] HTML length (direct): ${html.length}`);

      const knownError = htmlHasKnownError(html);
      if (!knownError) {
        return { html, source: 'direct' };
      }

      console.error(`[Lucida] Direct HTML contains error: ${knownError}`);
    } else {
      console.error(`[Lucida] Direct fetch not OK: ${pageResponse.status}`);
    }
  } catch (e) {
    console.error('[Lucida] Direct fetch failed:', e);
  }

  // 2) Fallback: Firecrawl render (handles JS/SPAs)
  const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
  if (!firecrawlKey) {
    throw new Error('Lucida request failed and Firecrawl connector not configured');
  }

  console.log('[Lucida] Falling back to Firecrawl rendered HTML...');

  const scrapeRes = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${firecrawlKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: resolveUrl,
      // Prefer rendered HTML (scripts executed). rawHtml can be pre-hydration.
      formats: ['html', 'rawHtml'],
      onlyMainContent: false,
      waitFor: 8000,
    }),
  });

  const scrapeJson = await scrapeRes.json();
  if (!scrapeRes.ok) {
    console.error('[Lucida] Firecrawl error:', JSON.stringify(scrapeJson).substring(0, 500));
    throw new Error(`Firecrawl scrape failed: ${scrapeRes.status}`);
  }

  // Firecrawl nests into data
  const renderedHtml =
    scrapeJson?.data?.html ??
    scrapeJson?.html ??
    scrapeJson?.data?.rawHtml ??
    scrapeJson?.rawHtml;

  if (!renderedHtml || typeof renderedHtml !== 'string') {
    console.error('[Lucida] Firecrawl response missing html/rawHtml:', JSON.stringify(scrapeJson).substring(0, 500));
    throw new Error('Firecrawl did not return html');
  }

  console.log(`[Lucida] HTML length (firecrawl): ${renderedHtml.length}`);
  return { html: renderedHtml, source: 'firecrawl' };
}

async function extractTrackInfoViaFirecrawlJson(resolveUrl: string): Promise<{ trackInfo: TrackInfo; tokenExpiry: number } | null> {
  const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
  if (!firecrawlKey) return null;

  console.log('[Lucida] Trying Firecrawl JSON extraction fallback...');

  const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${firecrawlKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: resolveUrl,
      onlyMainContent: false,
      waitFor: 8000,
      formats: [
        {
          type: 'json',
          prompt:
            'Extract Lucida pageData needed to request a track stream. Return JSON with: url (string, the lucida track url used in POST /api/load), csrf (string), csrfFallback (string|null), tokenExpiry (number ms). If not present, return null fields.',
        },
      ],
    }),
  });

  const json = await res.json();
  if (!res.ok) {
    console.error('[Lucida] Firecrawl JSON extraction failed:', JSON.stringify(json).substring(0, 300));
    return null;
  }

  const extracted = json?.data?.json ?? json?.json;
  if (!extracted || typeof extracted !== 'object') {
    console.error('[Lucida] Firecrawl JSON extraction missing json field');
    return null;
  }

  const url = (extracted as any).url;
  const csrf = (extracted as any).csrf;
  const csrfFallback = (extracted as any).csrfFallback ?? null;
  const tokenExpiry = Number((extracted as any).tokenExpiry ?? (Date.now() + 3600000));

  if (!url || !csrf) {
    console.error('[Lucida] Firecrawl JSON extraction did not return url/csrf:', JSON.stringify(extracted).substring(0, 300));
    return null;
  }

  return {
    trackInfo: { url, csrf, csrfFallback },
    tokenExpiry,
  };
}

interface PageData {
  info: {
    type: 'track' | 'album';
    title: string;
    url: string;
    csrf: string;
    csrfFallback?: string;
    artists?: { name: string }[];
    album?: {
      title: string;
      coverArtwork?: { url: string }[];
    };
  };
  token: string;
  tokenExpiry: number;
  originalService: string;
}

interface TrackInfo {
  url: string;
  csrf: string;
  csrfFallback?: string;
}

// Resolve track via Lucida using the same approach as the Rust client
async function resolveTrackViaLucida(deezerTrackId: string, country = 'auto'): Promise<{ streamUrl: string } | { error: string }> {
  const trackUrl = `https://www.deezer.com/track/${deezerTrackId}`;

  console.log(`[Lucida] Resolving track: ${trackUrl}`);

  // Step 1: Visit lucida.to with the Deezer URL to get page data
  const resolveUrl = new URL('https://lucida.to/');
  resolveUrl.searchParams.set('url', trackUrl);
  resolveUrl.searchParams.set('country', country);

  try {
    const { html, source } = await fetchLucidaHtml(resolveUrl.toString());
    console.log(`[Lucida] Using HTML source: ${source}`);

    // Extract pageData using SvelteKit data format
    // Pattern from Rust client: ,{"type":"data","data": ... ,"uses":{"url":1}}];
    const pageDataJson = parseEnclosedValue(
      ',{"type":"data","data":',
      ',"uses":{"url":1}}];',
      html
    );

    if (!pageDataJson) {
      console.error('[Lucida] Could not find pageData in rendered HTML.');

      // Last resort: ask Firecrawl to extract the needed fields via JSON.
      const extracted = await extractTrackInfoViaFirecrawlJson(resolveUrl.toString());
      if (!extracted) {
        const dataIndex = html.indexOf('"type":"data"');
        if (dataIndex !== -1) {
          console.log('[Lucida] Data snippet:', html.substring(dataIndex, dataIndex + 500));
        } else {
          console.log('[Lucida] HTML head snippet:', html.substring(0, 800));
        }
        return { error: 'Could not extract page data from Lucida' };
      }

      console.log('[Lucida] Got trackInfo via Firecrawl JSON extraction');
      // We can skip pageData parsing and go straight to stream request.
      const trackInfo = extracted.trackInfo;
      const tokenExpiry = extracted.tokenExpiry;

      // Step 2: Request the download/stream
      console.log('[Lucida] Requesting stream...');

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
            primary: trackInfo.csrf,
            secondary: trackInfo.csrfFallback || null,
          },
          upload: { enabled: false },
          url: trackInfo.url,
        }),
      });

      console.log(`[Lucida] Stream request status: ${streamRequest.status}`);

      if (!streamRequest.ok) {
        const text = await streamRequest.text();
        console.error('[Lucida] Stream request failed:', text.substring(0, 200));
        return { error: `Stream request failed: ${streamRequest.status}` };
      }

      const streamData = await streamRequest.json();
      console.log('[Lucida] Stream data:', JSON.stringify(streamData).substring(0, 200));

      if (streamData.error) {
        return { error: streamData.error };
      }

      const { server, handoff } = streamData;

      if (!server || !handoff) {
        return { error: 'No server/handoff in response' };
      }

      // Step 3: Poll for completion
      console.log(`[Lucida] Polling server ${server} for handoff ${handoff}...`);

      const maxAttempts = 60; // 30 seconds max
      for (let i = 0; i < maxAttempts; i++) {
        const statusResponse = await fetch(`https://${server}.lucida.to/api/fetch/request/${handoff}`, {
          headers: { 'User-Agent': browserHeaders['User-Agent'] },
        });

        if (!statusResponse.ok) {
          console.error(`[Lucida] Status check failed: ${statusResponse.status}`);
          if (statusResponse.status === 500) {
            return { error: 'Server error while processing track' };
          }
          await new Promise(r => setTimeout(r, 500));
          continue;
        }

        const status = await statusResponse.json();
        console.log(`[Lucida] Status (attempt ${i + 1}): ${status.status} - ${status.message || ''}`);

        if (status.status === 'completed' || status.status === 'done' || status.status === 'complete') {
          const streamUrl = `https://${server}.lucida.to/api/fetch/request/${handoff}/download`;
          console.log('[Lucida] Stream ready:', streamUrl);
          return { streamUrl };
        }

        if (status.status === 'error' || status.status === 'failed') {
          return { error: status.message || 'Download failed' };
        }

        await new Promise(r => setTimeout(r, 500));
      }

      return { error: 'Timeout waiting for stream' };
    }

    let pageData: PageData;
    try {
      let jsonToParse = pageDataJson.trim();
      if (jsonToParse.endsWith(',')) {
        jsonToParse = jsonToParse.slice(0, -1);
      }
      pageData = JSON.parse(jsonToParse);
      console.log('[Lucida] Parsed pageData, type:', pageData.info?.type);
    } catch (e) {
      console.error('[Lucida] Failed to parse pageData JSON:', e);
      console.log('[Lucida] Raw JSON (first 500 chars):', pageDataJson.substring(0, 500));
      return { error: 'Failed to parse page data' };
    }

    const { info, tokenExpiry } = pageData;

    if (!info) {
      return { error: 'No track info in page data' };
    }

    let trackInfo: TrackInfo;

    if (info.type === 'track') {
      trackInfo = {
        url: info.url,
        // In Rust, csrf is passed as token.primary; keep that.
        csrf: info.csrf,
        csrfFallback: info.csrfFallback,
      };
    } else {
      return { error: 'Album URLs not supported, please use track URL' };
    }

    console.log(`[Lucida] Track URL: ${trackInfo.url}, CSRF length: ${trackInfo.csrf?.length || 0}`);

    if (!trackInfo.csrf || !trackInfo.url) {
      return { error: 'Missing CSRF token or track URL' };
    }

    // Step 2: Request the download/stream
    console.log('[Lucida] Requesting stream...');
    
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
          primary: trackInfo.csrf,
          secondary: trackInfo.csrfFallback || null,
        },
        upload: { enabled: false },
        url: trackInfo.url,
      }),
    });
    
    console.log(`[Lucida] Stream request status: ${streamRequest.status}`);
    
    if (!streamRequest.ok) {
      const text = await streamRequest.text();
      console.error('[Lucida] Stream request failed:', text.substring(0, 200));
      return { error: `Stream request failed: ${streamRequest.status}` };
    }
    
    const streamData = await streamRequest.json();
    console.log('[Lucida] Stream data:', JSON.stringify(streamData).substring(0, 200));
    
    if (streamData.error) {
      return { error: streamData.error };
    }
    
    const { server, handoff } = streamData;
    
    if (!server || !handoff) {
      return { error: 'No server/handoff in response' };
    }
    
    // Step 3: Poll for completion
    console.log(`[Lucida] Polling server ${server} for handoff ${handoff}...`);
    
    const maxAttempts = 60; // 30 seconds max
    for (let i = 0; i < maxAttempts; i++) {
      const statusResponse = await fetch(`https://${server}.lucida.to/api/fetch/request/${handoff}`, {
        headers: { 'User-Agent': browserHeaders['User-Agent'] },
      });
      
      if (!statusResponse.ok) {
        console.error(`[Lucida] Status check failed: ${statusResponse.status}`);
        if (statusResponse.status === 500) {
          return { error: 'Server error while processing track' };
        }
        await new Promise(r => setTimeout(r, 500));
        continue;
      }
      
      const status = await statusResponse.json();
      console.log(`[Lucida] Status (attempt ${i + 1}): ${status.status} - ${status.message || ''}`);
      
      if (status.status === 'completed' || status.status === 'done' || status.status === 'complete') {
        const streamUrl = `https://${server}.lucida.to/api/fetch/request/${handoff}/download`;
        console.log('[Lucida] Stream ready:', streamUrl);
        return { streamUrl };
      }
      
      if (status.status === 'error' || status.status === 'failed') {
        return { error: status.message || 'Download failed' };
      }
      
      await new Promise(r => setTimeout(r, 500));
    }
    
    return { error: 'Timeout waiting for stream' };
    
  } catch (error) {
    console.error('[Lucida] Error:', error);
    return { error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, trackId, country } = await req.json();
    
    console.log(`[Lucida] Request: action=${action}, trackId=${trackId}`);
    
    if (action === 'get-stream') {
      const result = await resolveTrackViaLucida(trackId, country || 'auto');
      
      if ('error' in result) {
        return new Response(JSON.stringify({ error: result.error }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 503,
        });
      }
      
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
    
  } catch (error) {
    console.error('[Lucida] Function error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
