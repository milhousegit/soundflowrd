import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEEZER_API = 'https://api.deezer.com';

interface SpotifyTrack {
  id: string;
  title: string;
  artist: string;
  artistId: string;
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
        artistId: String(item.track.artists?.[0]?.id || ''),
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
        const tracks: SpotifyTrack[] = jsonData.tracks.map((t: any, index: number) => {
          const rawArtist = String(t?.artist || '').trim() || 'Unknown Artist';
          return {
            id: `spotify-${playlistId}-${index}`,
            title: String(t?.title || '').trim() || 'Unknown Title',
            artist: cleanScrapedArtist(rawArtist),
            artistId: '',
            album: '',
            albumId: '',
            coverUrl: '',
            duration: 0,
          };
        });

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
        const tracks: SpotifyTrack[] = jsonData.tracks.map((t: any, index: number) => {
          const rawArtist = String(t?.artist || '').trim() || 'Unknown Artist';
          return {
            id: `spotify-${playlistId}-${index}`,
            title: String(t?.title || '').trim() || 'Unknown Title',
            artist: cleanScrapedArtist(rawArtist),
            artistId: '',
            album: '',
            albumId: '',
            coverUrl: '',
            duration: 0,
          };
        });

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

      // Use enhanced cover extraction
      coverUrl = extractCoverUrl(html) || fallbackCoverUrl;

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

// Extract cover image URL from HTML - looks for charts-images.scdn.co, mosaic.scdn.co, or i.scdn.co patterns
function extractCoverUrl(html: string): string {
  // Priority 1: charts-images.scdn.co (official playlist covers like Top 50)
  const chartsImageMatch = html.match(/https?:\/\/charts-images\.scdn\.co\/[^"'\s<>]+/i);
  if (chartsImageMatch) {
    console.log('Found charts-images cover:', chartsImageMatch[0]);
    return chartsImageMatch[0];
  }

  // Priority 2: mosaic.scdn.co (dynamic mosaic covers)
  const mosaicMatch = html.match(/https?:\/\/mosaic\.scdn\.co\/[^"'\s<>]+/i);
  if (mosaicMatch) {
    console.log('Found mosaic cover:', mosaicMatch[0]);
    return mosaicMatch[0];
  }

  // Priority 3: i.scdn.co/image (standard album/playlist images)
  const iScdnMatch = html.match(/https?:\/\/i\.scdn\.co\/image\/[a-zA-Z0-9]+/i);
  if (iScdnMatch) {
    console.log('Found i.scdn.co cover:', iScdnMatch[0]);
    return iScdnMatch[0];
  }

  // Priority 4: og:image meta tag
  const ogImageMatch = html.match(/property="og:image"\s+content="([^"]+)"/i) ||
    html.match(/content="([^"]+)"\s+property="og:image"/i);
  if (ogImageMatch) {
    console.log('Found og:image cover:', ogImageMatch[1]);
    return ogImageMatch[1];
  }

  // Priority 5: any image.scdn.co URL
  const imageScdnMatch = html.match(/https?:\/\/[a-z-]+\.scdn\.co\/[^"'\s<>]+\.(jpg|jpeg|png|webp)/i);
  if (imageScdnMatch) {
    console.log('Found scdn.co image:', imageScdnMatch[0]);
    return imageScdnMatch[0];
  }

  return '';
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

  // Extract cover using enhanced function
  const coverUrl = extractCoverUrl(html);

  // data-testid track rows (best effort)
  const trackRowRegex = /data-testid="tracklist-row"[\s\S]*?aria-label="([^"]+)"/gi;
  let match;
  while ((match = trackRowRegex.exec(html)) !== null) {
    const ariaLabel = match[1];
    const parts = ariaLabel.split(',').map((s) => s.trim());
    if (parts.length >= 2) {
      const rawArtist = parts[1];
      tracks.push({
        id: `spotify-${playlistId}-${tracks.length}`,
        title: parts[0],
        artist: cleanScrapedArtist(rawArtist),
        artistId: '',
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
      const rawArtist = artistNames[i] || 'Unknown Artist';
      tracks.push({
        id: `spotify-${playlistId}-${i}`,
        title: trackNames[i],
        artist: cleanScrapedArtist(rawArtist),
        artistId: '',
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

// Clean artist name from Spotify "E" (Explicit) badge that gets scraped
function cleanScrapedArtist(artist: string): string {
  // The "E" explicit badge is often scraped as prefix before artist name
  // Check if starts with "E" followed by an uppercase letter (not EE, not lowercase)
  if (artist.length > 1 && artist.startsWith('E') && /[A-Z]/.test(artist[1]) && artist[1] !== 'E') {
    return artist.substring(1);
  }
  return artist;
}

// Normalize string for comparison (remove accents, lowercase, trim)
function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, '')
    .trim();
}

// Clean title by removing parentheses content (feat., with, etc.)
function cleanTitle(title: string): string {
  // Remove content in parentheses like "(feat. ANNA)" or "(with Someone)"
  return title.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
}

// Get artist search variations - use only first artist (split by comma only), with E prefix removal fallback
function getArtistSearchVariations(artist: string): string[] {
  // ONLY comma separates artists - "/" and spaces are part of artist name
  const firstArtist = artist.split(',')[0].trim();
  
  const variations = [firstArtist];
  
  // If artist starts with "E" followed by uppercase letter (not another E), try without the E
  if (firstArtist.length > 1 && firstArtist.startsWith('E') && firstArtist[1] === firstArtist[1].toUpperCase() && firstArtist[1] !== 'E') {
    variations.push(firstArtist.substring(1));
  }
  
  return variations;
}

// Search track on Deezer and return matched data
async function searchTrackOnDeezer(title: string, artist: string): Promise<SpotifyTrack | null> {
  // Get possible artist name variations (original + without E prefix)
  const artistVariations = getArtistSearchVariations(artist);
  
  // Clean title by removing parentheses content (feat., with, etc.)
  const cleanedTitle = cleanTitle(title);
  
  for (const artistName of artistVariations) {
    // Try with cleaned title first, then original if different
    const titlesToTry = [cleanedTitle];
    if (cleanedTitle !== title) {
      titlesToTry.push(title);
    }
    
    for (const searchTitle of titlesToTry) {
      try {
        // Search with title + artist
        const query = `${searchTitle} ${artistName}`;
        console.log(`Searching Deezer: "${query}"`);
        
        const response = await fetch(
          `${DEEZER_API}/search/track?q=${encodeURIComponent(query)}&limit=5`,
          {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'application/json',
            },
          }
        );

        if (!response.ok) {
          console.log(`Deezer search failed for "${searchTitle}" by "${artistName}"`);
          continue;
        }

        const data = await response.json();
        const tracks = data.data || [];

        if (tracks.length === 0) {
          console.log(`No Deezer results for "${searchTitle}" by "${artistName}"`);
          continue;
        }

        // Find best match by comparing normalized title and artist
        const normalizedTitle = normalizeString(cleanedTitle);
        const normalizedArtist = normalizeString(artistName);

        let bestMatch = tracks[0];
        let bestScore = 0;

        for (const track of tracks) {
          const trackTitle = normalizeString(track.title || '');
          const trackArtist = normalizeString(track.artist?.name || '');

          let score = 0;

          // Title similarity
          if (trackTitle === normalizedTitle) {
            score += 50;
          } else if (trackTitle.includes(normalizedTitle) || normalizedTitle.includes(trackTitle)) {
            score += 30;
          }

          // Artist similarity
          if (trackArtist === normalizedArtist) {
            score += 50;
          } else if (trackArtist.includes(normalizedArtist) || normalizedArtist.includes(trackArtist)) {
            score += 30;
          }

          if (score > bestScore) {
            bestScore = score;
            bestMatch = track;
          }
        }

        // Accept match only if score >= 40 (at least partial title AND partial artist match)
        // This prevents returning completely unrelated songs
        if (bestScore >= 40) {
          console.log(`Matched "${title}" by "${artist}" -> Deezer: "${bestMatch.title}" by "${bestMatch.artist?.name}" (score: ${bestScore}, searched: "${artistName}")`);

          return {
            id: String(bestMatch.id),
            title: bestMatch.title,
            artist: bestMatch.artist?.name || artist,
            artistId: String(bestMatch.artist?.id || ''),
            album: bestMatch.album?.title || '',
            albumId: String(bestMatch.album?.id || ''),
            coverUrl: bestMatch.album?.cover_medium || bestMatch.album?.cover || '',
            duration: bestMatch.duration || 0,
          };
        }
        
        console.log(`No good match for "${title}" by "${artist}" (best score: ${bestScore}, best: "${bestMatch.title}" by "${bestMatch.artist?.name}")`)
      } catch (error) {
        console.error(`Error searching Deezer for "${searchTitle}" by "${artistName}":`, error);
      }
    }
  }
  
  console.log(`No good Deezer match for "${title}" by "${artist}"`);
  return null;
}

// Match all tracks with Deezer database
async function matchTracksWithDeezer(tracks: SpotifyTrack[]): Promise<SpotifyTrack[]> {
  console.log(`Matching ${tracks.length} tracks with Deezer...`);
  
  const matchedTracks: SpotifyTrack[] = [];
  
  // Process in batches of 5 to avoid rate limiting
  const batchSize = 5;
  for (let i = 0; i < tracks.length; i += batchSize) {
    const batch = tracks.slice(i, i + batchSize);
    
    const batchPromises = batch.map(async (track) => {
      const deezerTrack = await searchTrackOnDeezer(track.title, track.artist);
      
      if (deezerTrack) {
        return deezerTrack;
      }
      
      // If no match found, keep original track with spotify- prefix ID
      return {
        ...track,
        id: track.id.startsWith('spotify-') ? track.id : `spotify-${track.id}`,
      };
    });
    
    const batchResults = await Promise.all(batchPromises);
    matchedTracks.push(...batchResults);
    
    // Small delay between batches to be nice to Deezer API
    if (i + batchSize < tracks.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }
  
  const matchedCount = matchedTracks.filter(t => !t.id.startsWith('spotify-')).length;
  console.log(`Matched ${matchedCount}/${tracks.length} tracks with Deezer`);
  
  return matchedTracks;
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
    
    // Match tracks with Deezer database to get proper IDs, covers, durations, etc.
    console.log('Matching tracks with Deezer...');
    const matchedTracks = await matchTracksWithDeezer(playlistData.tracks);
    playlistData.tracks = matchedTracks;
    
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