import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PipedInstance {
  name: string;
  api_url: string;
  uptime_24h: number;
}

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

// Cache for working instances
let cachedInstances: string[] = [];
let instancesCachedAt = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Known reliable instances as fallback
const FALLBACK_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://api.piped.private.coffee",
  "https://pipedapi.r4fo.com",
  "https://piped-api.garuber.dev",
  "https://api.piped.yt",
];

async function getWorkingInstances(): Promise<string[]> {
  // Return cached if still valid
  if (cachedInstances.length > 0 && Date.now() - instancesCachedAt < CACHE_DURATION) {
    console.log('Using cached instances:', cachedInstances);
    return cachedInstances;
  }

  try {
    console.log('Fetching fresh Piped instances...');
    const response = await fetch('https://piped-instances.kavin.rocks/', {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    
    if (response.ok) {
      const instances: PipedInstance[] = await response.json();
      console.log(`Got ${instances.length} instances from API`);
      
      // Sort by uptime and take top 8 with >85% uptime
      const working = instances
        .filter(i => i.uptime_24h > 85 && i.api_url)
        .sort((a, b) => b.uptime_24h - a.uptime_24h)
        .slice(0, 8)
        .map(i => i.api_url);
      
      if (working.length >= 3) {
        cachedInstances = working;
        instancesCachedAt = Date.now();
        console.log(`Cached ${working.length} instances`);
        return working;
      }
    }
  } catch (e) {
    console.error('Failed to fetch instances:', e instanceof Error ? e.message : e);
  }

  // Use fallback instances
  console.log('Using fallback instances');
  return FALLBACK_INSTANCES;
}

async function tryFetch(url: string, timeout = 12000): Promise<Response | null> {
  try {
    console.log(`Fetching: ${url}`);
    const response = await fetch(url, { 
      signal: AbortSignal.timeout(timeout),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      }
    });
    console.log(`Response status: ${response.status}`);
    return response;
  } catch (e) {
    console.error(`Fetch error: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

async function searchVideos(query: string): Promise<VideoResult[]> {
  const instances = await getWorkingInstances();
  const encodedQuery = encodeURIComponent(query);
  
  // Try each instance
  for (const instance of instances) {
    // Try different search modes
    const searchUrls = [
      `${instance}/search?q=${encodedQuery}&filter=videos`,
      `${instance}/search?q=${encodedQuery}`,
    ];
    
    for (const url of searchUrls) {
      try {
        const response = await tryFetch(url);
        
        if (!response || !response.ok) continue;
        
        const text = await response.text();
        console.log(`Response preview: ${text.substring(0, 100)}`);
        
        // Check if it's valid JSON
        if (!text.startsWith('{') && !text.startsWith('[')) {
          console.log('Invalid JSON response');
          continue;
        }
        
        const data = JSON.parse(text);
        
        if (data.items && Array.isArray(data.items) && data.items.length > 0) {
          console.log(`Found ${data.items.length} items`);
          
          const results = data.items
            .filter((item: any) => {
              const isStream = item.type === 'stream';
              const hasDuration = item.duration > 0;
              const notTooLong = item.duration < 900; // max 15 min
              return isStream && hasDuration && notTooLong;
            })
            .slice(0, 5)
            .map((item: any) => ({
              id: item.url?.replace('/watch?v=', '') || '',
              title: item.title || 'Unknown',
              duration: item.duration || 0,
              uploaderName: item.uploaderName || 'Unknown',
              thumbnail: item.thumbnail || '',
            }));
          
          if (results.length > 0) {
            console.log(`Returning ${results.length} valid results`);
            return results;
          }
        }
      } catch (error) {
        console.error(`Search error: ${error instanceof Error ? error.message : error}`);
        continue;
      }
    }
  }
  
  console.log('No results found from any instance');
  return [];
}

async function getAudioStream(videoId: string): Promise<AudioStream | null> {
  const instances = await getWorkingInstances();
  
  // Clean videoId - remove any prefix like /watch?v=
  const cleanVideoId = videoId.replace('/watch?v=', '').replace('watch?v=', '').split('&')[0];
  console.log(`Clean video ID: ${cleanVideoId}`);
  
  for (const instance of instances) {
    try {
      const url = `${instance}/streams/${cleanVideoId}`;
      console.log(`Trying stream URL: ${url}`);
      const response = await tryFetch(url);
      
      if (!response) {
        console.log('No response from instance');
        continue;
      }
      
      if (!response.ok) {
        console.log(`Response not ok: ${response.status}`);
        continue;
      }
      
      const text = await response.text();
      console.log(`Stream response preview: ${text.substring(0, 200)}`);
      
      if (!text.startsWith('{')) {
        console.log('Invalid JSON response for stream');
        continue;
      }
      
      const data = JSON.parse(text);
      
      // Check for audioStreams
      if (data.audioStreams && Array.isArray(data.audioStreams) && data.audioStreams.length > 0) {
        console.log(`Found ${data.audioStreams.length} audio streams`);
        
        const audioStreams = data.audioStreams
          .filter((s: any) => s.url && (s.bitrate || s.quality))
          .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
        
        if (audioStreams.length > 0) {
          const best = audioStreams[0];
          console.log(`Best audio: bitrate=${best.bitrate}, quality=${best.quality}, mimeType=${best.mimeType}`);
          return {
            url: best.url,
            quality: best.quality || `${Math.round((best.bitrate || 128000) / 1000)}kbps`,
            mimeType: best.mimeType || 'audio/webm',
            bitrate: best.bitrate || 128000,
          };
        }
      } else {
        console.log('No audioStreams in response. Keys:', Object.keys(data).join(', '));
      }
    } catch (error) {
      console.error(`Stream error: ${error instanceof Error ? error.message : error}`);
      continue;
    }
  }
  
  console.log('No audio stream found from any instance');
  return null;
}

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
      console.log('Final results:', results.length);
      console.log('====================================');

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

      console.log('========== Get Audio ==========');
      console.log('Video ID:', videoId);
      const audio = await getAudioStream(videoId);
      console.log('Audio found:', !!audio);
      console.log('===============================');

      if (!audio) {
        return new Response(
          JSON.stringify({ error: 'No audio stream found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ audio }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
