import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface VideoResult {
  id: string;
  title: string;
  duration: number;
  uploaderName: string;
  thumbnail: string;
}

interface AudioStream {
  url: string;
  quality: string;
  mimeType: string;
  bitrate: number;
}

// Cobalt API instances (primary source - most reliable for 2025)
const COBALT_INSTANCES = [
  "https://api.cobalt.tools",
  "https://cobalt-api.kwiatekmiki.com",
  "https://cobalt.canine.tools",
  "https://co.eepy.today",
  "https://cobalt-api.hyper.lol",
  "https://api.aqua.rip",
];

// Piped instances pool (fallback)
const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://api.piped.yt",
  "https://pipedapi.darkness.services",
  "https://pipedapi.drgns.space",
  "https://piped-api.hostux.net",
  "https://api.piped.projectsegfau.lt",
  "https://pipedapi.in.projectsegfau.lt",
  "https://pipedapi.leptons.xyz",
  "https://pipedapi.reallyaweso.me",
];

// Invidious instances pool (last fallback)
const INVIDIOUS_INSTANCES = [
  "https://invidious.nerdvpn.de",
  "https://iv.nboeck.de",
  "https://invidious.protokolla.fi",
  "https://inv.tux.pizza",
  "https://invidious.privacyredirect.com",
  "https://invidious.drgns.space",
  "https://invidious.einfachzocken.eu",
  "https://yt.artemislena.eu",
  "https://invidious.lunar.icu",
  "https://iv.melmac.space",
];

async function tryFetch(url: string, options: RequestInit = {}, timeout = 10000): Promise<Response | null> {
  try {
    const response = await fetch(url, { 
      signal: AbortSignal.timeout(timeout),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        ...options.headers,
      },
      ...options,
    });
    return response;
  } catch (e) {
    return null;
  }
}

// Shuffle array to distribute load
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// ============ COBALT API (Primary) ============
async function getAudioStreamCobalt(videoId: string): Promise<AudioStream | null> {
  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const cobaltInstances = shuffleArray(COBALT_INSTANCES);
  
  for (const instance of cobaltInstances) {
    try {
      console.log(`Trying Cobalt: ${instance}`);
      
      const response = await tryFetch(instance, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: youtubeUrl,
          downloadMode: 'audio',
          audioFormat: 'mp3',
          audioBitrate: '320',
        }),
      }, 15000);
      
      if (!response) {
        console.log(`Cobalt ${instance} failed: no response`);
        continue;
      }
      
      // Check if response is ok
      if (!response.ok) {
        console.log(`Cobalt ${instance} failed: ${response.status}`);
        continue;
      }
      
      const data = await response.json();
      console.log(`Cobalt ${instance} response:`, JSON.stringify(data).substring(0, 200));
      
      // Cobalt API v7+ response format
      if (data.status === 'tunnel' || data.status === 'redirect' || data.status === 'stream') {
        const audioUrl = data.url || data.audio;
        if (audioUrl) {
          console.log(`Cobalt success from ${instance}: got audio URL`);
          return {
            url: audioUrl,
            quality: '320kbps',
            mimeType: 'audio/mpeg',
            bitrate: 320000,
          };
        }
      }
      
      // Handle picker response (when multiple options available)
      if (data.status === 'picker' && data.picker && data.picker.length > 0) {
        const audioOption = data.picker.find((p: any) => p.type === 'audio');
        if (audioOption?.url) {
          console.log(`Cobalt picker success from ${instance}`);
          return {
            url: audioOption.url,
            quality: '320kbps',
            mimeType: 'audio/mpeg',
            bitrate: 320000,
          };
        }
      }
      
      // Error responses
      if (data.status === 'error') {
        console.log(`Cobalt ${instance} error: ${data.error?.code || data.text || 'unknown'}`);
        continue;
      }
      
    } catch (error) {
      console.error(`Cobalt ${instance} error:`, error instanceof Error ? error.message : error);
    }
  }
  
  return null;
}

// ============ PIPED API (Secondary) ============
async function getAudioStreamPiped(videoId: string): Promise<AudioStream | null> {
  const pipedInstances = shuffleArray(PIPED_INSTANCES);
  
  for (const instance of pipedInstances) {
    try {
      const url = `${instance}/streams/${videoId}`;
      console.log(`Trying Piped: ${url}`);
      const response = await tryFetch(url, {}, 12000);
      
      if (!response || !response.ok) {
        console.log(`Piped ${instance} failed: ${response?.status}`);
        continue;
      }
      
      const data = await response.json();
      
      if (data.audioStreams && Array.isArray(data.audioStreams) && data.audioStreams.length > 0) {
        const sortedStreams = data.audioStreams
          .filter((s: any) => s.url && s.mimeType?.includes('audio'))
          .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
        
        if (sortedStreams.length > 0) {
          const best = sortedStreams[0];
          console.log(`Piped success: ${best.quality || best.bitrate}kbps from ${instance}`);
          return {
            url: best.url,
            quality: best.quality || `${Math.round((best.bitrate || 0) / 1000)}kbps`,
            mimeType: best.mimeType || 'audio/mp4',
            bitrate: best.bitrate || 0,
          };
        }
      }
    } catch (error) {
      console.error(`Piped error: ${error instanceof Error ? error.message : error}`);
    }
  }
  
  return null;
}

// ============ INVIDIOUS API (Tertiary) ============
async function getAudioStreamInvidious(videoId: string): Promise<AudioStream | null> {
  const invidiousInstances = shuffleArray(INVIDIOUS_INSTANCES);
  
  for (const instance of invidiousInstances) {
    try {
      const url = `${instance}/api/v1/videos/${videoId}`;
      console.log(`Trying Invidious: ${url}`);
      const response = await tryFetch(url, {}, 12000);
      
      if (!response || !response.ok) {
        console.log(`Invidious ${instance} failed: ${response?.status}`);
        continue;
      }
      
      const data = await response.json();
      
      if (data.adaptiveFormats && Array.isArray(data.adaptiveFormats)) {
        const audioFormats = data.adaptiveFormats
          .filter((f: any) => f.type?.includes('audio') && f.url)
          .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
        
        if (audioFormats.length > 0) {
          const best = audioFormats[0];
          console.log(`Invidious success: ${best.bitrate}bps from ${instance}`);
          return {
            url: best.url,
            quality: `${Math.round((best.bitrate || 0) / 1000)}kbps`,
            mimeType: best.type?.split(';')[0] || 'audio/mp4',
            bitrate: best.bitrate || 0,
          };
        }
      }
    } catch (error) {
      console.error(`Invidious error: ${error instanceof Error ? error.message : error}`);
    }
  }
  
  return null;
}

// ============ MAIN AUDIO EXTRACTION ============
async function getAudioStream(videoId: string): Promise<AudioStream | null> {
  const cleanVideoId = videoId.replace('/watch?v=', '').replace('watch?v=', '').split('&')[0];
  
  console.log('========== Extracting audio for:', cleanVideoId, '==========');
  
  // 1. Try Cobalt first (most reliable)
  console.log('--- Trying Cobalt API ---');
  let audioStream = await getAudioStreamCobalt(cleanVideoId);
  if (audioStream) {
    console.log('SUCCESS: Got audio from Cobalt');
    return audioStream;
  }
  
  // 2. Fallback to Piped
  console.log('--- Trying Piped API ---');
  audioStream = await getAudioStreamPiped(cleanVideoId);
  if (audioStream) {
    console.log('SUCCESS: Got audio from Piped');
    return audioStream;
  }
  
  // 3. Last resort: Invidious
  console.log('--- Trying Invidious API ---');
  audioStream = await getAudioStreamInvidious(cleanVideoId);
  if (audioStream) {
    console.log('SUCCESS: Got audio from Invidious');
    return audioStream;
  }
  
  console.log('FAILED: No audio stream found from any source');
  return null;
}

// ============ VIDEO SEARCH ============
async function searchVideos(query: string): Promise<VideoResult[]> {
  const encodedQuery = encodeURIComponent(query);
  
  const pipedInstances = shuffleArray(PIPED_INSTANCES);
  const invidiousInstances = shuffleArray(INVIDIOUS_INSTANCES);
  
  // Try Piped first for search
  for (const instance of pipedInstances) {
    try {
      const url = `${instance}/search?q=${encodedQuery}&filter=videos`;
      console.log(`Searching: ${url}`);
      const response = await tryFetch(url);
      
      if (!response || !response.ok) {
        console.log(`${instance} failed: ${response?.status}`);
        continue;
      }
      
      const text = await response.text();
      if (!text.startsWith('{') && !text.startsWith('[')) continue;
      
      const data = JSON.parse(text);
      
      if (data.items && Array.isArray(data.items) && data.items.length > 0) {
        const results = data.items
          .filter((item: any) => item.type === 'stream' && item.duration > 0 && item.duration < 900)
          .slice(0, 5)
          .map((item: any) => ({
            id: item.url?.replace('/watch?v=', '') || '',
            title: item.title || 'Unknown',
            duration: item.duration || 0,
            uploaderName: item.uploaderName || 'Unknown',
            thumbnail: item.thumbnail || '',
          }));
        
        if (results.length > 0) {
          console.log(`Found ${results.length} results from Piped`);
          return results;
        }
      }
    } catch (error) {
      console.error(`Piped search error: ${error instanceof Error ? error.message : error}`);
    }
  }
  
  // Fallback to Invidious search
  for (const instance of invidiousInstances) {
    try {
      const url = `${instance}/api/v1/search?q=${encodedQuery}&type=video`;
      console.log(`Invidious search: ${url}`);
      const response = await tryFetch(url);
      
      if (!response || !response.ok) continue;
      
      const data = await response.json();
      
      if (Array.isArray(data) && data.length > 0) {
        const results = data
          .filter((item: any) => item.type === 'video' && item.lengthSeconds > 0 && item.lengthSeconds < 900)
          .slice(0, 5)
          .map((item: any) => ({
            id: item.videoId || '',
            title: item.title || 'Unknown',
            duration: item.lengthSeconds || 0,
            uploaderName: item.author || 'Unknown',
            thumbnail: item.videoThumbnails?.[0]?.url || '',
          }));
        
        if (results.length > 0) {
          console.log(`Found ${results.length} results from Invidious`);
          return results;
        }
      }
    } catch (error) {
      console.error(`Invidious search error: ${error instanceof Error ? error.message : error}`);
    }
  }
  
  return [];
}

// ============ SERVER ============
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, query, videoId } = await req.json();

    if (action === 'search') {
      if (!query) {
        return new Response(
          JSON.stringify({ error: 'Query is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('========== YouTube Search ==========');
      console.log('Query:', query);
      const results = await searchVideos(query);
      console.log('Results:', results.length);

      return new Response(
        JSON.stringify({ videos: results }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'getAudio') {
      if (!videoId) {
        return new Response(
          JSON.stringify({ error: 'Video ID is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('========== Get Audio Stream ==========');
      console.log('Video ID:', videoId);
      
      const audioStream = await getAudioStream(videoId);
      
      if (audioStream) {
        return new Response(
          JSON.stringify({ audio: audioStream }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else {
        // Return useIframe flag so client can fallback to iframe player
        console.log('Falling back to iframe mode for:', videoId);
        return new Response(
          JSON.stringify({ 
            error: 'No audio stream found', 
            audio: null,
            useIframe: true,
            videoId: videoId.replace('/watch?v=', '').replace('watch?v=', '').split('&')[0]
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('YouTube audio error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
