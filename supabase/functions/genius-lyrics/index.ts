import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GENIUS_API = 'https://api.genius.com';
const LYRICS_OVH_API = 'https://api.lyrics.ovh/v1';
const LRCLIB_API = 'https://lrclib.net/api';

// Words that indicate a translation page on Genius (should be excluded)
const TRANSLATION_KEYWORDS = [
  'traduzione', 'traducción', 'übersetzung', 'traduction', 'translation',
  'tradução', 'перевод', 'tłumaczenie', 'çeviri', 'traduceri',
  'traduzioni italiane', 'traduções', 'genius traduzioni'
];

// Clean up artist and title for better matching
function cleanForSearch(text: string): string {
  return text
    .split(/[,&]/)[0] // Take first artist if multiple
    .replace(/\s*\(.*?\)\s*/g, '') // Remove parentheses content
    .replace(/\s*\[.*?\]\s*/g, '') // Remove brackets content
    .replace(/\s*-\s*.*$/, '') // Remove everything after dash
    .replace(/\s+/g, ' ') // Normalize spaces
    .trim();
}

// Check if a Genius result is a translation page
function isTranslationPage(result: any): boolean {
  const title = (result.title || '').toLowerCase();
  const artist = (result.primary_artist?.name || '').toLowerCase();
  const fullTitle = (result.full_title || '').toLowerCase();
  
  for (const keyword of TRANSLATION_KEYWORDS) {
    if (title.includes(keyword) || artist.includes(keyword) || fullTitle.includes(keyword)) {
      console.log('Skipping translation page:', result.full_title);
      return true;
    }
  }
  return false;
}

// Try LRCLIB for synced lyrics (karaoke style)
async function getLyricsFromLRCLIB(artist: string, title: string): Promise<{ lyrics: string; syncedLyrics: string | null; } | null> {
  try {
    const cleanArtist = cleanForSearch(artist);
    const cleanTitle = cleanForSearch(title);
    
    console.log('Trying LRCLIB with:', cleanArtist, '-', cleanTitle);
    
    const url = `${LRCLIB_API}/get?artist_name=${encodeURIComponent(cleanArtist)}&track_name=${encodeURIComponent(cleanTitle)}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.log('LRCLIB returned:', response.status);
      return null;
    }
    
    const data = await response.json();
    
    if (data.syncedLyrics || data.plainLyrics) {
      return {
        lyrics: data.plainLyrics || data.syncedLyrics?.replace(/\[\d+:\d+\.\d+\]/g, '').trim(),
        syncedLyrics: data.syncedLyrics || null,
      };
    }
    
    return null;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.log('LRCLIB request timed out');
    } else {
      console.error('LRCLIB error:', error);
    }
    return null;
  }
}

// Try LRCLIB search as fallback (more flexible matching)
async function searchLRCLIB(artist: string, title: string): Promise<{ lyrics: string; syncedLyrics: string | null; } | null> {
  try {
    const cleanArtist = cleanForSearch(artist);
    const cleanTitle = cleanForSearch(title);
    const query = `${cleanArtist} ${cleanTitle}`;
    
    console.log('Searching LRCLIB with:', query);
    
    const url = `${LRCLIB_API}/search?q=${encodeURIComponent(query)}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.log('LRCLIB search returned:', response.status);
      return null;
    }
    
    const results = await response.json();
    
    if (Array.isArray(results) && results.length > 0) {
      // Find best match - prefer results with synced lyrics
      const withSync = results.find((r: any) => r.syncedLyrics);
      const best = withSync || results[0];
      
      if (best.syncedLyrics || best.plainLyrics) {
        console.log('Found match in LRCLIB search:', best.trackName, '-', best.artistName);
        return {
          lyrics: best.plainLyrics || best.syncedLyrics?.replace(/\[\d+:\d+\.\d+\]/g, '').trim(),
          syncedLyrics: best.syncedLyrics || null,
        };
      }
    }
    
    return null;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.log('LRCLIB search timed out');
    } else {
      console.error('LRCLIB search error:', error);
    }
    return null;
  }
}

// Try Lyrics.ovh as fallback
async function getLyricsFromLyricsOvh(artist: string, title: string): Promise<string | null> {
  try {
    const cleanArtist = cleanForSearch(artist);
    const cleanTitle = cleanForSearch(title);

    console.log('Trying Lyrics.ovh with:', cleanArtist, '-', cleanTitle);
    
    const url = `${LYRICS_OVH_API}/${encodeURIComponent(cleanArtist)}/${encodeURIComponent(cleanTitle)}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.log('Lyrics.ovh returned:', response.status);
      return null;
    }

    const data = await response.json();
    if (data.lyrics) {
      return data.lyrics.trim();
    }
    return null;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.log('Lyrics.ovh request timed out');
    } else {
      console.error('Lyrics.ovh error:', error);
    }
    return null;
  }
}

// Search Genius for song info (metadata only) - excludes translation pages
async function searchGeniusSong(query: string, accessToken: string): Promise<any | null> {
  try {
    const url = `${GENIUS_API}/search?q=${encodeURIComponent(query)}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error('Genius search error:', response.status);
      return null;
    }

    const data = await response.json();
    const hits = data.response?.hits || [];
    
    if (hits.length === 0) return null;
    
    // Filter out translation pages and find best match
    for (const hit of hits) {
      const result = hit.result;
      if (!isTranslationPage(result)) {
        console.log('Using Genius result:', result.full_title);
        return result;
      }
    }
    
    console.log('All Genius results were translation pages');
    return null;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.log('Genius search timed out');
    } else {
      console.error('Genius search error:', error);
    }
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

    console.log('Fetching lyrics for:', artist, '-', title);

    let lyrics: string | null = null;
    let syncedLyrics: string | null = null;

    // 1. Try LRCLIB first (has synced lyrics for karaoke)
    const lrclibResult = await getLyricsFromLRCLIB(artist, title);
    if (lrclibResult) {
      lyrics = lrclibResult.lyrics;
      syncedLyrics = lrclibResult.syncedLyrics;
      console.log('Got lyrics from LRCLIB', syncedLyrics ? '(with sync)' : '(plain only)');
    }
    
    // 2. Try LRCLIB search if direct lookup fails
    if (!lyrics) {
      const searchResult = await searchLRCLIB(artist, title);
      if (searchResult) {
        lyrics = searchResult.lyrics;
        syncedLyrics = searchResult.syncedLyrics;
        console.log('Got lyrics from LRCLIB search', syncedLyrics ? '(with sync)' : '(plain only)');
      }
    }
    
    // 3. Fallback to Lyrics.ovh if LRCLIB fails
    if (!lyrics) {
      lyrics = await getLyricsFromLyricsOvh(artist, title);
      if (lyrics) {
        console.log('Got lyrics from Lyrics.ovh');
      }
    }
    
    // 4. Try with original title if still no lyrics
    if (!lyrics) {
      console.log('Retrying with original title...');
      const cleanedTitle = title.split(/[(-]/)[0].trim();
      const lrclibRetry = await getLyricsFromLRCLIB(artist, cleanedTitle);
      if (lrclibRetry) {
        lyrics = lrclibRetry.lyrics;
        syncedLyrics = lrclibRetry.syncedLyrics;
      } else {
        lyrics = await getLyricsFromLyricsOvh(artist, cleanedTitle);
      }
    }

    // Get song info from Genius for metadata (optional, for link)
    const accessToken = Deno.env.get('GENIUS_ACCESS_TOKEN');
    let songInfo = null;
    
    if (accessToken) {
      const query = `${artist} ${title}`;
      const geniusSong = await searchGeniusSong(query, accessToken);
      if (geniusSong) {
        songInfo = {
          title: geniusSong.title,
          artist: geniusSong.primary_artist?.name,
          url: geniusSong.url,
          thumbnailUrl: geniusSong.song_art_image_thumbnail_url,
        };
      }
    }

    if (!lyrics) {
      return new Response(
        JSON.stringify({ 
          error: 'Lyrics not found',
          songInfo 
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        lyrics,
        syncedLyrics,
        songInfo: songInfo || { title, artist }
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
