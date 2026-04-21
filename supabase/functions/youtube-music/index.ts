// YouTube Music plugin endpoint for SoundFlow.
// Uses youtubei.js (the same unofficial InnerTube client used by
// the YouTube-Music-V2/youtube-music desktop app) to search YouTube Music
// and resolve a direct audio stream URL (GoogleVideo CDN, decifrato).
//
// Plugin contract (SoundFlow):
//   POST { action: "search-and-stream", title, artist, album?, quality? }
//   -> { streamUrl, quality, mimeType, ... } | { error }
//
// Extra debug actions:
//   POST { action: "search", title, artist }   -> { results: [...] }
//   POST { action: "get-stream", videoId }     -> { streamUrl, ... }

import { Innertube, UniversalCache } from "npm:youtubei.js@10.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Cache the Innertube client across invocations within the same isolate.
let ytPromise: Promise<Innertube> | null = null;
function getYT(): Promise<Innertube> {
  if (!ytPromise) {
    ytPromise = Innertube.create({
      cache: new UniversalCache(false),
      generate_session_locally: true,
    });
  }
  return ytPromise;
}

interface YTSearchResult {
  videoId: string;
  title: string;
  artist: string;
  album?: string;
  duration?: number;
  thumbnail?: string;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreMatch(
  query: { title: string; artist: string },
  result: { title: string; artist: string },
): number {
  const qt = normalize(query.title);
  const qa = normalize(query.artist);
  const rt = normalize(result.title);
  const ra = normalize(result.artist);
  let score = 0;
  if (rt === qt) score += 50;
  else if (rt.includes(qt) || qt.includes(rt)) score += 25;
  if (ra === qa) score += 50;
  else if (ra.includes(qa) || qa.includes(ra)) score += 25;
  // Penalize live / sped up / remix / cover unless the query asked for them
  const noisy = /(live|sped\s?up|nightcore|cover|karaoke|instrumental|remix)/;
  if (noisy.test(rt) && !noisy.test(qt)) score -= 30;
  return score;
}

async function searchYouTubeMusic(
  title: string,
  artist: string,
): Promise<YTSearchResult[]> {
  const yt = await getYT();
  const query = `${title} ${artist}`.trim();
  // Music.search returns YTMusic-shaped results (songs, videos, albums...).
  const search = await yt.music.search(query, { type: "song" });

  const out: YTSearchResult[] = [];
  // Walk the contents — youtubei.js types are loose, we coerce defensively.
  // deno-lint-ignore no-explicit-any
  const songs: any[] =
    // deno-lint-ignore no-explicit-any
    (search?.songs as any)?.contents ??
    // deno-lint-ignore no-explicit-any
    (search?.contents as any) ??
    [];

  for (const item of songs) {
    // deno-lint-ignore no-explicit-any
    const it: any = item;
    const videoId: string | undefined =
      it?.id ?? it?.video_id ?? it?.endpoint?.payload?.videoId;
    if (!videoId) continue;
    const titleStr: string =
      typeof it?.title === "string" ? it.title : it?.title?.text ?? "";
    const artists =
      it?.artists?.map?.((a: { name?: string }) => a?.name).filter(Boolean) ??
      [];
    const artistStr: string = artists.join(", ") ||
      (typeof it?.author === "string" ? it.author : it?.author?.name ?? "");
    const album: string | undefined = typeof it?.album === "string"
      ? it.album
      : it?.album?.name;
    const duration: number | undefined = it?.duration?.seconds ??
      (typeof it?.duration === "number" ? it.duration : undefined);
    const thumbnail: string | undefined = it?.thumbnail?.contents?.[0]?.url ??
      it?.thumbnails?.[0]?.url;

    out.push({
      videoId,
      title: titleStr,
      artist: artistStr,
      album,
      duration,
      thumbnail,
    });
    if (out.length >= 10) break;
  }
  return out;
}

interface StreamPick {
  streamUrl: string;
  mimeType: string;
  bitrate?: number;
  sampleRate?: number;
  itag?: number;
  container?: string;
}

async function getStreamForVideo(
  videoId: string,
  quality: "high" | "medium" | "low" | "lossless" = "high",
): Promise<StreamPick> {
  const yt = await getYT();
  // Use ANDROID client — most reliable for unsigned audio URLs.
  const info = await yt.getInfo(videoId, "ANDROID");

  // Filter audio-only adaptive formats.
  // deno-lint-ignore no-explicit-any
  const adaptive: any[] = (info as any)?.streaming_data?.adaptive_formats ?? [];
  const audio = adaptive.filter((f) =>
    typeof f?.mime_type === "string" && f.mime_type.startsWith("audio/")
  );
  if (audio.length === 0) {
    throw new Error("No audio formats available for this video");
  }

  // Sort by bitrate desc; pick by quality.
  audio.sort((a, b) => (b?.bitrate ?? 0) - (a?.bitrate ?? 0));
  const pickIndex = quality === "low"
    ? audio.length - 1
    : quality === "medium"
    ? Math.floor(audio.length / 2)
    : 0; // high / lossless -> best
  const chosen = audio[pickIndex] ?? audio[0];

  // Decipher / build playable URL.
  // deno-lint-ignore no-explicit-any
  const url = typeof (chosen as any)?.decipher === "function"
    // deno-lint-ignore no-explicit-any
    ? (chosen as any).decipher(yt.session.player)
    // deno-lint-ignore no-explicit-any
    : ((chosen as any)?.url as string);

  if (!url) throw new Error("Failed to resolve audio URL");

  return {
    streamUrl: url,
    mimeType: chosen?.mime_type ?? "audio/webm",
    bitrate: chosen?.bitrate,
    sampleRate: chosen?.sample_rate,
    itag: chosen?.itag,
    container: chosen?.mime_type?.split(";")[0]?.split("/")?.[1],
  };
}

interface RequestBody {
  action?: string;
  title?: string;
  artist?: string;
  album?: string;
  videoId?: string;
  quality?: "high" | "medium" | "low" | "lossless";
  config?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as RequestBody;
    const action = body.action ?? "search-and-stream";

    if (action === "verify") {
      // No config required, but we still confirm the client can boot.
      try {
        await getYT();
        return new Response(JSON.stringify({ valid: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e) {
        return new Response(
          JSON.stringify({ valid: false, error: (e as Error).message }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    }

    if (action === "search") {
      const title = (body.title ?? "").trim();
      const artist = (body.artist ?? "").trim();
      if (!title) {
        return new Response(JSON.stringify({ error: "title required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const results = await searchYouTubeMusic(title, artist);
      return new Response(JSON.stringify({ results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "get-stream") {
      if (!body.videoId) {
        return new Response(JSON.stringify({ error: "videoId required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const stream = await getStreamForVideo(body.videoId, body.quality);
      return new Response(
        JSON.stringify({
          streamUrl: stream.streamUrl,
          mimeType: stream.mimeType,
          quality: String(stream.bitrate ?? ""),
          sampleRate: stream.sampleRate,
          itag: stream.itag,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Default: search-and-stream
    const title = (body.title ?? "").trim();
    const artist = (body.artist ?? "").trim();
    if (!title) {
      return new Response(JSON.stringify({ error: "title required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const candidates = await searchYouTubeMusic(title, artist);
    if (candidates.length === 0) {
      return new Response(JSON.stringify({ error: "No matches on YouTube Music" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rank by string similarity, optionally by duration if provided.
    const ranked = candidates
      .map((c) => ({ c, score: scoreMatch({ title, artist }, c) }))
      .sort((a, b) => b.score - a.score);

    let lastError: string | null = null;
    for (const { c } of ranked.slice(0, 3)) {
      try {
        const stream = await getStreamForVideo(c.videoId, body.quality);
        return new Response(
          JSON.stringify({
            streamUrl: stream.streamUrl,
            mimeType: stream.mimeType,
            quality: String(stream.bitrate ?? ""),
            sampleRate: stream.sampleRate,
            itag: stream.itag,
            source: "youtube-music",
            videoId: c.videoId,
            matchedTitle: c.title,
            matchedArtist: c.artist,
            matchedAlbum: c.album,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      } catch (e) {
        lastError = (e as Error).message;
        console.error(`[youtube-music] stream failed for ${c.videoId}:`, lastError);
      }
    }

    return new Response(
      JSON.stringify({
        error: lastError ?? "Unable to resolve any stream from YouTube Music",
      }),
      {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    console.error("[youtube-music] handler error:", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message ?? "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
