import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SpotifyPlaylist {
  id: string;
  name: string;
  description: string;
  coverUrl: string;
  trackCount: number;
  owner: string;
}

// Get anonymous access token from Spotify
async function getAnonymousToken(): Promise<string | null> {
  try {
    const tokenResponse = await fetch('https://open.spotify.com/get_access_token?reason=transport&productType=web_player', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://open.spotify.com/',
        'Origin': 'https://open.spotify.com',
      },
    });
    
    if (tokenResponse.ok) {
      const data = await tokenResponse.json();
      if (data.accessToken) {
        return data.accessToken;
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error getting anonymous token:', error);
    return null;
  }
}

// Search playlists using Spotify's internal API
async function searchPlaylists(query: string, token: string, limit: number = 10): Promise<SpotifyPlaylist[]> {
  try {
    const response = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=playlist&limit=${limit}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
        },
      }
    );
    
    if (!response.ok) {
      console.log(`Spotify search returned ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    const playlists = data.playlists?.items || [];
    
    return playlists
      .filter((p: any) => p && p.id)
      .map((p: any) => ({
        id: p.id,
        name: p.name || 'Unknown Playlist',
        description: p.description || '',
        coverUrl: p.images?.[0]?.url || '',
        trackCount: p.tracks?.total || 0,
        owner: p.owner?.display_name || 'Spotify',
      }));
  } catch (error) {
    console.error('Spotify playlist search error:', error);
    return [];
  }
}

// Search artist playlists (100% Artist, This is Artist, etc.)
async function searchArtistPlaylists(artistName: string, token: string): Promise<SpotifyPlaylist[]> {
  const searchQueries = [
    `This Is ${artistName}`,
    `100% ${artistName}`,
    `${artistName} Radio`,
    `${artistName} Mix`,
    `Best of ${artistName}`,
  ];
  
  const allPlaylists: SpotifyPlaylist[] = [];
  const seenIds = new Set<string>();
  
  for (const query of searchQueries) {
    try {
      const playlists = await searchPlaylists(query, token, 3);
      
      for (const playlist of playlists) {
        // Only include if it's by Spotify or contains the artist name
        const isRelevant = 
          playlist.owner.toLowerCase() === 'spotify' ||
          playlist.name.toLowerCase().includes(artistName.toLowerCase());
        
        if (isRelevant && !seenIds.has(playlist.id)) {
          seenIds.add(playlist.id);
          allPlaylists.push(playlist);
        }
      }
      
      // Small delay between requests
      await new Promise(r => setTimeout(r, 100));
    } catch (e) {
      console.error(`Error searching "${query}":`, e);
    }
  }
  
  return allPlaylists.slice(0, 10);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, query, artistName, limit } = await req.json();
    
    // Get anonymous token
    const token = await getAnonymousToken();
    
    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Could not get Spotify token', playlists: [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    let playlists: SpotifyPlaylist[] = [];
    
    if (action === 'search' && query) {
      console.log(`Searching Spotify playlists: "${query}"`);
      playlists = await searchPlaylists(query, token, limit || 10);
      console.log(`Found ${playlists.length} Spotify playlists`);
    } else if (action === 'artistPlaylists' && artistName) {
      console.log(`Searching Spotify playlists for artist: "${artistName}"`);
      playlists = await searchArtistPlaylists(artistName, token);
      console.log(`Found ${playlists.length} Spotify artist playlists`);
    } else {
      return new Response(
        JSON.stringify({ error: 'Invalid action or missing parameters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    return new Response(
      JSON.stringify({ playlists }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to process request', playlists: [] }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
