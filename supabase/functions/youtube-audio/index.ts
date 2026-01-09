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

// Updated and expanded Piped instances pool (2025)
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

// Updated Invidious instances pool (2025)
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

async function tryFetch(url: string, timeout = 8000): Promise<Response | null> {
  try {
    const response = await fetch(url, { 
      signal: AbortSignal.timeout(timeout),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      }
    });
    return response;
  } catch (e) {
    return null;
  }
}

// Shuffle array to distribute load and avoid hitting same instances
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

async function searchVideos(query: string): Promise<VideoResult[]> {
  const encodedQuery = encodeURIComponent(query);
  
  // Shuffle instances to distribute load
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

// Extract direct audio URL from video using Piped or Invidious
async function getAudioStream(videoId: string): Promise<AudioStream | null> {
  const cleanVideoId = videoId.replace('/watch?v=', '').replace('watch?v=', '').split('&')[0];
  
  console.log('Extracting audio for:', cleanVideoId);
  
  // Shuffle instances for load distribution
  const pipedInstances = shuffleArray(PIPED_INSTANCES);
  const invidiousInstances = shuffleArray(INVIDIOUS_INSTANCES);
  
  // Try Piped instances first - they provide direct audio streams
  for (const instance of pipedInstances) {
    try {
      const url = `${instance}/streams/${cleanVideoId}`;
      console.log(`Trying Piped: ${url}`);
      const response = await tryFetch(url, 12000);
      
      if (!response || !response.ok) {
        console.log(`Piped ${instance} failed: ${response?.status}`);
        continue;
      }
      
      const data = await response.json();
      
      // Get audio streams - prefer higher quality
      if (data.audioStreams && Array.isArray(data.audioStreams) && data.audioStreams.length > 0) {
        // Sort by bitrate descending to get best quality
        const sortedStreams = data.audioStreams
          .filter((s: any) => s.url && s.mimeType?.includes('audio'))
          .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
        
        if (sortedStreams.length > 0) {
          const best = sortedStreams[0];
          console.log(`Found audio stream: ${best.quality || best.bitrate}kbps from ${instance}`);
          return {
            url: best.url,
            quality: best.quality || `${Math.round((best.bitrate || 0) / 1000)}kbps`,
            mimeType: best.mimeType || 'audio/mp4',
            bitrate: best.bitrate || 0,
          };
        }
      }
    } catch (error) {
      console.error(`Piped audio error: ${error instanceof Error ? error.message : error}`);
    }
  }
  
  // Fallback to Invidious
  for (const instance of invidiousInstances) {
    try {
      const url = `${instance}/api/v1/videos/${cleanVideoId}`;
      console.log(`Trying Invidious: ${url}`);
      const response = await tryFetch(url, 12000);
      
      if (!response || !response.ok) {
        console.log(`Invidious ${instance} failed: ${response?.status}`);
        continue;
      }
      
      const data = await response.json();
      
      // Get adaptive formats (audio only)
      if (data.adaptiveFormats && Array.isArray(data.adaptiveFormats)) {
        const audioFormats = data.adaptiveFormats
          .filter((f: any) => f.type?.includes('audio') && f.url)
          .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
        
        if (audioFormats.length > 0) {
          const best = audioFormats[0];
          console.log(`Found Invidious audio: ${best.bitrate}bps from ${instance}`);
          return {
            url: best.url,
            quality: `${Math.round((best.bitrate || 0) / 1000)}kbps`,
            mimeType: best.type?.split(';')[0] || 'audio/mp4',
            bitrate: best.bitrate || 0,
          };
        }
      }
    } catch (error) {
      console.error(`Invidious audio error: ${error instanceof Error ? error.message : error}`);
    }
  }
  
  console.log('No audio stream found for:', cleanVideoId);
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
