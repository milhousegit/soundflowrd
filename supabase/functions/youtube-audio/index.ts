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

// Updated Piped instances - January 2025
const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://api.piped.projectsegfau.lt",
  "https://pipedapi.moomoo.me",
  "https://pipedapi.syncpundit.io",
  "https://api.piped.privacydev.net",
  "https://pipedapi.r4fo.com",
  "https://pipedapi.smnz.de",
];

// Updated Invidious instances - January 2025
const INVIDIOUS_INSTANCES = [
  "https://vid.puffyan.us",
  "https://invidious.snopyta.org",
  "https://yewtu.be",
  "https://inv.riverside.rocks",
  "https://invidious.kavin.rocks",
  "https://invidious.osi.kr",
];

async function tryFetch(url: string, options: RequestInit = {}, timeout = 12000): Promise<Response | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json",
        ...options.headers,
      },
      ...options,
    });
    
    clearTimeout(timeoutId);
    return response;
  } catch {
    return null;
  }
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// ============ PIPED API ============
async function getAudioStreamPiped(videoId: string): Promise<AudioStream | null> {
  const instances = shuffleArray(PIPED_INSTANCES);
  
  for (const instance of instances) {
    try {
      const url = `${instance}/streams/${videoId}`;
      console.log(`Trying Piped: ${url}`);
      const response = await tryFetch(url);
      
      if (!response) {
        console.log(`Piped ${instance} failed: no response`);
        continue;
      }
      
      if (!response.ok) {
        console.log(`Piped ${instance} failed: ${response.status}`);
        continue;
      }
      
      const text = await response.text();
      
      // Check if response is valid JSON
      if (!text.startsWith("{")) {
        console.log(`Piped ${instance} failed: invalid JSON response`);
        continue;
      }
      
      const data = JSON.parse(text);
      
      if (data.audioStreams && Array.isArray(data.audioStreams) && data.audioStreams.length > 0) {
        const sortedStreams = data.audioStreams
          .filter((s: any) => s.url && s.mimeType?.includes("audio"))
          .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
        
        if (sortedStreams.length > 0) {
          const best = sortedStreams[0];
          console.log(`Piped SUCCESS: ${best.quality || best.bitrate}kbps from ${instance}`);
          return {
            url: best.url,
            quality: best.quality || `${Math.round((best.bitrate || 0) / 1000)}kbps`,
            mimeType: best.mimeType || "audio/mp4",
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

// ============ INVIDIOUS API ============
async function getAudioStreamInvidious(videoId: string): Promise<AudioStream | null> {
  const instances = shuffleArray(INVIDIOUS_INSTANCES);
  
  for (const instance of instances) {
    try {
      const url = `${instance}/api/v1/videos/${videoId}`;
      console.log(`Trying Invidious: ${url}`);
      const response = await tryFetch(url);
      
      if (!response) {
        console.log(`Invidious ${instance} failed: no response`);
        continue;
      }
      
      if (!response.ok) {
        console.log(`Invidious ${instance} failed: ${response.status}`);
        continue;
      }
      
      const text = await response.text();
      
      if (!text.startsWith("{")) {
        console.log(`Invidious ${instance} failed: invalid JSON response`);
        continue;
      }
      
      const data = JSON.parse(text);
      
      if (data.adaptiveFormats && Array.isArray(data.adaptiveFormats)) {
        const audioFormats = data.adaptiveFormats
          .filter((f: any) => f.type?.includes("audio") && f.url)
          .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
        
        if (audioFormats.length > 0) {
          const best = audioFormats[0];
          console.log(`Invidious SUCCESS: ${best.bitrate}bps from ${instance}`);
          return {
            url: best.url,
            quality: `${Math.round((best.bitrate || 0) / 1000)}kbps`,
            mimeType: best.type?.split(";")[0] || "audio/mp4",
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
  const cleanVideoId = videoId.replace("/watch?v=", "").replace("watch?v=", "").split("&")[0];
  
  console.log("========== Extracting audio for:", cleanVideoId, "==========");
  
  // Try both in parallel for faster results
  const [pipedResult, invidiousResult] = await Promise.allSettled([
    getAudioStreamPiped(cleanVideoId),
    getAudioStreamInvidious(cleanVideoId),
  ]);
  
  // Return first successful result
  if (pipedResult.status === "fulfilled" && pipedResult.value) {
    console.log("SUCCESS: Got audio from Piped");
    return pipedResult.value;
  }
  
  if (invidiousResult.status === "fulfilled" && invidiousResult.value) {
    console.log("SUCCESS: Got audio from Invidious");
    return invidiousResult.value;
  }
  
  console.log("FAILED: No audio stream found from any source");
  return null;
}

// ============ VIDEO SEARCH ============
async function searchVideos(query: string): Promise<VideoResult[]> {
  const encodedQuery = encodeURIComponent(query);
  const pipedInstances = shuffleArray(PIPED_INSTANCES);
  const invidiousInstances = shuffleArray(INVIDIOUS_INSTANCES);
  
  // Try Piped first
  for (const instance of pipedInstances) {
    try {
      const url = `${instance}/search?q=${encodedQuery}&filter=videos`;
      console.log(`Searching: ${url}`);
      const response = await tryFetch(url);
      
      if (!response?.ok) {
        console.log(`${instance} failed: ${response?.status}`);
        continue;
      }
      
      const text = await response.text();
      if (!text.startsWith("{") && !text.startsWith("[")) continue;
      
      const data = JSON.parse(text);
      
      if (data.items && Array.isArray(data.items) && data.items.length > 0) {
        const results = data.items
          .filter((item: any) => item.type === "stream" && item.duration > 0 && item.duration < 900)
          .slice(0, 5)
          .map((item: any) => ({
            id: item.url?.replace("/watch?v=", "") || "",
            title: item.title || "Unknown",
            duration: item.duration || 0,
            uploaderName: item.uploaderName || "Unknown",
            thumbnail: item.thumbnail || "",
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
  
  // Fallback to Invidious
  for (const instance of invidiousInstances) {
    try {
      const url = `${instance}/api/v1/search?q=${encodedQuery}&type=video`;
      console.log(`Invidious search: ${url}`);
      const response = await tryFetch(url);
      
      if (!response?.ok) continue;
      
      const text = await response.text();
      if (!text.startsWith("[")) continue;
      
      const data = JSON.parse(text);
      
      if (Array.isArray(data) && data.length > 0) {
        const results = data
          .filter((item: any) => item.type === "video" && item.lengthSeconds > 0 && item.lengthSeconds < 900)
          .slice(0, 5)
          .map((item: any) => ({
            id: item.videoId || "",
            title: item.title || "Unknown",
            duration: item.lengthSeconds || 0,
            uploaderName: item.author || "Unknown",
            thumbnail: item.videoThumbnails?.[0]?.url || "",
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

    if (action === "search") {
      if (!query) {
        return new Response(
          JSON.stringify({ error: "Query is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("========== YouTube Search ==========");
      console.log("Query:", query);
      const results = await searchVideos(query);
      console.log("Results:", results.length);

      return new Response(
        JSON.stringify({ videos: results }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "getAudio") {
      if (!videoId) {
        return new Response(
          JSON.stringify({ error: "Video ID is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("========== Get Audio Stream ==========");
      console.log("Video ID:", videoId);
      
      const audioStream = await getAudioStream(videoId);
      
      if (audioStream) {
        return new Response(
          JSON.stringify({ audio: audioStream }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } else {
        console.log("Falling back to iframe mode for:", videoId);
        return new Response(
          JSON.stringify({ 
            error: "No audio stream found", 
            audio: null,
            useIframe: true,
            videoId: videoId.replace("/watch?v=", "").replace("watch?v=", "").split("&")[0]
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("YouTube audio error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
