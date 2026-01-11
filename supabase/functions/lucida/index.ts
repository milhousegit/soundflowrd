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
  'Accept-Encoding': 'gzip, deflate, br',
  'DNT': '1',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Cache-Control': 'max-age=0',
};

// Alternative approach: Use lucida.to directly by resolving the track
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
    
    // Try multiple patterns to find the data
    let pageData: any = null;
    
    // Pattern 1: Script tag with id="pageData"
    const pattern1 = /<script id="pageData" type="application\/json">([\s\S]*?)<\/script>/;
    const match1 = html.match(pattern1);
    if (match1) {
      console.log('[Lucida] Found pageData via pattern 1');
      try {
        pageData = JSON.parse(match1[1]);
      } catch (e) {
        console.error('[Lucida] Failed to parse pattern 1:', e);
      }
    }
    
    // Pattern 2: __NUXT__ or similar hydration data
    if (!pageData) {
      const pattern2 = /window\.__NUXT__\s*=\s*({[\s\S]*?});?\s*<\/script>/;
      const match2 = html.match(pattern2);
      if (match2) {
        console.log('[Lucida] Found pageData via pattern 2 (__NUXT__)');
        try {
          pageData = JSON.parse(match2[1]);
        } catch (e) {
          console.error('[Lucida] Failed to parse pattern 2:', e);
        }
      }
    }
    
    // Pattern 3: Next.js __NEXT_DATA__
    if (!pageData) {
      const pattern3 = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/;
      const match3 = html.match(pattern3);
      if (match3) {
        console.log('[Lucida] Found pageData via pattern 3 (__NEXT_DATA__)');
        try {
          pageData = JSON.parse(match3[1]);
        } catch (e) {
          console.error('[Lucida] Failed to parse pattern 3:', e);
        }
      }
    }
    
    // Pattern 4: Any JSON-like data in a script tag
    if (!pageData) {
      const pattern4 = /<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/g;
      let match4;
      while ((match4 = pattern4.exec(html)) !== null) {
        try {
          const parsed = JSON.parse(match4[1]);
          if (parsed && (parsed.info || parsed.token || parsed.pageData)) {
            console.log('[Lucida] Found pageData via pattern 4 (generic JSON)');
            pageData = parsed;
            break;
          }
        } catch (e) {
          // Continue trying
        }
      }
    }
    
    if (!pageData) {
      // Log a snippet of HTML for debugging
      console.error('[Lucida] Could not find pageData. HTML snippet:', html.substring(0, 500));
      return { error: 'Could not extract page data from Lucida' };
    }
    
    console.log('[Lucida] PageData keys:', Object.keys(pageData));
    
    // Extract track info and tokens
    const info = pageData.info || pageData.pageData?.info;
    const token = pageData.token || pageData.pageData?.token;
    const tokenExpiry = pageData.tokenExpiry || pageData.pageData?.tokenExpiry;
    
    if (!info) {
      console.error('[Lucida] No info in pageData:', JSON.stringify(pageData).substring(0, 500));
      return { error: 'No track info found in page data' };
    }
    
    console.log('[Lucida] Track info type:', info.type, 'title:', info.title);
    
    const csrf = info.csrf;
    const csrfFallback = info.csrfFallback;
    const trackDownloadUrl = info.url;
    
    if (!csrf || !trackDownloadUrl) {
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
          primary: csrf,
          secondary: csrfFallback || null,
        },
        upload: { enabled: false },
        url: trackDownloadUrl,
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
        await new Promise(r => setTimeout(r, 500));
        continue;
      }
      
      const status = await statusResponse.json();
      console.log(`[Lucida] Status (attempt ${i + 1}):`, status.status);
      
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
    const { action, trackId, deezerUrl, country } = await req.json();
    
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
