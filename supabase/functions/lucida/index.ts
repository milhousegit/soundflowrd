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
    const pageResponse = await fetch(resolveUrl.toString(), {
      headers: browserHeaders,
      redirect: 'follow',
    });
    
    console.log(`[Lucida] Page response status: ${pageResponse.status}`);
    
    if (!pageResponse.ok) {
      return { error: `Lucida page returned ${pageResponse.status}` };
    }
    
    const html = await pageResponse.text();
    console.log(`[Lucida] HTML length: ${html.length}`);
    
    // Check for known error messages
    const knownErrors = [
      "An error occured trying to process your request.",
      'Message: "Cannot contact any valid server"',
      "An error occurred. Had an issue getting that item, try again.",
    ];
    
    for (const errorMsg of knownErrors) {
      if (html.includes(errorMsg)) {
        console.error(`[Lucida] HTML contains error: ${errorMsg}`);
        return { error: errorMsg };
      }
    }
    
    // Extract pageData using SvelteKit data format
    // Pattern from Rust client: ,{"type":"data","data": ... ,"uses":{"url":1}}];
    const pageDataJson = parseEnclosedValue(
      ',{"type":"data","data":',
      ',"uses":{"url":1}}];',
      html
    );
    
    if (!pageDataJson) {
      // Try alternative patterns for newer SvelteKit versions
      const patterns = [
        { start: '{"type":"data","data":', end: ',"uses":{' },
        { start: 'pageData = ', end: ';\n' },
        { start: '__sveltekit_', end: ']]' },
      ];
      
      let foundData = null;
      for (const pattern of patterns) {
        const match = parseEnclosedValue(pattern.start, pattern.end, html);
        if (match) {
          console.log(`[Lucida] Found data with pattern: ${pattern.start.substring(0, 30)}...`);
          foundData = match;
          break;
        }
      }
      
      if (!foundData) {
        // Log HTML snippet for debugging
        console.error('[Lucida] Could not find pageData. Searching for data patterns...');
        
        // Try to find any JSON with track info
        const trackDataMatch = html.match(/"type"\s*:\s*"track"[^}]+}/);
        if (trackDataMatch) {
          console.log('[Lucida] Found track type indicator');
        }
        
        // Log a relevant snippet
        const dataIndex = html.indexOf('"type":"data"');
        if (dataIndex !== -1) {
          console.log('[Lucida] Data snippet:', html.substring(dataIndex, dataIndex + 500));
        } else {
          console.error('[Lucida] No "type":"data" found in HTML');
          console.log('[Lucida] HTML snippet:', html.substring(0, 1000));
        }
        
        return { error: 'Could not extract page data from Lucida' };
      }
    }
    
    let pageData: PageData;
    try {
      // The extracted JSON might need some cleanup
      let jsonToParse = pageDataJson || '';
      
      // Remove trailing characters that aren't part of JSON
      jsonToParse = jsonToParse.trim();
      if (jsonToParse.endsWith(',')) {
        jsonToParse = jsonToParse.slice(0, -1);
      }
      
      pageData = JSON.parse(jsonToParse);
      console.log('[Lucida] Parsed pageData, type:', pageData.info?.type);
    } catch (e) {
      console.error('[Lucida] Failed to parse pageData JSON:', e);
      console.log('[Lucida] Raw JSON (first 500 chars):', pageDataJson?.substring(0, 500));
      return { error: 'Failed to parse page data' };
    }
    
    const { info, token, tokenExpiry } = pageData;
    
    if (!info) {
      return { error: 'No track info in page data' };
    }
    
    // For single tracks, the info contains the track directly
    // For albums, we'd need to get the track from tracks array
    let trackInfo: TrackInfo;
    
    if (info.type === 'track') {
      trackInfo = {
        url: info.url,
        csrf: info.csrf || token,
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
