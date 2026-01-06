import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Use Piped API (privacy-friendly YouTube frontend) for search and audio extraction
const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.syncpundit.io",
  "https://api.piped.yt",
];

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

async function tryFetch(url: string, timeout = 8000): Promise<Response | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

async function searchVideos(query: string): Promise<VideoResult[]> {
  const encodedQuery = encodeURIComponent(query);
  
  for (const instance of PIPED_INSTANCES) {
    try {
      const response = await tryFetch(`${instance}/search?q=${encodedQuery}&filter=music_songs`);
      
      if (!response || !response.ok) continue;
      
      const data = await response.json();
      
      if (data.items && Array.isArray(data.items)) {
        return data.items
          .filter((item: any) => item.type === 'stream' && item.duration > 0)
          .slice(0, 5)
          .map((item: any) => ({
            id: item.url?.replace('/watch?v=', '') || '',
            title: item.title || 'Unknown',
            duration: item.duration || 0,
            uploaderName: item.uploaderName || 'Unknown',
            thumbnail: item.thumbnail || '',
          }));
      }
    } catch (error) {
      console.error(`Search failed for ${instance}:`, error);
      continue;
    }
  }
  
  return [];
}

async function getAudioStream(videoId: string): Promise<AudioStream | null> {
  for (const instance of PIPED_INSTANCES) {
    try {
      const response = await tryFetch(`${instance}/streams/${videoId}`);
      
      if (!response || !response.ok) continue;
      
      const data = await response.json();
      
      if (data.audioStreams && Array.isArray(data.audioStreams)) {
        // Find best audio stream (prefer opus/webm, then m4a)
        const audioStreams = data.audioStreams
          .filter((s: any) => s.url && s.bitrate)
          .sort((a: any, b: any) => b.bitrate - a.bitrate);
        
        if (audioStreams.length > 0) {
          const best = audioStreams[0];
          return {
            url: best.url,
            quality: best.quality || `${Math.round(best.bitrate / 1000)}kbps`,
            mimeType: best.mimeType || 'audio/webm',
            bitrate: best.bitrate,
          };
        }
      }
    } catch (error) {
      console.error(`Stream fetch failed for ${instance}:`, error);
      continue;
    }
  }
  
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

      console.log('Searching YouTube for:', query);
      const results = await searchVideos(query);
      console.log('Found videos:', results.length);

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

      console.log('Getting audio stream for:', videoId);
      const audio = await getAudioStream(videoId);

      if (!audio) {
        return new Response(
          JSON.stringify({ error: 'No audio stream found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Audio stream found:', audio.quality);
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
