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

// Use Firecrawl to scrape playlist page with JSON extraction
async function fetchPlaylistWithScraping(playlistId: string): Promise<PlaylistData | null> {
  const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
  
  if (!firecrawlKey) {
    console.log('No Firecrawl API key available');
    return null;
  }
  
  try {
    const url = `https://open.spotify.com/playlist/${playlistId}`;
    console.log('Scraping Spotify playlist:', url);
    
    // First, try to use Firecrawl's extract feature for structured data
    const extractResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${firecrawlKey}`,
      },
      body: JSON.stringify({
        url,
        formats: [
          'html',
          {
            type: 'json',
            prompt: `Extract the Spotify playlist information. Return a JSON object with:
- "playlistName": the name of the playlist (e.g., "Top 50 Italia")
- "playlistDescription": the playlist description if available
- "coverImageUrl": the URL of the playlist cover image
- "tracks": an array of tracks, where each track has:
  - "title": the song title (e.g., "Push It (feat. ANNA)")
  - "artist": the artist name(s) (e.g., "Kid Yugi")
  - "album": the album name if visible
  - "duration": the duration in format "M:SS" if visible

Make sure to extract the actual song titles, not artist names repeated. The format should be "Song Title - Artist Name".`
          }
        ],
        waitFor: 3000, // Wait for JS to render
      }),
    });
    
    if (!extractResponse.ok) {
      console.error('Firecrawl extract error:', extractResponse.status);
      const errorText = await extractResponse.text();
      console.error('Error details:', errorText);
    } else {
      const extractData = await extractResponse.json();
      console.log('Extract response:', JSON.stringify(extractData, null, 2));
      
      const jsonData = extractData.data?.json || extractData.json;
      
      if (jsonData && jsonData.playlistName && jsonData.tracks?.length > 0) {
        const tracks: SpotifyTrack[] = jsonData.tracks.map((track: any, index: number) => ({
          id: `spotify-${playlistId}-${index}`,
          title: track.title || 'Unknown Title',
          artist: track.artist || 'Unknown Artist',
          album: track.album || '',
          albumId: '',
          coverUrl: '',
          duration: parseDuration(track.duration),
        }));
        
        console.log(`Extracted ${tracks.length} tracks via JSON extraction`);
        
        return {
          name: jsonData.playlistName,
          description: jsonData.playlistDescription || '',
          coverUrl: jsonData.coverImageUrl || '',
          tracks,
        };
      }
    }
    
    // Fallback: use HTML scraping with og:tags and structured parsing
    console.log('Falling back to HTML scraping...');
    
    const htmlResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${firecrawlKey}`,
      },
      body: JSON.stringify({
        url,
        formats: ['html', 'markdown'],
        waitFor: 3000,
      }),
    });
    
    if (!htmlResponse.ok) {
      console.error('Firecrawl HTML error:', htmlResponse.status);
      return null;
    }
    
    const htmlData = await htmlResponse.json();
    const html = htmlData.data?.html || '';
    const markdown = htmlData.data?.markdown || '';
    
    // Extract playlist name from og:title (most reliable)
    let playlistName = 'Imported Playlist';
    const ogTitleMatch = html.match(/property="og:title"\s+content="([^"]+)"/i) ||
                         html.match(/content="([^"]+)"\s+property="og:title"/i);
    if (ogTitleMatch) {
      // Format: "Top 50 - Italia - playlist by Spotify | Spotify"
      playlistName = ogTitleMatch[1]
        .replace(/\s*\|\s*Spotify\s*$/i, '')
        .replace(/\s*-\s*playlist by.*$/i, '')
        .trim();
    } else {
      // Try title tag
      const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
      if (titleMatch) {
        playlistName = titleMatch[1]
          .replace(/\s*\|\s*Spotify\s*$/i, '')
          .replace(/\s*-\s*playlist by.*$/i, '')
          .trim();
      }
    }
    
    // Check if we got reCAPTCHA page
    if (playlistName.toLowerCase().includes('recaptcha') || 
        html.toLowerCase().includes('recaptcha') ||
        html.toLowerCase().includes('verify you are human')) {
      console.error('Got reCAPTCHA page, cannot scrape');
      return null;
    }
    
    // Extract cover image from og:image
    let coverUrl = '';
    const ogImageMatch = html.match(/property="og:image"\s+content="([^"]+)"/i) ||
                         html.match(/content="([^"]+)"\s+property="og:image"/i);
    if (ogImageMatch) {
      coverUrl = ogImageMatch[1];
    }
    
    // Parse tracks from markdown - look for proper song format
    const tracks: SpotifyTrack[] = [];
    const lines = markdown.split('\n');
    
    // Pattern 1: Look for lines with song titles followed by artist/album info
    // Spotify markdown often has: "Song Title" followed by "Artist Name" on next lines
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Skip empty lines and headers
      if (!line || line.startsWith('#') || line.startsWith('---')) continue;
      
      // Look for duration pattern (indicates end of track info) - e.g., "2:45" or "3:12"
      const durationMatch = line.match(/^(\d{1,2}:\d{2})$/);
      if (durationMatch && i >= 2) {
        // Go back to find title and artist
        let title = '';
        let artist = '';
        
        // Look back for the song title and artist
        for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
          const prevLine = lines[j].trim();
          if (!prevLine) continue;
          
          if (!artist && !prevLine.match(/^\d{1,2}:\d{2}$/) && !prevLine.match(/^\d+$/)) {
            if (!title) {
              // This might be album or artist, check if next non-empty is the title
              artist = prevLine;
            } else {
              artist = prevLine;
              break;
            }
          } else if (!title && !prevLine.match(/^\d{1,2}:\d{2}$/) && !prevLine.match(/^\d+$/)) {
            title = prevLine;
          }
        }
        
        // If we found both, the order might be reversed
        if (title && artist) {
          // Check if what we have as "artist" looks more like a title
          // Titles often have parentheses with features
          if (artist.includes('(feat.') || artist.includes('(ft.') || artist.includes('(with')) {
            [title, artist] = [artist, title];
          }
          
          tracks.push({
            id: `spotify-${playlistId}-${tracks.length}`,
            title,
            artist,
            album: '',
            albumId: '',
            coverUrl: '',
            duration: parseDuration(durationMatch[1]),
          });
        }
      }
    }
    
    // Pattern 2: If no tracks found, try looking for linked song titles
    if (tracks.length === 0) {
      // Look for patterns like: [Song Title](link) by Artist
      const linkPattern = /\[([^\]]+)\]\([^)]+\)(?:\s+[-–by]+\s+(.+))?/g;
      let match;
      while ((match = linkPattern.exec(markdown)) !== null) {
        const title = match[1].trim();
        const artist = match[2]?.trim() || 'Unknown Artist';
        
        // Skip navigation links and non-song items
        if (title.length < 100 && !title.includes('playlist') && !title.includes('Spotify')) {
          tracks.push({
            id: `spotify-${playlistId}-${tracks.length}`,
            title,
            artist,
            album: '',
            albumId: '',
            coverUrl: '',
            duration: 0,
          });
        }
      }
    }
    
    console.log(`Scraped ${tracks.length} tracks from playlist HTML`);
    console.log('Playlist name:', playlistName);
    console.log('Cover URL:', coverUrl);
    
    if (tracks.length === 0) {
      console.log('No tracks found, returning null');
      return null;
    }
    
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

// Helper function to parse duration string to seconds
function parseDuration(duration: string | undefined): number {
  if (!duration) return 0;
  const parts = duration.split(':');
  if (parts.length === 2) {
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
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