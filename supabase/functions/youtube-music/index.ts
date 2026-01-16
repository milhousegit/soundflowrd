import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// YouTube Music API context - required for all requests
const YTMUSIC_CONTEXT = {
  context: {
    client: {
      clientName: "WEB_REMIX",
      clientVersion: "1.20231204.01.00",
      hl: "it",
      gl: "IT",
    },
  },
};

const YTMUSIC_API_URL = "https://music.youtube.com/youtubei/v1";

interface YTMusicPlaylist {
  id: string;
  title: string;
  description?: string;
  coverUrl?: string;
  trackCount: number;
  creator?: string;
  source: "youtube";
}

interface YTMusicTrack {
  id: string;
  title: string;
  artist: string;
  artistId?: string;
  album: string;
  albumId?: string;
  duration: number;
  coverUrl?: string;
}

// Helper to extract thumbnail URL
function getThumbnail(thumbnails: any[]): string | undefined {
  if (!thumbnails || thumbnails.length === 0) return undefined;
  // Prefer larger thumbnails
  const sorted = [...thumbnails].sort(
    (a, b) => (b.width || 0) - (a.width || 0)
  );
  return sorted[0]?.url;
}

// Helper to parse duration string "3:45" to seconds
function parseDuration(durationStr: string): number {
  if (!durationStr) return 0;
  const parts = durationStr.split(":").map(Number);
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 0;
}

// Extract text from YouTube Music renderer
function getText(obj: any): string {
  if (!obj) return "";
  if (typeof obj === "string") return obj;
  if (obj.runs) return obj.runs.map((r: any) => r.text).join("");
  if (obj.text) return obj.text;
  return "";
}

// Search playlists on YouTube Music
async function searchPlaylists(query: string): Promise<YTMusicPlaylist[]> {
  try {
    const response = await fetch(`${YTMUSIC_API_URL}/search?key=AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Origin: "https://music.youtube.com",
        Referer: "https://music.youtube.com/",
      },
      body: JSON.stringify({
        ...YTMUSIC_CONTEXT,
        query,
        params: "EgWKAQIoAWoKEAMQBBAJEAoQBQ%3D%3D", // Filter for playlists
      }),
    });

    if (!response.ok) {
      console.error("YouTube Music search failed:", response.status);
      return [];
    }

    const data = await response.json();
    const playlists: YTMusicPlaylist[] = [];

    // Navigate the response structure
    const contents =
      data?.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer
        ?.content?.sectionListRenderer?.contents || [];

    for (const section of contents) {
      const items =
        section?.musicShelfRenderer?.contents ||
        section?.musicCardShelfRenderer?.contents ||
        [];

      for (const item of items) {
        const renderer =
          item?.musicResponsiveListItemRenderer ||
          item?.musicTwoRowItemRenderer;
        if (!renderer) continue;

        // Check if this is a playlist
        const navigationEndpoint =
          renderer?.navigationEndpoint ||
          renderer?.overlay?.musicItemThumbnailOverlayRenderer
            ?.content?.musicPlayButtonRenderer?.playNavigationEndpoint;

        const playlistId =
          navigationEndpoint?.browseEndpoint?.browseId ||
          navigationEndpoint?.watchEndpoint?.playlistId;

        if (!playlistId || !playlistId.startsWith("VL") && !playlistId.startsWith("PL") && !playlistId.startsWith("RDCL")) {
          // Also check for playlist in flexColumns
          const browseId = renderer?.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer
            ?.text?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId;
          if (browseId && (browseId.startsWith("VL") || browseId.startsWith("PL"))) {
            // This is a playlist
          } else {
            continue;
          }
        }

        // Extract playlist info
        let title = "";
        let creator = "";
        let trackCount = 0;

        if (renderer.flexColumns) {
          title = getText(
            renderer.flexColumns[0]?.musicResponsiveListItemFlexColumnRenderer?.text
          );
          const subtitleText = getText(
            renderer.flexColumns[1]?.musicResponsiveListItemFlexColumnRenderer?.text
          );
          // Parse subtitle like "Playlist • Creator • 50 songs"
          const parts = subtitleText.split("•").map((p: string) => p.trim());
          creator = parts[1] || "";
          const countMatch = subtitleText.match(/(\d+)\s*(bran|song|track)/i);
          if (countMatch) trackCount = parseInt(countMatch[1]);
        } else if (renderer.title) {
          title = getText(renderer.title);
          const subtitleText = getText(renderer.subtitle);
          const parts = subtitleText.split("•").map((p: string) => p.trim());
          creator = parts[0] || "";
          const countMatch = subtitleText.match(/(\d+)\s*(bran|song|track)/i);
          if (countMatch) trackCount = parseInt(countMatch[1]);
        }

        const thumbnails =
          renderer.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ||
          renderer.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails ||
          [];

        // Normalize playlist ID (remove VL prefix for consistency)
        const normalizedId = playlistId.startsWith("VL")
          ? playlistId.slice(2)
          : playlistId;

        if (title) {
          playlists.push({
            id: normalizedId,
            title,
            creator,
            trackCount,
            coverUrl: getThumbnail(thumbnails),
            source: "youtube",
          });
        }
      }
    }

    return playlists;
  } catch (error) {
    console.error("YouTube Music search error:", error);
    return [];
  }
}

// Get artist-related playlists (100% Artist, This is Artist, etc.)
async function getArtistPlaylists(
  artistName: string
): Promise<YTMusicPlaylist[]> {
  // Search for artist-specific playlists
  const queries = [
    `"100% ${artistName}"`,
    `"This is ${artistName}"`,
    `"${artistName}" playlist`,
    `"${artistName}" mix`,
  ];

  const allPlaylists: YTMusicPlaylist[] = [];
  const seenIds = new Set<string>();

  for (const query of queries) {
    try {
      const playlists = await searchPlaylists(query);
      for (const p of playlists) {
        // Filter to only include playlists that mention the artist
        const titleLower = p.title.toLowerCase();
        const artistLower = artistName.toLowerCase();
        if (
          titleLower.includes(artistLower) ||
          titleLower.includes("100%") ||
          titleLower.includes("this is") ||
          titleLower.includes("best of") ||
          titleLower.includes("top") ||
          titleLower.includes("mix")
        ) {
          if (!seenIds.has(p.id)) {
            seenIds.add(p.id);
            allPlaylists.push(p);
          }
        }
      }
    } catch (e) {
      console.error(`Failed to search for "${query}":`, e);
    }
  }

  return allPlaylists.slice(0, 10);
}

// Get playlist details and tracks
async function getPlaylist(
  playlistId: string
): Promise<{ playlist: YTMusicPlaylist; tracks: YTMusicTrack[] } | null> {
  try {
    // Add VL prefix if not present (YouTube Music internal format)
    const browseId = playlistId.startsWith("VL")
      ? playlistId
      : `VL${playlistId}`;

    const response = await fetch(`${YTMUSIC_API_URL}/browse?key=AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Origin: "https://music.youtube.com",
        Referer: "https://music.youtube.com/",
      },
      body: JSON.stringify({
        ...YTMUSIC_CONTEXT,
        browseId,
      }),
    });

    if (!response.ok) {
      console.error("YouTube Music browse failed:", response.status);
      return null;
    }

    const data = await response.json();

    // Extract playlist header info
    const header =
      data?.header?.musicDetailHeaderRenderer ||
      data?.header?.musicEditablePlaylistDetailHeaderRenderer?.header
        ?.musicDetailHeaderRenderer ||
      data?.header?.musicImmersiveHeaderRenderer;

    if (!header) {
      console.error("No header found in playlist response");
      return null;
    }

    const title = getText(header.title);
    const description = getText(header.description);
    const thumbnails =
      header.thumbnail?.croppedSquareThumbnailRenderer?.thumbnail?.thumbnails ||
      header.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ||
      [];

    // Extract track count and creator from subtitle
    const subtitleText = getText(header.subtitle);
    const subtitleSecondaryText = getText(header.secondSubtitle);
    let trackCount = 0;
    let creator = "";

    const countMatch = (subtitleText + " " + subtitleSecondaryText).match(
      /(\d+)\s*(bran|song|track)/i
    );
    if (countMatch) trackCount = parseInt(countMatch[1]);

    // Creator is usually in subtitle
    const subtitleRuns = header.subtitle?.runs || [];
    for (const run of subtitleRuns) {
      if (run.navigationEndpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs) {
        creator = run.text;
        break;
      }
    }
    if (!creator && subtitleRuns.length > 0) {
      creator = subtitleRuns[0]?.text || "";
    }

    // Extract tracks
    const tracks: YTMusicTrack[] = [];
    const contents =
      data?.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer
        ?.content?.sectionListRenderer?.contents || [];

    for (const section of contents) {
      const items =
        section?.musicShelfRenderer?.contents ||
        section?.musicPlaylistShelfRenderer?.contents ||
        [];

      for (const item of items) {
        const renderer = item?.musicResponsiveListItemRenderer;
        if (!renderer) continue;

        // Extract video ID
        const videoId =
          renderer.playlistItemData?.videoId ||
          renderer.overlay?.musicItemThumbnailOverlayRenderer?.content
            ?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint
            ?.videoId;

        if (!videoId) continue;

        // Extract track info from flexColumns
        const flexColumns = renderer.flexColumns || [];
        let trackTitle = "";
        let artist = "";
        let artistId = "";
        let album = "";
        let albumId = "";

        if (flexColumns[0]) {
          trackTitle = getText(
            flexColumns[0].musicResponsiveListItemFlexColumnRenderer?.text
          );
        }

        if (flexColumns[1]) {
          const runs =
            flexColumns[1].musicResponsiveListItemFlexColumnRenderer?.text
              ?.runs || [];
          for (const run of runs) {
            const pageType =
              run.navigationEndpoint?.browseEndpoint
                ?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig
                ?.pageType;

            if (pageType === "MUSIC_PAGE_TYPE_ARTIST") {
              artist = run.text;
              artistId = run.navigationEndpoint?.browseEndpoint?.browseId || "";
            } else if (pageType === "MUSIC_PAGE_TYPE_ALBUM") {
              album = run.text;
              albumId = run.navigationEndpoint?.browseEndpoint?.browseId || "";
            }
          }
          // Fallback: use first text as artist
          if (!artist && runs.length > 0) {
            artist = runs[0]?.text || "";
          }
        }

        // Extract duration
        let duration = 0;
        const fixedColumns = renderer.fixedColumns || [];
        if (fixedColumns[0]) {
          const durationText = getText(
            fixedColumns[0].musicResponsiveListItemFixedColumnRenderer?.text
          );
          duration = parseDuration(durationText);
        }

        // Extract thumbnail
        const trackThumbnails =
          renderer.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ||
          [];

        if (trackTitle) {
          tracks.push({
            id: videoId,
            title: trackTitle,
            artist,
            artistId,
            album,
            albumId,
            duration,
            coverUrl: getThumbnail(trackThumbnails),
          });
        }
      }
    }

    return {
      playlist: {
        id: playlistId,
        title,
        description,
        coverUrl: getThumbnail(thumbnails),
        trackCount: trackCount || tracks.length,
        creator,
        source: "youtube",
      },
      tracks,
    };
  } catch (error) {
    console.error("YouTube Music get playlist error:", error);
    return null;
  }
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, query, artistName, playlistId } = await req.json();

    console.log(`YouTube Music action: ${action}`);

    let result;

    switch (action) {
      case "search-playlists":
        if (!query) {
          throw new Error("Query is required for search-playlists");
        }
        result = await searchPlaylists(query);
        break;

      case "get-artist-playlists":
        if (!artistName) {
          throw new Error("artistName is required for get-artist-playlists");
        }
        result = await getArtistPlaylists(artistName);
        break;

      case "get-playlist":
        if (!playlistId) {
          throw new Error("playlistId is required for get-playlist");
        }
        result = await getPlaylist(playlistId);
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("YouTube Music function error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
