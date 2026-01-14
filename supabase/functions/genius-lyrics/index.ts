import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GENIUS_API = 'https://api.genius.com';

async function searchSong(query: string, accessToken: string): Promise<any | null> {
  const url = `${GENIUS_API}/search?q=${encodeURIComponent(query)}`;
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    console.error('Genius search error:', response.status);
    return null;
  }

  const data = await response.json();
  const hits = data.response?.hits || [];
  
  if (hits.length === 0) return null;
  
  // Return the first song result
  return hits[0].result;
}

async function getSongDetails(songId: number, accessToken: string): Promise<any | null> {
  const url = `${GENIUS_API}/songs/${songId}`;
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    console.error('Genius song details error:', response.status);
    return null;
  }

  const data = await response.json();
  return data.response?.song || null;
}

async function scrapeLyrics(geniusUrl: string): Promise<string | null> {
  try {
    const response = await fetch(geniusUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) {
      console.error('Genius page fetch error:', response.status);
      return null;
    }

    const html = await response.text();
    
    // Try to extract lyrics from the page
    // Genius uses data-lyrics-container attribute for lyrics
    const lyricsMatch = html.match(/data-lyrics-container="true"[^>]*>([\s\S]*?)<\/div>/gi);
    
    if (lyricsMatch && lyricsMatch.length > 0) {
      let lyrics = lyricsMatch
        .map(match => {
          // Extract content between > and </div>
          const content = match.replace(/data-lyrics-container="true"[^>]*>/, '').replace(/<\/div>$/, '');
          return content;
        })
        .join('\n');

      // Clean up HTML tags but preserve line breaks
      lyrics = lyrics
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/\n\s*\n\s*\n/g, '\n\n')
        .trim();

      return lyrics;
    }

    // Fallback: try to find lyrics in script tags (JSON)
    const scriptMatch = html.match(/"lyrics":\s*\{[^}]*"plain":\s*"([^"]+)"/);
    if (scriptMatch) {
      return scriptMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
    }

    return null;
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
    const { artist, title } = await req.json();

    if (!artist || !title) {
      return new Response(
        JSON.stringify({ error: 'Artist and title are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const accessToken = Deno.env.get('GENIUS_ACCESS_TOKEN');
    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: 'Genius API not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Search for the song
    const query = `${artist} ${title}`;
    console.log('Searching for:', query);
    
    const song = await searchSong(query, accessToken);
    
    if (!song) {
      return new Response(
        JSON.stringify({ error: 'Song not found', lyrics: null }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Found song:', song.full_title, 'URL:', song.url);

    // Scrape lyrics from the Genius page
    const lyrics = await scrapeLyrics(song.url);

    if (!lyrics) {
      return new Response(
        JSON.stringify({ 
          error: 'Lyrics not available',
          songInfo: {
            title: song.title,
            artist: song.primary_artist?.name,
            url: song.url,
          }
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        lyrics,
        songInfo: {
          title: song.title,
          artist: song.primary_artist?.name,
          url: song.url,
          thumbnailUrl: song.song_art_image_thumbnail_url,
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in genius-lyrics function:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
