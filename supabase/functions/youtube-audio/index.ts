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

// Comprehensive list of Piped instances - January 2026
const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi-libre.kavin.rocks",
  "https://pipedapi.leptons.xyz",
  "https://piped-api.privacy.com.de",
  "https://api.piped.yt",
  "https://pipedapi.drgns.space",
  "https://pipedapi.owo.si",
  "https://pipedapi.ducks.party",
  "https://piped-api.codespace.cz",
  "https://pipedapi.reallyaweso.me",
  "https://api.piped.private.coffee",
  "https://pipedapi.darkness.services",
  "https://pipedapi.orangenet.cc",
];

// Comprehensive list of Invidious instances - January 2026
const INVIDIOUS_INSTANCES = [
  "https://inv.nadeko.net",
  "https://invidious.privacyredirect.com",
  "https://invidious.protokolla.fi",
  "https://invidious.perennialte.ch",
  "https://invidious.darkness.services",
  "https://vid.puffyan.us",
  "https://invidious.lunar.icu",
  "https://iv.ggtyler.dev",
  "https://invidious.fdn.fr",
  "https://yt.drgnz.club",
];

function log(category: string, message: string, data?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${category}] ${message}`, data ? JSON.stringify(data) : "");
}

async function tryFetch(url: string, options: RequestInit = {}, timeout = 15000): Promise<Response | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        ...options.headers,
      },
      ...options,
    });
    
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
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
      log("PIPED", `Trying ${instance}`);
      const response = await tryFetch(url);
      
      if (!response) continue;
      
      if (!response.ok) {
        log("PIPED", `${instance} failed`, { status: response.status });
        continue;
      }
      
      const text = await response.text();
      
      if (!text.startsWith("{")) {
        continue;
      }
      
      const data = JSON.parse(text);
      
      if (data.audioStreams && Array.isArray(data.audioStreams) && data.audioStreams.length > 0) {
        const sortedStreams = data.audioStreams
          .filter((s: any) => s.url && s.mimeType?.includes("audio"))
          .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
        
        if (sortedStreams.length > 0) {
          const best = sortedStreams[0];
          log("PIPED", `SUCCESS from ${instance}`, { quality: best.quality || `${best.bitrate}bps` });
          return {
            url: best.url,
            quality: best.quality || `${Math.round((best.bitrate || 0) / 1000)}kbps`,
            mimeType: best.mimeType || "audio/mp4",
            bitrate: best.bitrate || 0,
          };
        }
      }
    } catch {
      // Silent fail, try next instance
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
      log("INVIDIOUS", `Trying ${instance}`);
      const response = await tryFetch(url);
      
      if (!response) continue;
      
      if (!response.ok) {
        log("INVIDIOUS", `${instance} failed`, { status: response.status });
        continue;
      }
      
      const text = await response.text();
      
      if (!text.startsWith("{")) {
        continue;
      }
      
      const data = JSON.parse(text);
      
      if (data.adaptiveFormats && Array.isArray(data.adaptiveFormats)) {
        const audioFormats = data.adaptiveFormats
          .filter((f: any) => f.type?.includes("audio") && f.url)
          .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
        
        if (audioFormats.length > 0) {
          const best = audioFormats[0];
          log("INVIDIOUS", `SUCCESS from ${instance}`, { bitrate: best.bitrate });
          return {
            url: best.url,
            quality: `${Math.round((best.bitrate || 0) / 1000)}kbps`,
            mimeType: best.type?.split(";")[0] || "audio/mp4",
            bitrate: best.bitrate || 0,
          };
        }
      }
    } catch {
      // Silent fail, try next instance
    }
  }
  
  return null;
}

// ============ MAIN AUDIO EXTRACTION ============
async function getAudioStream(videoId: string): Promise<AudioStream | null> {
  const cleanVideoId = videoId.replace("/watch?v=", "").replace("watch?v=", "").split("&")[0];
  
  log("SERVER", "Extracting audio", { videoId: cleanVideoId });
  
  // Try both in parallel for faster results
  const [pipedResult, invidiousResult] = await Promise.allSettled([
    getAudioStreamPiped(cleanVideoId),
    getAudioStreamInvidious(cleanVideoId),
  ]);
  
  if (pipedResult.status === "fulfilled" && pipedResult.value) {
    return pipedResult.value;
  }
  
  if (invidiousResult.status === "fulfilled" && invidiousResult.value) {
    return invidiousResult.value;
  }
  
  log("SERVER", "No audio stream found");
  return null;
}

// ============ SEARCH: try a single Piped instance ============
async function searchPipedInstance(instance: string, encodedQuery: string): Promise<VideoResult[] | null> {
  try {
    const url = `${instance}/search?q=${encodedQuery}&filter=videos`;
    const response = await tryFetch(url);
    
    if (!response?.ok) return null;
    
    const text = await response.text();
    if (!text.startsWith("{") && !text.startsWith("[")) return null;
    
    const data = JSON.parse(text);
    
    if (data.items && Array.isArray(data.items) && data.items.length > 0) {
      const results = data.items
        .filter((item: any) => item.type === "stream" && item.duration > 0 && item.duration < 900)
        .slice(0, 8)
        .map((item: any) => ({
          id: item.url?.replace("/watch?v=", "") || "",
          title: item.title || "Unknown",
          duration: item.duration || 0,
          uploaderName: item.uploaderName || "Unknown",
          thumbnail: item.thumbnail || "",
        }));
      
      if (results.length > 0) {
        log("SEARCH", `Found ${results.length} results from Piped`, { instance });
        return results;
      }
    }
  } catch {
    // Silent fail
  }
  return null;
}

// ============ SEARCH: try a single Invidious instance ============
async function searchInvidiousInstance(instance: string, encodedQuery: string): Promise<VideoResult[] | null> {
  try {
    const url = `${instance}/api/v1/search?q=${encodedQuery}&type=video`;
    const response = await tryFetch(url);
    
    if (!response?.ok) return null;
    
    const text = await response.text();
    if (!text.startsWith("[")) return null;
    
    const data = JSON.parse(text);
    
    if (Array.isArray(data) && data.length > 0) {
      const results = data
        .filter((item: any) => item.type === "video" && item.lengthSeconds > 0 && item.lengthSeconds < 900)
        .slice(0, 8)
        .map((item: any) => ({
          id: item.videoId || "",
          title: item.title || "Unknown",
          duration: item.lengthSeconds || 0,
          uploaderName: item.author || "Unknown",
          thumbnail: item.videoThumbnails?.[0]?.url || "",
        }));
      
      if (results.length > 0) {
        log("SEARCH", `Found ${results.length} results from Invidious`, { instance });
        return results;
      }
    }
  } catch {
    // Silent fail
  }
  return null;
}

// ============ VIDEO SEARCH (parallel) ============
async function searchVideos(query: string): Promise<VideoResult[]> {
  const encodedQuery = encodeURIComponent(query);
  const pipedInstances = shuffleArray(PIPED_INSTANCES);
  const invidiousInstances = shuffleArray(INVIDIOUS_INSTANCES);
  
  log("SEARCH", "Starting video search", { query });
  
  // Try ALL Piped instances in parallel (not just 3)
  const pipedPromises = pipedInstances.map(instance => 
    searchPipedInstance(instance, encodedQuery)
  );
  
  // Try ALL Invidious instances in parallel
  const invidiousPromises = invidiousInstances.map(instance => 
    searchInvidiousInstance(instance, encodedQuery)
  );
  
  // Race: first successful result wins
  const allPromises = [...pipedPromises, ...invidiousPromises];
  
  // Use Promise.any to get the first successful result
  try {
    const firstResult = await Promise.any(
      allPromises.map(async (p) => {
        const result = await p;
        if (result && result.length > 0) return result;
        throw new Error("No results");
      })
    );
    return firstResult;
  } catch {
    // All failed, return empty
    log("SEARCH", "No results found from any source");
    return [];
  }
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

      log("SERVER", "Search Request", { query });
      const results = await searchVideos(query);
      log("SERVER", "Search completed", { resultsCount: results.length });

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

      log("SERVER", "Get Audio Stream", { videoId });
      
      const audioStream = await getAudioStream(videoId);
      
      if (audioStream) {
        return new Response(
          JSON.stringify({ audio: audioStream }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } else {
        log("SERVER", "Falling back to iframe mode", { videoId });
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
    log("SERVER", "Error", { error: error instanceof Error ? error.message : String(error) });
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
