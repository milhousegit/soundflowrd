import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LucidaPageData {
  info: {
    type: 'track' | 'album';
    title: string;
    url: string;
    artists: { name: string }[];
    album?: {
      title: string;
      coverArtwork: { url: string }[];
    };
    coverArtwork?: { url: string }[];
    csrf: string;
    csrfFallback?: string;
    tracks?: {
      title: string;
      url: string;
      artists: { name: string }[];
      csrf: string;
      csrfFallback?: string;
    }[];
  };
  token: string;
  tokenExpiry: number;
  originalService: string;
}

interface TrackDownloadResponse {
  handoff: string;
  server: string;
}

interface TrackStatusResponse {
  status: string;
  message: string;
}

// Resolve a Deezer track URL to get token and track info
async function resolveTrack(deezerUrl: string, country = 'auto'): Promise<LucidaPageData | null> {
  const url = new URL('https://lucida.to/');
  url.searchParams.set('url', deezerUrl);
  url.searchParams.set('country', country);
  
  const response = await fetch(url.toString(), {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    },
  });
  
  if (!response.ok) {
    console.error(`Failed to resolve track: ${response.status}`);
    return null;
  }
  
  const html = await response.text();
  
  // Extract JSON data from the HTML page - look for the pageData variable
  const pageDataMatch = html.match(/<script id="pageData" type="application\/json">([\s\S]*?)<\/script>/);
  if (!pageDataMatch) {
    // Try alternative pattern - look for window.__DATA__ or similar
    const altMatch = html.match(/window\.__DATA__\s*=\s*({[\s\S]*?});?\s*<\/script>/);
    if (altMatch) {
      try {
        return JSON.parse(altMatch[1]);
      } catch (e) {
        console.error('Failed to parse alternative pageData:', e);
      }
    }
    console.error('Could not find pageData in HTML');
    return null;
  }
  
  try {
    return JSON.parse(pageDataMatch[1]);
  } catch (e) {
    console.error('Failed to parse pageData:', e);
    return null;
  }
}

// Request track download from Lucida
async function requestDownload(
  trackUrl: string,
  csrf: string,
  csrfFallback: string | undefined,
  tokenExpiry: number,
  country = 'auto'
): Promise<TrackDownloadResponse | { error: string }> {
  const response = await fetch('https://lucida.to/api/load?url=%2Fapi%2Ffetch%2Fstream%2Fv2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    body: JSON.stringify({
      account: {
        id: country,
        type: 'country',
      },
      compat: false,
      downscale: 'original',
      handoff: true,
      metadata: true,
      private: true,
      token: {
        expiry: tokenExpiry,
        primary: csrf,
        secondary: csrfFallback || null,
      },
      upload: { enabled: false },
      url: trackUrl,
    }),
  });
  
  if (!response.ok) {
    return { error: `Request failed: ${response.status}` };
  }
  
  const data = await response.json();
  
  if (data.error) {
    return { error: data.error };
  }
  
  return data;
}

// Check download status
async function checkStatus(server: string, handoff: string): Promise<TrackStatusResponse> {
  const response = await fetch(`https://${server}.lucida.to/api/fetch/request/${handoff}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });
  
  if (!response.ok) {
    return { status: 'error', message: `Status check failed: ${response.status}` };
  }
  
  return await response.json();
}

// Wait for download to be ready and return stream URL
async function waitForStream(
  server: string, 
  handoff: string, 
  maxWaitMs = 30000
): Promise<{ streamUrl: string } | { error: string }> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitMs) {
    const status = await checkStatus(server, handoff);
    
    if (status.status === 'completed' || status.status === 'done') {
      // Stream is ready - construct download URL
      const streamUrl = `https://${server}.lucida.to/api/fetch/request/${handoff}/download`;
      return { streamUrl };
    }
    
    if (status.status === 'error' || status.status === 'failed') {
      return { error: status.message || 'Download failed' };
    }
    
    // Wait before checking again
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  return { error: 'Timeout waiting for stream' };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, trackId, deezerUrl, country } = await req.json();
    
    console.log(`Lucida request: action=${action}, trackId=${trackId}, url=${deezerUrl}`);
    
    if (action === 'get-stream') {
      // Build Deezer track URL if not provided
      const url = deezerUrl || `https://www.deezer.com/track/${trackId}`;
      
      // Step 1: Resolve track to get token and CSRF
      const pageData = await resolveTrack(url, country || 'auto');
      
      if (!pageData) {
        return new Response(JSON.stringify({ 
          error: 'Failed to resolve track - Lucida may be unavailable' 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 503,
        });
      }
      
      // Get track info from pageData
      let trackUrl: string;
      let csrf: string;
      let csrfFallback: string | undefined;
      
      if (pageData.info.type === 'track') {
        trackUrl = pageData.info.url;
        csrf = pageData.info.csrf;
        csrfFallback = pageData.info.csrfFallback;
      } else if (pageData.info.type === 'album' && pageData.info.tracks) {
        // If album, find the matching track (for now just use first)
        const track = pageData.info.tracks[0];
        if (!track) {
          return new Response(JSON.stringify({ error: 'No tracks found in album' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 404,
          });
        }
        trackUrl = track.url;
        csrf = track.csrf;
        csrfFallback = track.csrfFallback;
      } else {
        return new Response(JSON.stringify({ error: 'Invalid page data' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }
      
      // Step 2: Request download
      const downloadResult = await requestDownload(
        trackUrl,
        csrf,
        csrfFallback,
        pageData.tokenExpiry,
        country || 'auto'
      );
      
      if ('error' in downloadResult) {
        return new Response(JSON.stringify({ error: downloadResult.error }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        });
      }
      
      // Step 3: Wait for stream to be ready
      const streamResult = await waitForStream(downloadResult.server, downloadResult.handoff);
      
      if ('error' in streamResult) {
        return new Response(JSON.stringify({ error: streamResult.error }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        });
      }
      
      return new Response(JSON.stringify({
        streamUrl: streamResult.streamUrl,
        server: downloadResult.server,
        handoff: downloadResult.handoff,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    if (action === 'check-status') {
      const { server, handoff } = await req.json();
      
      if (!server || !handoff) {
        return new Response(JSON.stringify({ error: 'Missing server or handoff' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }
      
      const status = await checkStatus(server, handoff);
      
      return new Response(JSON.stringify(status), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
    
  } catch (error) {
    console.error('Lucida function error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
