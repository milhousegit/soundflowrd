import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Multiple Piped instances for fallback
const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://api.piped.projectsegfau.lt",
  "https://pipedapi.in.projectsegfau.lt",
  "https://pipedapi.syncpundit.io",
];

// Invidious instances as additional fallback
const INVIDIOUS_INSTANCES = [
  "https://invidious.fdn.fr",
  "https://inv.nadeko.net",
  "https://invidious.nerdvpn.de",
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

async function tryFetch(url: string, timeout = 10000): Promise<Response | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, { 
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    clearTimeout(timeoutId);
    return response;
  } catch (e) {
    clearTimeout(timeoutId);
    console.error(`Fetch error for ${url}:`, e);
    return null;
  }
}

async function searchWithPiped(query: string): Promise<VideoResult[]> {
  const encodedQuery = encodeURIComponent(query);
  
  for (const instance of PIPED_INSTANCES) {
    try {
      console.log(`Trying Piped instance: ${instance}`);
      const response = await tryFetch(`${instance}/search?q=${encodedQuery}&filter=music_songs`);
      
      if (!response || !response.ok) {
        console.log(`Piped ${instance} failed with status: ${response?.status}`);
        continue;
      }
      
      const data = await response.json();
      console.log(`Piped ${instance} response:`, JSON.stringify(data).substring(0, 200));
      
      if (data.items && Array.isArray(data.items) && data.items.length > 0) {
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
      console.error(`Piped search error for ${instance}:`, error);
      continue;
    }
  }
  
  return [];
}

async function searchWithInvidious(query: string): Promise<VideoResult[]> {
  const encodedQuery = encodeURIComponent(query);
  
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      console.log(`Trying Invidious instance: ${instance}`);
      const response = await tryFetch(`${instance}/api/v1/search?q=${encodedQuery}&type=video`);
      
      if (!response || !response.ok) {
        console.log(`Invidious ${instance} failed with status: ${response?.status}`);
        continue;
      }
      
      const data = await response.json();
      console.log(`Invidious ${instance} results: ${data?.length || 0}`);
      
      if (Array.isArray(data) && data.length > 0) {
        return data
          .filter((item: any) => item.type === 'video' && item.lengthSeconds > 0)
          .slice(0, 5)
          .map((item: any) => ({
            id: item.videoId || '',
            title: item.title || 'Unknown',
            duration: item.lengthSeconds || 0,
            uploaderName: item.author || 'Unknown',
            thumbnail: item.videoThumbnails?.[0]?.url || '',
          }));
      }
    } catch (error) {
      console.error(`Invidious search error for ${instance}:`, error);
      continue;
    }
  }
  
  return [];
}

async function searchVideos(query: string): Promise<VideoResult[]> {
  console.log('Starting YouTube search for:', query);
  
  // Try Piped first
  let results = await searchWithPiped(query);
  
  if (results.length > 0) {
    console.log(`Found ${results.length} results from Piped`);
    return results;
  }
  
  // Fallback to Invidious
  console.log('Piped returned no results, trying Invidious...');
  results = await searchWithInvidious(query);
  
  if (results.length > 0) {
    console.log(`Found ${results.length} results from Invidious`);
    return results;
  }
  
  // Try without filter as last resort
  console.log('Trying Piped without music filter...');
  for (const instance of PIPED_INSTANCES.slice(0, 2)) {
    try {
      const response = await tryFetch(`${instance}/search?q=${encodeURIComponent(query)}`);
      if (response?.ok) {
        const data = await response.json();
        if (data.items?.length > 0) {
          return data.items
            .filter((item: any) => item.type === 'stream' && item.duration > 0 && item.duration < 600)
            .slice(0, 5)
            .map((item: any) => ({
              id: item.url?.replace('/watch?v=', '') || '',
              title: item.title || 'Unknown',
              duration: item.duration || 0,
              uploaderName: item.uploaderName || 'Unknown',
              thumbnail: item.thumbnail || '',
            }));
        }
      }
    } catch (e) {
      console.error('Fallback search error:', e);
    }
  }
  
  console.log('No results found from any source');
  return [];
}

async function getAudioStreamPiped(videoId: string): Promise<AudioStream | null> {
  for (const instance of PIPED_INSTANCES) {
    try {
      console.log(`Getting audio from Piped: ${instance}/streams/${videoId}`);
      const response = await tryFetch(`${instance}/streams/${videoId}`);
      
      if (!response || !response.ok) continue;
      
      const data = await response.json();
      
      if (data.audioStreams && Array.isArray(data.audioStreams)) {
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
      console.error(`Piped stream error for ${instance}:`, error);
      continue;
    }
  }
  
  return null;
}

async function getAudioStreamInvidious(videoId: string): Promise<AudioStream | null> {
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      console.log(`Getting audio from Invidious: ${instance}/api/v1/videos/${videoId}`);
      const response = await tryFetch(`${instance}/api/v1/videos/${videoId}`);
      
      if (!response || !response.ok) continue;
      
      const data = await response.json();
      
      if (data.adaptiveFormats && Array.isArray(data.adaptiveFormats)) {
        const audioFormats = data.adaptiveFormats
          .filter((f: any) => f.type?.includes('audio') && f.url)
          .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
        
        if (audioFormats.length > 0) {
          const best = audioFormats[0];
          return {
            url: best.url,
            quality: best.audioQuality || `${Math.round((best.bitrate || 128000) / 1000)}kbps`,
            mimeType: best.type || 'audio/webm',
            bitrate: best.bitrate || 128000,
          };
        }
      }
    } catch (error) {
      console.error(`Invidious stream error for ${instance}:`, error);
      continue;
    }
  }
  
  return null;
}

async function getAudioStream(videoId: string): Promise<AudioStream | null> {
  // Try Piped first
  let audio = await getAudioStreamPiped(videoId);
  if (audio) return audio;
  
  // Fallback to Invidious
  console.log('Piped audio failed, trying Invidious...');
  audio = await getAudioStreamInvidious(videoId);
  return audio;
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

      console.log('YouTube search request for:', query);
      const results = await searchVideos(query);
      console.log('Final search results:', results.length);

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

      console.log('Getting audio for video:', videoId);
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
