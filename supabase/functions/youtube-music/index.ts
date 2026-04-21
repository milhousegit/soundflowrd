// YouTube Music plugin – calls the InnerTube API directly (no youtubei.js)
// to avoid the Deno edge-runtime Brotli decompression bug.

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Public InnerTube keys (well-known, embedded in the YouTube apps)
const WEB_REMIX_KEY = "AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30";
const ANDROID_MUSIC_KEY = "AIzaSyAOghZGza2MQSZkY_zfZ370N-PUdXEo8AI";

// WEB_REMIX (YT Music web) → parsable JSON for search
const WEB_REMIX_CONTEXT = {
  client: {
    clientName: "WEB_REMIX",
    clientVersion: "1.20240101.01.00",
    hl: "en",
    gl: "US",
  },
};

// ANDROID_MUSIC → returns playable URLs (no signature cipher) for /player
const ANDROID_MUSIC_CONTEXT = {
  client: {
    clientName: "ANDROID_MUSIC",
    clientVersion: "7.27.52",
    androidSdkVersion: 30,
    osName: "Android",
    osVersion: "11",
    hl: "en",
    gl: "US",
    utcOffsetMinutes: 0,
  },
};

const WEB_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Origin": "https://music.youtube.com",
  "Referer": "https://music.youtube.com/",
  "Accept-Encoding": "identity",
};

const ANDROID_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "User-Agent":
    "com.google.android.apps.youtube.music/7.27.52 (Linux; U; Android 11) gzip",
  "X-Goog-Api-Format-Version": "1",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "identity",
};

interface YTSearchResult {
  videoId: string;
  title: string;
  artist: string;
  album?: string;
  duration?: number;
  thumbnail?: string;
}

function normalize(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreMatch(
  q: { title: string; artist: string },
  r: { title: string; artist: string },
): number {
  const qt = normalize(q.title);
  const qa = normalize(q.artist);
  const rt = normalize(r.title);
  const ra = normalize(r.artist);
  let score = 0;
  if (rt === qt) score += 100;
  else if (rt.includes(qt) || qt.includes(rt)) score += 60;
  if (ra === qa) score += 100;
  else if (ra.includes(qa) || qa.includes(ra)) score += 60;
  const lower = (rt + " " + ra).toLowerCase();
  if (/(live|remix|sped\s?up|slowed|cover|karaoke|instrumental|nightcore)/.test(lower)) {
    score -= 40;
  }
  return score;
}

interface RawRun { text?: string }
interface MusicResponsiveItem {
  musicResponsiveListItemRenderer?: {
    playlistItemData?: { videoId?: string };
    flexColumns?: Array<{
      musicResponsiveListItemFlexColumnRenderer?: {
        text?: { runs?: RawRun[] };
      };
    }>;
    thumbnail?: {
      musicThumbnailRenderer?: {
        thumbnail?: { thumbnails?: Array<{ url: string }> };
      };
    };
  };
}

function parseDuration(s: string): number | undefined {
  if (!s || !/^\d+(:\d+){1,2}$/.test(s)) return undefined;
  const parts = s.split(":").map((x) => parseInt(x, 10));
  let total = 0;
  for (const p of parts) total = total * 60 + p;
  return total;
}

async function searchYouTubeMusic(
  title: string,
  artist: string,
): Promise<YTSearchResult[]> {
  const query = `${title} ${artist}`.trim();
  const body = {
    context: WEB_REMIX_CONTEXT,
    query,
    // Filter: Songs only
    params: "EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D",
  };
  const url =
    `https://music.youtube.com/youtubei/v1/search?key=${WEB_REMIX_KEY}&prettyPrint=false`;
  const res = await fetch(url, {
    method: "POST",
    headers: WEB_HEADERS,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`search failed ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();

  const results: YTSearchResult[] = [];
  const stack: unknown[] = [data];
  const seen = new Set<string>();
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object") continue;
    const obj = cur as Record<string, unknown>;
    if ("musicResponsiveListItemRenderer" in obj) {
      const r = (obj as MusicResponsiveItem).musicResponsiveListItemRenderer;
      const videoId = r?.playlistItemData?.videoId;
      if (videoId && !seen.has(videoId)) {
        seen.add(videoId);
        const cols = r?.flexColumns ?? [];
        const titleText =
          cols[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]
            ?.text ?? "";
        const subRuns =
          cols[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs ?? [];
        const subTexts = subRuns.map((x) => x.text ?? "").filter((t) =>
          t && t !== " • " && t !== " · "
        );
        const artistName = subTexts[0] ?? "";
        const album = subTexts[1] ?? undefined;
        const durStr = subTexts[subTexts.length - 1] ?? "";
        const duration = parseDuration(durStr);
        const thumbs =
          r?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails;
        const thumbnail = thumbs?.[thumbs.length - 1]?.url;
        results.push({
          videoId,
          title: titleText,
          artist: artistName,
          album,
          duration,
          thumbnail,
        });
      }
    }
    for (const v of Object.values(obj)) {
      if (v && typeof v === "object") stack.push(v);
    }
  }
  return results;
}

interface AdaptiveFormat {
  itag: number;
  url?: string;
  signatureCipher?: string;
  mimeType: string;
  bitrate?: number;
  audioSampleRate?: string;
  contentLength?: string;
  approxDurationMs?: string;
}

interface PlayerResponse {
  playabilityStatus?: { status?: string; reason?: string };
  streamingData?: {
    adaptiveFormats?: AdaptiveFormat[];
    formats?: AdaptiveFormat[];
    expiresInSeconds?: string;
  };
}

async function getPlayerResponse(videoId: string): Promise<PlayerResponse> {
  const body = {
    context: ANDROID_MUSIC_CONTEXT,
    videoId,
    playbackContext: {
      contentPlaybackContext: { html5Preference: "HTML5_PREF_WANTS" },
    },
    contentCheckOk: true,
    racyCheckOk: true,
  };
  const url =
    `https://music.youtube.com/youtubei/v1/player?key=${INNERTUBE_KEY}&prettyPrint=false`;
  const res = await fetch(url, {
    method: "POST",
    headers: COMMON_HEADERS,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`player failed ${res.status}: ${txt.slice(0, 200)}`);
  }
  return await res.json() as PlayerResponse;
}

interface StreamPick {
  streamUrl: string;
  mimeType: string;
  bitrate?: number;
  sampleRate?: number;
  itag?: number;
  contentLength?: number;
}

function pickAudioFormat(
  player: PlayerResponse,
  quality: "high" | "medium" | "low" | "lossless",
): StreamPick {
  const status = player.playabilityStatus?.status;
  if (status && status !== "OK") {
    throw new Error(
      `playability=${status}: ${player.playabilityStatus?.reason ?? ""}`,
    );
  }
  const formats = [
    ...(player.streamingData?.adaptiveFormats ?? []),
    ...(player.streamingData?.formats ?? []),
  ];
  const audios = formats.filter((f) =>
    f.mimeType?.startsWith("audio/") && f.url
  );
  if (audios.length === 0) {
    throw new Error("no playable audio formats (signature ciphered)");
  }
  audios.sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
  let chosen: AdaptiveFormat;
  if (quality === "high" || quality === "lossless") chosen = audios[0];
  else if (quality === "medium") {
    chosen = audios[Math.floor(audios.length / 2)];
  } else chosen = audios[audios.length - 1];

  return {
    streamUrl: chosen.url!,
    mimeType: chosen.mimeType,
    bitrate: chosen.bitrate,
    sampleRate: chosen.audioSampleRate
      ? parseInt(chosen.audioSampleRate, 10)
      : undefined,
    itag: chosen.itag,
    contentLength: chosen.contentLength
      ? parseInt(chosen.contentLength, 10)
      : undefined,
  };
}

interface RequestBody {
  action?: string;
  title?: string;
  artist?: string;
  album?: string;
  videoId?: string;
  trackId?: string;
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
      const res = await fetch(
        `https://music.youtube.com/youtubei/v1/search?key=${INNERTUBE_KEY}&prettyPrint=false`,
        {
          method: "POST",
          headers: COMMON_HEADERS,
          body: JSON.stringify({
            context: ANDROID_MUSIC_CONTEXT,
            query: "test",
          }),
        },
      );
      const ok = res.ok;
      await res.text();
      return new Response(
        JSON.stringify({ ok, message: ok ? "InnerTube reachable" : `HTTP ${res.status}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
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
      const videoId = body.videoId;
      if (!videoId) {
        return new Response(JSON.stringify({ error: "videoId required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const player = await getPlayerResponse(videoId);
      const pick = pickAudioFormat(player, body.quality ?? "high");
      return new Response(
        JSON.stringify({
          streamUrl: pick.streamUrl,
          mimeType: pick.mimeType,
          bitrate: pick.bitrate,
          sampleRate: pick.sampleRate,
          quality: body.quality ?? "high",
          videoId,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
    const results = await searchYouTubeMusic(title, artist);
    if (results.length === 0) {
      return new Response(
        JSON.stringify({ error: "no results", query: { title, artist } }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const ranked = results
      .map((r) => ({ r, s: scoreMatch({ title, artist }, r) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 4);

    const errors: string[] = [];
    for (const cand of ranked) {
      try {
        const player = await getPlayerResponse(cand.r.videoId);
        const pick = pickAudioFormat(player, body.quality ?? "high");
        return new Response(
          JSON.stringify({
            streamUrl: pick.streamUrl,
            mimeType: pick.mimeType,
            bitrate: pick.bitrate,
            sampleRate: pick.sampleRate,
            quality: body.quality ?? "high",
            videoId: cand.r.videoId,
            matched: {
              title: cand.r.title,
              artist: cand.r.artist,
              album: cand.r.album,
              duration: cand.r.duration,
              thumbnail: cand.r.thumbnail,
              score: cand.s,
            },
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      } catch (e) {
        errors.push(`${cand.r.videoId}: ${(e as Error).message}`);
      }
    }
    return new Response(
      JSON.stringify({
        error: "no playable candidate",
        details: errors,
        candidates: ranked.map((x) => x.r),
      }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[youtube-music] error", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
