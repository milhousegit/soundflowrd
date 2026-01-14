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
  
  try {
    // Try embed URL first - it has less protection
    const embedUrl = `https://open.spotify.com/embed/playlist/${playlistId}`;
    console.log('Trying Spotify embed URL:', embedUrl);
    
    const embedResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${firecrawlKey}`,
      },
      body: JSON.stringify({
        url: embedUrl,
        formats: ['html'],
        waitFor: 2000,
      }),
    });
    
    if (embedResponse.ok) {
      const embedData = await embedResponse.json();
      const embedHtml = embedData.data?.html || embedData.html || '';
      
      console.log('Embed HTML length:', embedHtml.length);
      
      // Look for __NEXT_DATA__ or similar JSON data embedded in the page
      const nextDataMatch = embedHtml.match(/<script id="__NEXT_DATA__"[^>]*>([^<]+)<\/script>/);
      if (nextDataMatch) {
        try {
          const nextData = JSON.parse(nextDataMatch[1]);
          console.log('Found __NEXT_DATA__');
          
          const playlist = nextData?.props?.pageProps?.state?.data?.entity;
          if (playlist) {
            const tracks: SpotifyTrack[] = (playlist.trackList || []).map((track: any, index: number) => ({
              id: `spotify-${playlistId}-${index}`,
              title: track.title || track.name || 'Unknown Title',
              artist: track.subtitle || track.artists?.map((a: any) => a.name).join(', ') || 'Unknown Artist',
              album: track.album?.name || '',
              albumId: track.album?.uri?.split(':').pop() || '',
              coverUrl: track.images?.[0]?.url || '',
              duration: Math.floor((track.duration || 0) / 1000),
            }));
            
            return {
              name: playlist.name || playlist.title || 'Imported Playlist',
              description: playlist.description || '',
              coverUrl: playlist.images?.[0]?.url || playlist.coverArt?.sources?.[0]?.url || '',
              tracks,
            };
          }
        } catch (e) {
          console.log('Failed to parse __NEXT_DATA__:', e);
        }
      }
      
      // Try to find resource data in script tags
      const resourceMatch = embedHtml.match(/Spotify\.Entity\s*=\s*(\{[\s\S]*?\});/);
      if (resourceMatch) {
        try {
          const entityData = JSON.parse(resourceMatch[1]);
          console.log('Found Spotify.Entity data');
          
          const tracks: SpotifyTrack[] = (entityData.tracks?.items || []).map((item: any, index: number) => {
            const track = item.track || item;
            return {
              id: `spotify-${playlistId}-${index}`,
              title: track.name || 'Unknown Title',
              artist: track.artists?.map((a: any) => a.name).join(', ') || 'Unknown Artist',
              album: track.album?.name || '',
              albumId: track.album?.id || '',
              coverUrl: track.album?.images?.[0]?.url || '',
              duration: Math.floor((track.duration_ms || 0) / 1000),
            };
          });
          
          return {
            name: entityData.name || 'Imported Playlist',
            description: entityData.description || '',
            coverUrl: entityData.images?.[0]?.url || '',
            tracks,
          };
        } catch (e) {
          console.log('Failed to parse Spotify.Entity:', e);
        }
      }
      
      // Parse from embed HTML structure
      const result = parseEmbedHtml(embedHtml, playlistId);
      if (result && result.tracks.length > 0) {
        return result;
      }
    }
    
    // Fallback: try the regular playlist page
    console.log('Trying regular playlist page...');
    const regularUrl = `https://open.spotify.com/playlist/${playlistId}`;
    
    const regularResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${firecrawlKey}`,
      },
      body: JSON.stringify({
        url: regularUrl,
        formats: ['html'],
        waitFor: 3000,
      }),
    });
    
    if (regularResponse.ok) {
      const regularData = await regularResponse.json();
      const html = regularData.data?.html || regularData.html || '';
      
      // Check for reCAPTCHA
      if (html.toLowerCase().includes('recaptcha') || 
          html.toLowerCase().includes('verify you are human') ||
          html.toLowerCase().includes('challenge')) {
        console.error('Got reCAPTCHA page');
        return null;
      }
      
      // Try to extract from meta tags at minimum
      let playlistName = 'Imported Playlist';
      let coverUrl = '';
      
      // Extract from og tags
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
      
      // Look for structured data in the page
      const ldJsonMatch = html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/);
      if (ldJsonMatch) {
        try {
          const ldData = JSON.parse(ldJsonMatch[1]);
          console.log('Found LD+JSON data');
          
          if (ldData.track) {
            const tracks: SpotifyTrack[] = ldData.track.map((track: any, index: number) => ({
              id: `spotify-${playlistId}-${index}`,
              title: track.name || 'Unknown Title',
              artist: track.byArtist?.name || 'Unknown Artist',
              album: track.inAlbum?.name || '',
              albumId: '',
              coverUrl: '',
              duration: parseDurationISO(track.duration),
            }));
            
            return {
              name: ldData.name || playlistName,
              description: ldData.description || '',
              coverUrl: ldData.image || coverUrl,
              tracks,
            };
          }
        } catch (e) {
          console.log('Failed to parse LD+JSON:', e);
        }
      }
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
  let playlistName = 'Imported Playlist';
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
  
  // Look for track data in various formats
  // Pattern 1: data-testid track rows
  const trackRowRegex = /data-testid="tracklist-row"[\s\S]*?aria-label="([^"]+)"/gi;
  let match;
  while ((match = trackRowRegex.exec(html)) !== null) {
    const ariaLabel = match[1];
    // Aria label format: "Song Name, Artist Name, Album Name"
    const parts = ariaLabel.split(',').map(s => s.trim());
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
  
  // Pattern 2: Look for track links with specific patterns
  if (tracks.length === 0) {
    const trackLinkRegex = /<a[^>]+href="\/track\/[^"]+">([^<]+)<\/a>/gi;
    const artistLinkRegex = /<a[^>]+href="\/artist\/[^"]+">([^<]+)<\/a>/gi;
    
    const trackNames: string[] = [];
    const artistNames: string[] = [];
    
    while ((match = trackLinkRegex.exec(html)) !== null) {
      trackNames.push(match[1].trim());
    }
    while ((match = artistLinkRegex.exec(html)) !== null) {
      artistNames.push(match[1].trim());
    }
    
    // Pair them up
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
  
  if (tracks.length === 0) {
    return null;
  }
  
  return {
    name: playlistName,
    description: '',
    coverUrl,
    tracks,
  };
}

// Helper function to parse duration string to seconds
function parseDuration(duration: string | undefined): number {
  if (!duration) return 0;
  const parts = duration.split(':');
  if (parts.length === 2) {
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  }
  return 0;
}

// Parse ISO 8601 duration (PT3M45S) to seconds
function parseDurationISO(duration: string | undefined): number {
  if (!duration) return 0;
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (match) {
    const hours = parseInt(match[1] || '0');
    const minutes = parseInt(match[2] || '0');
    const seconds = parseInt(match[3] || '0');
    return hours * 3600 + minutes * 60 + seconds;
  }
  return 0;
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