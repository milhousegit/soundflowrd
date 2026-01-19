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

// Get anonymous access token from Spotify (no API key needed!)
async function getAnonymousToken(): Promise<string | null> {
  try {
    console.log('Fetching anonymous Spotify token...');
    
    // Method 1: Try the get_access_token endpoint
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
        console.log('Got anonymous token from get_access_token endpoint');
        return data.accessToken;
      }
    }
    
    // Method 2: Fallback - scrape token from embed page
    console.log('Trying embed page token extraction...');
    const embedResponse = await fetch('https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html',
      },
    });
    
    if (embedResponse.ok) {
      const html = await embedResponse.text();
      
      // Look for accessToken in the page source
      const tokenMatch = html.match(/"accessToken":"([^"]+)"/);
      if (tokenMatch) {
        console.log('Got anonymous token from embed page');
        return tokenMatch[1];
      }
      
      // Alternative pattern
      const altTokenMatch = html.match(/accessToken['"]\s*:\s*['"]([^'"]+)['"]/);
      if (altTokenMatch) {
        console.log('Got anonymous token from embed page (alt pattern)');
        return altTokenMatch[1];
      }
    }
    
    console.log('Could not get anonymous token');
    return null;
  } catch (error) {
    console.error('Error getting anonymous token:', error);
    return null;
  }
}

// Fetch playlist using Spotify's internal GraphQL API (like SpotAPI does)
async function fetchPlaylistWithGraphQL(playlistId: string, token: string): Promise<PlaylistData | null> {
  try {
    console.log('Fetching playlist via GraphQL API...');
    
    const playlistUri = `spotify:playlist:${playlistId}`;
    
    // GraphQL query variables
    const variables = {
      uri: playlistUri,
      offset: 0,
      limit: 100,
    };
    
    // The persisted query hash for fetchPlaylist operation
    // These are stable hashes used by Spotify's web player
    const extensions = {
      persistedQuery: {
        version: 1,
        sha256Hash: "b39f62e9b566aa849b1780927de1f9583b1e753861cc9eb4e7db49ec82a9a76a"
      }
    };
    
    const url = `https://api-partner.spotify.com/pathfinder/v1/query?operationName=fetchPlaylist&variables=${encodeURIComponent(JSON.stringify(variables))}&extensions=${encodeURIComponent(JSON.stringify(extensions))}`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Origin': 'https://open.spotify.com',
        'Referer': 'https://open.spotify.com/',
        'app-platform': 'WebPlayer',
        'spotify-app-version': '1.2.0.0',
      },
    });
    
    if (!response.ok) {
      console.log(`GraphQL API returned ${response.status}, trying alternative method...`);
      return await fetchPlaylistWithWebAPI(playlistId, token);
    }
    
    const data = await response.json();
    
    // Parse the GraphQL response
    const playlist = data?.data?.playlistV2;
    
    if (!playlist) {
      console.log('No playlist data in GraphQL response, trying alternative...');
      return await fetchPlaylistWithWebAPI(playlistId, token);
    }
    
    const tracks: SpotifyTrack[] = [];
    const items = playlist.content?.items || [];
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const track = item?.itemV2?.data;
      
      if (!track || track.__typename !== 'Track') continue;
      
      const artists = track.artists?.items || [];
      const artistNames = artists.map((a: any) => a?.profile?.name).filter(Boolean).join(', ');
      const firstArtistUri = artists[0]?.uri || '';
      const artistId = firstArtistUri.replace('spotify:artist:', '');
      
      const album = track.albumOfTrack || {};
      const albumUri = album.uri || '';
      const albumId = albumUri.replace('spotify:album:', '');
      const coverUrl = album.coverArt?.sources?.[0]?.url || '';
      
      tracks.push({
        id: track.uri?.replace('spotify:track:', '') || `spotify-${playlistId}-${i}`,
        title: track.name || 'Unknown',
        artist: artistNames || 'Unknown Artist',
        artistId: artistId,
        album: album.name || '',
        albumId: albumId,
        coverUrl: coverUrl,
        duration: Math.floor((track.duration?.totalMilliseconds || 0) / 1000),
      });
    }
    
    const playlistName = playlist.name || 'Imported Playlist';
    const playlistCover = playlist.images?.items?.[0]?.sources?.[0]?.url || '';
    const description = playlist.description || '';
    
    console.log(`GraphQL: Got "${playlistName}" with ${tracks.length} tracks`);
    
    if (tracks.length === 0) {
      console.log('No tracks from GraphQL, trying alternative...');
      return await fetchPlaylistWithWebAPI(playlistId, token);
    }
    
    return {
      name: playlistName,
      description: description,
      coverUrl: playlistCover,
      tracks,
    };
  } catch (error) {
    console.error('GraphQL fetch error:', error);
    return await fetchPlaylistWithWebAPI(playlistId, token);
  }
}

// Alternative: Use Spotify's internal web API
async function fetchPlaylistWithWebAPI(playlistId: string, token: string): Promise<PlaylistData | null> {
  try {
    console.log('Trying Spotify internal web API...');
    
    // This is the internal API used by the web player
    const response = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}?fields=name,description,images,tracks.items(track(id,name,duration_ms,artists(id,name),album(id,name,images)))&limit=100`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      console.log(`Web API returned ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    const tracks: SpotifyTrack[] = (data.tracks?.items || [])
      .filter((item: any) => item?.track)
      .map((item: any, index: number) => ({
        id: item.track.id || `spotify-${playlistId}-${index}`,
        title: item.track.name || 'Unknown',
        artist: item.track.artists?.map((a: any) => a.name).join(', ') || 'Unknown Artist',
        artistId: String(item.track.artists?.[0]?.id || ''),
        album: item.track.album?.name || '',
        albumId: String(item.track.album?.id || ''),
        coverUrl: item.track.album?.images?.[0]?.url || '',
        duration: Math.floor((item.track.duration_ms || 0) / 1000),
      }));
    
    console.log(`Web API: Got "${data.name}" with ${tracks.length} tracks`);
    
    return {
      name: data.name || 'Imported Playlist',
      description: data.description || '',
      coverUrl: data.images?.[0]?.url || '',
      tracks,
    };
  } catch (error) {
    console.error('Web API fetch error:', error);
    return null;
  }
}

// Fallback: Scrape from embed page HTML (no external dependencies)
async function fetchPlaylistFromEmbed(playlistId: string): Promise<PlaylistData | null> {
  try {
    console.log('Trying embed page scraping...');
    
    const embedUrl = `https://open.spotify.com/embed/playlist/${playlistId}`;
    
    const response = await fetch(embedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    
    if (!response.ok) {
      console.log(`Embed page returned ${response.status}`);
      return null;
    }
    
    const html = await response.text();
    
    // Try to extract data from the embedded JSON in the page
    // Spotify embeds track data in a script tag
    const scriptMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([^<]+)<\/script>/);
    
    if (scriptMatch) {
      try {
        const jsonData = JSON.parse(scriptMatch[1]);
        const playlist = jsonData?.props?.pageProps?.state?.data?.entity;
        
        if (playlist) {
          const tracks: SpotifyTrack[] = [];
          const items = playlist.trackList || [];
          
          for (let i = 0; i < items.length; i++) {
            const track = items[i];
            tracks.push({
              id: track.uri?.replace('spotify:track:', '') || `spotify-${playlistId}-${i}`,
              title: track.title || 'Unknown',
              artist: track.subtitle || 'Unknown Artist',
              artistId: '',
              album: '',
              albumId: '',
              coverUrl: '',
              duration: Math.floor((track.duration || 0) / 1000),
            });
          }
          
          console.log(`Embed JSON: Got "${playlist.title}" with ${tracks.length} tracks`);
          
          return {
            name: playlist.title || 'Imported Playlist',
            description: '',
            coverUrl: playlist.images?.[0]?.url || playlist.coverArt?.sources?.[0]?.url || '',
            tracks,
          };
        }
      } catch (e) {
        console.log('Failed to parse embed JSON:', e);
      }
    }
    
    // Fallback: Parse visible elements from HTML
    const tracks: SpotifyTrack[] = [];
    
    // Extract playlist name
    let playlistName = 'Imported Playlist';
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch) {
      playlistName = titleMatch[1]
        .replace(/\s*\|\s*Spotify.*$/i, '')
        .replace(/\s*-\s*Spotify.*$/i, '')
        .trim();
    }
    
    // Try to find track data in aria-labels or data attributes
    const trackRowRegex = /data-testid="tracklist-row"[\s\S]*?aria-label="([^"]+)"/gi;
    let match;
    let index = 0;
    
    while ((match = trackRowRegex.exec(html)) !== null) {
      const ariaLabel = match[1];
      const parts = ariaLabel.split(',').map((s) => s.trim());
      if (parts.length >= 2) {
        tracks.push({
          id: `spotify-${playlistId}-${index}`,
          title: parts[0],
          artist: cleanScrapedArtist(parts[1]),
          artistId: '',
          album: parts[2] || '',
          albumId: '',
          coverUrl: '',
          duration: 0,
        });
        index++;
      }
    }
    
    // Extract cover URL
    let coverUrl = '';
    const coverPatterns = [
      /https?:\/\/charts-images\.scdn\.co\/[^"'\s<>]+/i,
      /https?:\/\/mosaic\.scdn\.co\/[^"'\s<>]+/i,
      /https?:\/\/i\.scdn\.co\/image\/[a-zA-Z0-9]+/i,
    ];
    
    for (const pattern of coverPatterns) {
      const coverMatch = html.match(pattern);
      if (coverMatch) {
        coverUrl = coverMatch[0];
        break;
      }
    }
    
    if (tracks.length > 0) {
      console.log(`Embed HTML: Got "${playlistName}" with ${tracks.length} tracks`);
      return { name: playlistName, description: '', coverUrl, tracks };
    }
    
    console.log('No tracks found in embed page');
    return null;
  } catch (error) {
    console.error('Embed scraping error:', error);
    return null;
  }
}

// Try oEmbed for metadata (always works, but no tracks)
async function getOEmbedMetadata(playlistId: string): Promise<{ name: string; coverUrl: string } | null> {
  try {
    const url = `https://open.spotify.com/playlist/${playlistId}`;
    const oEmbedRes = await fetch(
      `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    
    if (oEmbedRes.ok) {
      const oEmbed = await oEmbedRes.json();
      return {
        name: oEmbed.title || 'Imported Playlist',
        coverUrl: oEmbed.thumbnail_url || '',
      };
    }
  } catch (e) {
    console.log('oEmbed metadata fetch failed:', e);
  }
  return null;
}

// Clean artist name from Spotify "E" (Explicit) badge
function cleanScrapedArtist(artist: string): string {
  if (artist.length > 1 && artist.startsWith('E') && /[A-Z]/.test(artist[1]) && artist[1] !== 'E') {
    return artist.substring(1);
  }
  return artist;
}

// Normalize string for comparison
function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, '')
    .trim();
}

// Clean title by removing parentheses content
function cleanTitle(title: string): string {
  return title.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
}

// Get artist search variations
function getArtistSearchVariations(artist: string): string[] {
  const firstArtist = artist.split(',')[0].trim();
  const variations = [firstArtist];
  
  if (firstArtist.length > 1 && firstArtist.startsWith('E') && firstArtist[1] === firstArtist[1].toUpperCase() && firstArtist[1] !== 'E') {
    variations.push(firstArtist.substring(1));
  }
  
  return variations;
}

// Search track on Deezer
async function searchTrackOnDeezer(title: string, artist: string): Promise<SpotifyTrack | null> {
  const artistVariations = getArtistSearchVariations(artist);
  const cleanedTitle = cleanTitle(title);
  
  for (const artistName of artistVariations) {
    const titlesToTry = [cleanedTitle];
    if (cleanedTitle !== title) {
      titlesToTry.push(title);
    }
    
    for (const searchTitle of titlesToTry) {
      try {
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

        if (!response.ok) continue;

        const data = await response.json();
        const tracks = data.data || [];

        if (tracks.length === 0) continue;

        const normalizedTitle = normalizeString(cleanedTitle);
        const normalizedArtist = normalizeString(artistName);

        let bestMatch = tracks[0];
        let bestScore = 0;

        for (const track of tracks) {
          const trackTitle = normalizeString(track.title || '');
          const trackArtist = normalizeString(track.artist?.name || '');

          let score = 0;

          if (trackTitle === normalizedTitle) {
            score += 50;
          } else if (trackTitle.includes(normalizedTitle) || normalizedTitle.includes(trackTitle)) {
            score += 30;
          }

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

        if (bestScore >= 40) {
          console.log(`Matched "${title}" -> "${bestMatch.title}" by "${bestMatch.artist?.name}" (score: ${bestScore})`);

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
      } catch (error) {
        console.error(`Deezer search error:`, error);
      }
    }
  }
  
  // Album fallback for new releases
  console.log(`Trying album fallback for "${cleanedTitle}"...`);
  
  for (const artistName of artistVariations) {
    try {
      const albumQuery = `${cleanedTitle} ${artistName}`;
      
      const albumResponse = await fetch(
        `${DEEZER_API}/search/album?q=${encodeURIComponent(albumQuery)}&limit=5`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json',
          },
        }
      );
      
      if (!albumResponse.ok) continue;
      
      const albumData = await albumResponse.json();
      const albums = albumData.data || [];
      
      const normalizedTitle = normalizeString(cleanedTitle);
      const normalizedArtist = normalizeString(artistName);
      
      for (const album of albums) {
        const albumTitle = normalizeString(album.title || '');
        const albumArtist = normalizeString(album.artist?.name || '');
        
        const titleMatches = albumTitle === normalizedTitle || 
          albumTitle.includes(normalizedTitle) || 
          normalizedTitle.includes(albumTitle);
        
        const artistMatches = albumArtist === normalizedArtist || 
          albumArtist.includes(normalizedArtist) || 
          normalizedArtist.includes(albumArtist);
        
        if (titleMatches && artistMatches) {
          const tracksResponse = await fetch(
            `${DEEZER_API}/album/${album.id}/tracks`,
            {
              headers: {
                'User-Agent': 'Mozilla/5.0',
                'Accept': 'application/json',
              },
            }
          );
          
          if (!tracksResponse.ok) continue;
          
          const tracksData = await tracksResponse.json();
          const albumTracks = tracksData.data || [];
          
          for (const track of albumTracks) {
            const trackTitle = normalizeString(track.title || '');
            
            if (trackTitle === normalizedTitle || 
                trackTitle.includes(normalizedTitle) || 
                normalizedTitle.includes(trackTitle)) {
              console.log(`Album fallback matched "${title}" -> "${track.title}"`);
              
              return {
                id: String(track.id),
                title: track.title,
                artist: album.artist?.name || artist,
                artistId: String(album.artist?.id || ''),
                album: album.title || '',
                albumId: String(album.id || ''),
                coverUrl: album.cover_medium || album.cover || '',
                duration: track.duration || 0,
              };
            }
          }
        }
      }
    } catch (error) {
      console.error(`Album fallback error:`, error);
    }
  }
  
  console.log(`No Deezer match for "${title}" by "${artist}"`);
  return null;
}

// Match all tracks with Deezer
async function matchTracksWithDeezer(tracks: SpotifyTrack[]): Promise<SpotifyTrack[]> {
  console.log(`Matching ${tracks.length} tracks with Deezer...`);
  
  const matchedTracks: SpotifyTrack[] = [];
  const batchSize = 5;
  
  for (let i = 0; i < tracks.length; i += batchSize) {
    const batch = tracks.slice(i, i + batchSize);
    
    const batchPromises = batch.map(async (track) => {
      const deezerTrack = await searchTrackOnDeezer(track.title, track.artist);
      
      if (deezerTrack) {
        return deezerTrack;
      }
      
      return {
        ...track,
        id: track.id.startsWith('spotify-') ? track.id : `spotify-${track.id}`,
      };
    });
    
    const batchResults = await Promise.all(batchPromises);
    matchedTracks.push(...batchResults);
    
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
    
    console.log('=== Spotify Import ===');
    console.log('Playlist ID:', playlistId);
    
    let playlistData: PlaylistData | null = null;
    
    // Step 1: Get anonymous token
    const token = await getAnonymousToken();
    
    if (token) {
      // Step 2: Try GraphQL API (most reliable)
      playlistData = await fetchPlaylistWithGraphQL(playlistId, token);
    }
    
    // Step 3: Fallback to embed page scraping (no token needed)
    if (!playlistData) {
      console.log('API methods failed, trying embed scraping...');
      playlistData = await fetchPlaylistFromEmbed(playlistId);
    }
    
    // Step 4: If still no data, at least get metadata from oEmbed
    if (!playlistData) {
      const metadata = await getOEmbedMetadata(playlistId);
      if (metadata) {
        console.log('Only got oEmbed metadata, no tracks');
        return new Response(
          JSON.stringify({ 
            error: 'Could not fetch playlist tracks. The playlist may be private or Spotify is blocking requests.',
            partialData: metadata
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: 'Could not fetch playlist data' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Step 5: Match tracks with Deezer
    console.log('Matching tracks with Deezer...');
    const matchedTracks = await matchTracksWithDeezer(playlistData.tracks);
    playlistData.tracks = matchedTracks;
    
    console.log(`=== Success: "${playlistData.name}" with ${matchedTracks.length} tracks ===`);
    
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
