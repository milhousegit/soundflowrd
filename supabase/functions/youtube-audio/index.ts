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

// Invidious instances - more reliable for audio extraction
const INVIDIOUS_INSTANCES = [
  "https://invidious.io.lol",
  "https://vid.puffyan.us",
  "https://invidious.privacyredirect.com",
  "https://yewtu.be",
  "https://invidious.lunar.icu",
  "https://inv.tux.pizza",
  "https://invidious.protokolla.fi",
];

// Piped instances for search (better search results)
const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://api.piped.private.coffee",
  "https://pipedapi.r4fo.com",
];

async function tryFetch(url: string, timeout = 10000): Promise<Response | null> {
  try {
    const response = await fetch(url, { 
      signal: AbortSignal.timeout(timeout),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      }
    });
    return response;
  } catch (e) {
    console.error(`Fetch error for ${url}: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

async function searchVideos(query: string): Promise<VideoResult[]> {
  const encodedQuery = encodeURIComponent(query);
  
  // Try Piped first for search
  for (const instance of PIPED_INSTANCES) {
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
  for (const instance of INVIDIOUS_INSTANCES) {
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

async function getAudioStream(videoId: string): Promise<AudioStream | null> {
  const cleanVideoId = videoId.replace('/watch?v=', '').replace('watch?v=', '').split('&')[0];
  console.log(`Getting audio for video: ${cleanVideoId}`);
  
  // Try Invidious first - more reliable for audio extraction
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const url = `${instance}/api/v1/videos/${cleanVideoId}`;
      console.log(`Trying Invidious: ${url}`);
      const response = await tryFetch(url, 15000);
      
      if (!response) {
        console.log(`No response from ${instance}`);
        continue;
      }
      
      if (!response.ok) {
        console.log(`${instance} returned ${response.status}`);
        continue;
      }
      
      const data = await response.json();
      
      // Invidious provides adaptiveFormats with audio-only streams
      if (data.adaptiveFormats && Array.isArray(data.adaptiveFormats)) {
        const audioFormats = data.adaptiveFormats
          .filter((f: any) => f.type?.startsWith('audio/') && f.url)
          .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
        
        if (audioFormats.length > 0) {
          const best = audioFormats[0];
          console.log(`Found audio from Invidious: ${best.type}, bitrate: ${best.bitrate}`);
          return {
            url: best.url,
            quality: best.audioQuality || `${Math.round((best.bitrate || 128000) / 1000)}kbps`,
            mimeType: best.type || 'audio/webm',
            bitrate: best.bitrate || 128000,
          };
        }
      }
      
      // Some Invidious instances use formatStreams
      if (data.formatStreams && Array.isArray(data.formatStreams)) {
        // Get the lowest quality video (which still has audio) as fallback
        const withAudio = data.formatStreams.filter((f: any) => f.url);
        if (withAudio.length > 0) {
          const format = withAudio[0];
          console.log(`Using formatStream as fallback: ${format.type}`);
          return {
            url: format.url,
            quality: format.qualityLabel || 'audio',
            mimeType: format.type || 'video/mp4',
            bitrate: 128000,
          };
        }
      }
    } catch (error) {
      console.error(`Invidious error for ${instance}: ${error instanceof Error ? error.message : error}`);
    }
  }
  
  // Fallback to Piped
  for (const instance of PIPED_INSTANCES) {
    try {
      const url = `${instance}/streams/${cleanVideoId}`;
      console.log(`Trying Piped: ${url}`);
      const response = await tryFetch(url);
      
      if (!response || !response.ok) continue;
      
      const text = await response.text();
      if (!text.startsWith('{')) continue;
      
      const data = JSON.parse(text);
      
      if (data.audioStreams && Array.isArray(data.audioStreams) && data.audioStreams.length > 0) {
        const audioStreams = data.audioStreams
          .filter((s: any) => s.url)
          .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
        
        if (audioStreams.length > 0) {
          const best = audioStreams[0];
          console.log(`Found audio from Piped: ${best.quality}`);
          return {
            url: best.url,
            quality: best.quality || `${Math.round((best.bitrate || 128000) / 1000)}kbps`,
            mimeType: best.mimeType || 'audio/webm',
            bitrate: best.bitrate || 128000,
          };
        }
      }
    } catch (error) {
      console.error(`Piped stream error: ${error instanceof Error ? error.message : error}`);
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

      console.log('========== Get Audio ==========');
      console.log('Video ID:', videoId);
      const audio = await getAudioStream(videoId);
      console.log('Audio found:', !!audio);

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