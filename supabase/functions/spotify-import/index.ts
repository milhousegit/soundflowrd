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

// Use Firecrawl to scrape playlist page
async function fetchPlaylistWithScraping(playlistId: string): Promise<PlaylistData | null> {
  const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
  
  if (!firecrawlKey) {
    console.log('No Firecrawl API key available');
    return null;
  }
  
  try {
    const url = `https://open.spotify.com/playlist/${playlistId}`;
    
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${firecrawlKey}`,
      },
      body: JSON.stringify({
        url,
        formats: ['markdown', 'html'],
      }),
    });
    
    if (!response.ok) {
      console.error('Firecrawl error:', response.status);
      return null;
    }
    
    const data = await response.json();
    const html = data.data?.html || '';
    const markdown = data.data?.markdown || '';
    
    // Extract playlist name from title or og:title
    let playlistName = 'Imported Playlist';
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i) || 
                       html.match(/og:title" content="([^"]+)"/i);
    if (titleMatch) {
      playlistName = titleMatch[1].replace(' | Spotify', '').replace(' - playlist by', ' by').trim();
    }
    
    // Extract cover image
    let coverUrl = '';
    const imageMatch = html.match(/og:image" content="([^"]+)"/i);
    if (imageMatch) {
      coverUrl = imageMatch[1];
    }
    
    // Parse tracks from the page - Spotify embeds track data in JSON-LD or structured data
    const tracks: SpotifyTrack[] = [];
    
    // Try to find track listings in the markdown
    const lines = markdown.split('\n');
    let position = 0;
    
    for (const line of lines) {
      // Look for patterns like "Song Title Artist Name" or numbered lists
      const trackMatch = line.match(/^\d+\.\s*(.+?)(?:\s+[-–]\s+(.+))?$/);
      if (trackMatch) {
        const title = trackMatch[1].trim();
        const artist = trackMatch[2]?.trim() || 'Unknown Artist';
        
        tracks.push({
          id: `imported-${position}`,
          title,
          artist,
          album: '',
          albumId: '',
          coverUrl: '',
          duration: 0,
        });
        position++;
      }
    }
    
    // If markdown parsing didn't work well, try regex on HTML
    if (tracks.length < 3) {
      // Look for track rows in the HTML
      const trackRegex = /data-testid="tracklist-row"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>[\s\S]*?<a[^>]*>([^<]+)<\/a>/gi;
      let match;
      position = 0;
      
      while ((match = trackRegex.exec(html)) !== null) {
        tracks.push({
          id: `imported-${position}`,
          title: match[1].trim(),
          artist: match[2].trim(),
          album: '',
          albumId: '',
          coverUrl: '',
          duration: 0,
        });
        position++;
      }
    }
    
    console.log(`Scraped ${tracks.length} tracks from playlist`);
    
    return {
      name: playlistName,
      description: '',
      coverUrl,
      tracks,
    };
  } catch (error) {
    console.error('Scraping error:', error);
    return null;
  }
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