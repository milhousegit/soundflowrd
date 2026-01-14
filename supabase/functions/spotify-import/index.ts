import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SpotifyTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  albumId: string;
  coverUrl: string;
  duration: number;
}

interface PlaylistData {
  name: string;
  description: string;
  coverUrl: string;
  tracks: SpotifyTrack[];
}

// Extract playlist ID from various Spotify URL formats
function extractPlaylistId(url: string): string | null {
  // Formats:
  // https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M
  // https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=...
  // spotify:playlist:37i9dQZF1DXcBWIGoYBM5M
  
  const patterns = [
    /spotify\.com\/playlist\/([a-zA-Z0-9]+)/,
    /spotify:playlist:([a-zA-Z0-9]+)/,
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  
  return null;
}

// Get Spotify access token using client credentials
async function getSpotifyToken(): Promise<string | null> {
  const clientId = Deno.env.get('SPOTIFY_CLIENT_ID');
  const clientSecret = Deno.env.get('SPOTIFY_CLIENT_SECRET');
  
  // If no credentials, use web scraping fallback
  if (!clientId || !clientSecret) {
    return null;
  }
  
  try {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      },
      body: 'grant_type=client_credentials',
    });
    
    const data = await response.json();
    return data.access_token || null;
  } catch {
    return null;
  }
}

// Fetch playlist using Spotify API
async function fetchPlaylistWithApi(playlistId: string, token: string): Promise<PlaylistData | null> {
  try {
    const response = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    
    const tracks: SpotifyTrack[] = data.tracks.items
      .filter((item: any) => item.track)
      .map((item: any) => ({
        id: item.track.id,
        title: item.track.name,
        artist: item.track.artists?.map((a: any) => a.name).join(', ') || 'Unknown',
        album: item.track.album?.name || '',
        albumId: item.track.album?.id || '',
        coverUrl: item.track.album?.images?.[0]?.url || '',
        duration: Math.floor((item.track.duration_ms || 0) / 1000),
      }));
    
    return {
      name: data.name || 'Playlist',
      description: data.description || '',
      coverUrl: data.images?.[0]?.url || '',
      tracks,
    };
  } catch (error) {
    console.error('Spotify API error:', error);
    return null;
  }
}

// Use Firecrawl to scrape playlist page - try embed URL first (less protection)
async function fetchPlaylistWithScraping(playlistId: string): Promise<PlaylistData | null> {
  const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');

  if (!firecrawlKey) {
    console.log('No Firecrawl API key available');
    return null;
  }

  const regularUrl = `https://open.spotify.com/playlist/${playlistId}`;
  const embedUrl = `https://open.spotify.com/embed/playlist/${playlistId}`;

  // Grab best-effort metadata first (often works even when tracks are blocked)
  let fallbackName = 'Imported Playlist';
  let fallbackCoverUrl = '';
  try {
    const oEmbedRes = await fetch(
      `https://open.spotify.com/oembed?url=${encodeURIComponent(regularUrl)}`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    if (oEmbedRes.ok) {
      const oEmbed = await oEmbedRes.json();
      if (typeof oEmbed?.title === 'string' && oEmbed.title.trim()) fallbackName = oEmbed.title.trim();
      if (typeof oEmbed?.thumbnail_url === 'string') fallbackCoverUrl = oEmbed.thumbnail_url;
    }
  } catch (e) {
    console.log('oEmbed metadata fetch failed:', e);
  }

  try {
    console.log('Trying Spotify embed URL:', embedUrl);

    // 1) Firecrawl scrape embed page + JSON extraction
    // IMPORTANT: Firecrawl v1 expects formats to be strings, and json extraction is configured via jsonOptions
    const embedResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${firecrawlKey}`,
      },
      body: JSON.stringify({
        url: embedUrl,
        formats: ['html', 'json'],
        onlyMainContent: false,
        waitFor: 2500,
        jsonOptions: {
          // Keep the prompt small & strict, Firecrawl will do the extraction
          prompt: `Extract Spotify playlist data from this page.
Return JSON:
{
  "playlistName": string,
  "coverImageUrl": string,
  "tracks": [{"title": string, "artist": string}]
}
Tracks must be actual song titles (e.g. "Push It (feat. ANNA)") and artists (e.g. "Kid Yugi").`,
        },
      }),
    });

    if (embedResponse.ok) {
      const embedData = await embedResponse.json();
      const embedHtml = embedData.data?.html || embedData.html || '';
      const jsonData = embedData.data?.json || embedData.json;

      if (jsonData && Array.isArray(jsonData.tracks) && jsonData.tracks.length > 0) {
        const tracks: SpotifyTrack[] = jsonData.tracks.map((t: any, index: number) => ({
          id: `spotify-${playlistId}-${index}`,
          title: String(t?.title || '').trim() || 'Unknown Title',
          artist: String(t?.artist || '').trim() || 'Unknown Artist',
          album: '',
          albumId: '',
          coverUrl: '',
          duration: 0,
        }));

        return {
          name: (String(jsonData.playlistName || '').trim() || fallbackName),
          description: '',
          coverUrl: (String(jsonData.coverImageUrl || '').trim() || fallbackCoverUrl),
          tracks,
        };
      }

      // If JSON extraction didn’t return tracks, try parsing the embed HTML
      const parsed = parseEmbedHtml(embedHtml, playlistId);
      if (parsed && parsed.tracks.length > 0) {
        return {
          ...parsed,
          name: parsed.name || fallbackName,
          coverUrl: parsed.coverUrl || fallbackCoverUrl,
        };
      }
    } else {
      const errorText = await embedResponse.text();
      console.error('Firecrawl embed scrape error:', embedResponse.status, errorText);
    }

    // 2) Fallback: try the regular playlist page (may be blocked by reCAPTCHA)
    console.log('Trying regular playlist page...');

    const regularResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${firecrawlKey}`,
      },
      body: JSON.stringify({
        url: regularUrl,
        formats: ['html', 'json'],
        onlyMainContent: false,
        waitFor: 3500,
        jsonOptions: {
          prompt: `Extract Spotify playlist data from this page.
Return JSON:
{
  "playlistName": string,
  "coverImageUrl": string,
  "tracks": [{"title": string, "artist": string}]
}
Tracks must be song titles and artists.`
        },
      }),
    });

    if (regularResponse.ok) {
      const regularData = await regularResponse.json();
      const html = regularData.data?.html || regularData.html || '';
      const jsonData = regularData.data?.json || regularData.json;

      if (
        html.toLowerCase().includes('recaptcha') ||
        html.toLowerCase().includes('verify you are human') ||
        html.toLowerCase().includes('challenge')
      ) {
        console.error('Got reCAPTCHA page');
        return null;
      }

      if (jsonData && Array.isArray(jsonData.tracks) && jsonData.tracks.length > 0) {
        const tracks: SpotifyTrack[] = jsonData.tracks.map((t: any, index: number) => ({
          id: `spotify-${playlistId}-${index}`,
          title: String(t?.title || '').trim() || 'Unknown Title',
          artist: String(t?.artist || '').trim() || 'Unknown Artist',
          album: '',
          albumId: '',
          coverUrl: '',
          duration: 0,
        }));

        return {
          name: (String(jsonData.playlistName || '').trim() || fallbackName),
          description: '',
          coverUrl: (String(jsonData.coverImageUrl || '').trim() || fallbackCoverUrl),
          tracks,
        };
      }

      // Last-resort: pull name + cover from og tags and accept empty tracklist
      let playlistName = fallbackName;
      let coverUrl = fallbackCoverUrl;

      const ogTitleMatch = html.match(/property="og:title"\s+content="([^"]+)"/i) ||
        html.match(/content="([^"]+)"\s+property="og:title"/i);
      if (ogTitleMatch) {
        playlistName = ogTitleMatch[1]
          .replace(/\s*\|\s*Spotify\s*$/i, '')
          .replace(/\s*-\s*playlist by.*$/i, '')
          .replace(/\s*on Spotify.*$/i, '')
          .trim();
      }

      const ogImageMatch = html.match(/property="og:image"\s+content="([^"]+)"/i) ||
        html.match(/content="([^"]+)"\s+property="og:image"/i);
      if (ogImageMatch) {
        coverUrl = ogImageMatch[1];
      }

      // If we got metadata but no tracks, still treat as failure (UI expects tracks)
      console.log('Metadata extracted but no tracks found:', { playlistName, coverUrl });
      return null;
    } else {
      const errorText = await regularResponse.text();
      console.error('Firecrawl regular scrape error:', regularResponse.status, errorText);
    }

    console.log('Could not extract playlist data from any source');
    return null;
  } catch (error) {
    console.error('Scraping error:', error);
    return null;
  }
}

// Parse HTML from Spotify embed page
function parseEmbedHtml(html: string, playlistId: string): PlaylistData | null {
  const tracks: SpotifyTrack[] = [];

  // Extract playlist name from title
  let playlistName = '';
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch) {
    playlistName = titleMatch[1]
      .replace(/\s*\|\s*Spotify.*$/i, '')
      .replace(/\s*-\s*Spotify.*$/i, '')
      .trim();
  }

  // Extract cover from og:image
  let coverUrl = '';
  const ogImageMatch = html.match(/property="og:image"\s+content="([^"]+)"/i) ||
    html.match(/content="([^"]+)"\s+property="og:image"/i);
  if (ogImageMatch) {
    coverUrl = ogImageMatch[1];
  }

  // data-testid track rows (best effort)
  const trackRowRegex = /data-testid="tracklist-row"[\s\S]*?aria-label="([^"]+)"/gi;
  let match;
  while ((match = trackRowRegex.exec(html)) !== null) {
    const ariaLabel = match[1];
    const parts = ariaLabel.split(',').map((s) => s.trim());
    if (parts.length >= 2) {
      tracks.push({
        id: `spotify-${playlistId}-${tracks.length}`,
        title: parts[0],
        artist: parts[1],
        album: parts[2] || '',
        albumId: '',
        coverUrl: '',
        duration: 0,
      });
    }
  }

  // Fallback pairing track/artist links
  if (tracks.length === 0) {
    const trackLinkRegex = /<a[^>]+href="\/track\/[^\"]+"[^>]*>([^<]+)<\/a>/gi;
    const artistLinkRegex = /<a[^>]+href="\/artist\/[^\"]+"[^>]*>([^<]+)<\/a>/gi;

    const trackNames: string[] = [];
    const artistNames: string[] = [];

    while ((match = trackLinkRegex.exec(html)) !== null) trackNames.push(match[1].trim());
    while ((match = artistLinkRegex.exec(html)) !== null) artistNames.push(match[1].trim());

    for (let i = 0; i < trackNames.length; i++) {
      tracks.push({
        id: `spotify-${playlistId}-${i}`,
        title: trackNames[i],
        artist: artistNames[i] || 'Unknown Artist',
        album: '',
        albumId: '',
        coverUrl: '',
        duration: 0,
      });
    }
  }

  console.log(`Parsed ${tracks.length} tracks from embed HTML`);

  if (tracks.length === 0) return null;

  return {
    name: playlistName || 'Imported Playlist',
    description: '',
    coverUrl,
    tracks,
  };
}

// Helper function to parse duration string to seconds
function parseDuration(duration: string | undefined): number {
  if (!duration) return 0;
  const parts = duration.split(':');
  if (parts.length === 2) return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  return 0;
}

// Parse ISO 8601 duration (PT3M45S) to seconds
function parseDurationISO(duration: string | undefined): number {
  if (!duration) return 0;
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || '0');
  const minutes = parseInt(match[2] || '0');
  const seconds = parseInt(match[3] || '0');
  return hours * 3600 + minutes * 60 + seconds;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();
    
    if (!url) {
      return new Response(
        JSON.stringify({ error: 'URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const playlistId = extractPlaylistId(url);
    
    if (!playlistId) {
      return new Response(
        JSON.stringify({ error: 'Invalid Spotify playlist URL' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('Fetching playlist:', playlistId);
    
    // Try Spotify API first
    const token = await getSpotifyToken();
    let playlistData: PlaylistData | null = null;
    
    if (token) {
      console.log('Using Spotify API');
      playlistData = await fetchPlaylistWithApi(playlistId, token);
    }
    
    // Fallback to scraping
    if (!playlistData) {
      console.log('Falling back to scraping');
      playlistData = await fetchPlaylistWithScraping(playlistId);
    }
    
    if (!playlistData) {
      return new Response(
        JSON.stringify({ error: 'Could not fetch playlist data' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    return new Response(
      JSON.stringify(playlistData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to process request' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});