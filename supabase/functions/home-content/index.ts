import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// MusicBrainz API with rate limiting
const MB_BASE = 'https://musicbrainz.org/ws/2';
const MB_HEADERS = {
  'User-Agent': 'SoundFlow/0.6.1 (contact@soundflow.app)',
  'Accept': 'application/json',
};

// LastFM API for better coverage
const LASTFM_BASE = 'https://ws.audioscrobbler.com/2.0/';
// Using a public API key for LastFM (read-only, safe to expose)
const LASTFM_API_KEY = 'b25b959554ed76058ac220b7b2e0a026';

// Cache duration in hours
const CACHE_DURATION_HOURS = 6;

interface Album {
  id: string;
  title: string;
  artist: string;
  artistId?: string;
  coverUrl?: string;
  releaseDate?: string;
  trackCount?: number;
}

interface Artist {
  id: string;
  name: string;
  imageUrl?: string;
  genre?: string;
}

// Fetch with timeout
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeout = 10000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(id);
  }
}

// Get popular artists from LastFM
async function getPopularArtistsLastFM(country: string): Promise<Artist[]> {
  try {
    const url = `${LASTFM_BASE}?method=geo.gettopartists&country=${country}&api_key=${LASTFM_API_KEY}&format=json&limit=20`;
    const response = await fetchWithTimeout(url, {}, 8000);
    
    if (!response.ok) {
      console.error('LastFM error:', response.status);
      return [];
    }
    
    const data = await response.json();
    const artists = data?.topartists?.artist || [];
    
    return artists.map((artist: any) => ({
      id: artist.mbid || `lastfm-${artist.name.replace(/\s+/g, '-').toLowerCase()}`,
      name: artist.name,
      imageUrl: artist.image?.find((img: any) => img.size === 'extralarge')?.['#text'] || 
                artist.image?.find((img: any) => img.size === 'large')?.['#text'] || null,
      genre: null,
    })).filter((a: Artist) => a.name);
  } catch (error) {
    console.error('LastFM fetch error:', error);
    return [];
  }
}

// Get popular artists from MusicBrainz
async function getPopularArtistsMB(country: string): Promise<Artist[]> {
  try {
    // MusicBrainz doesn't have a direct "popular artists" endpoint
    // We'll search for artists with high rating from the country
    const countryCode = country.toUpperCase();
    const url = `${MB_BASE}/artist?query=country:${countryCode}&limit=20&fmt=json`;
    
    const response = await fetchWithTimeout(url, { headers: MB_HEADERS }, 8000);
    
    if (!response.ok) {
      console.error('MusicBrainz error:', response.status);
      return [];
    }
    
    const data = await response.json();
    const artists = data?.artists || [];
    
    return artists.map((artist: any) => ({
      id: artist.id,
      name: artist.name,
      imageUrl: null, // MusicBrainz doesn't provide images directly
      genre: artist.tags?.[0]?.name || null,
    })).filter((a: Artist) => a.name);
  } catch (error) {
    console.error('MusicBrainz fetch error:', error);
    return [];
  }
}

// Get new releases from MusicBrainz
async function getNewReleasesMB(country: string): Promise<Album[]> {
  try {
    // Get releases from the last 3 months
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const dateStr = threeMonthsAgo.toISOString().split('T')[0];
    
    const countryCode = country.toUpperCase();
    const url = `${MB_BASE}/release?query=date:[${dateStr} TO *] AND country:${countryCode}&limit=30&fmt=json`;
    
    const response = await fetchWithTimeout(url, { headers: MB_HEADERS }, 8000);
    
    if (!response.ok) {
      console.error('MusicBrainz releases error:', response.status);
      return [];
    }
    
    const data = await response.json();
    const releases = data?.releases || [];
    
    return releases.map((release: any) => {
      const artistCredit = release['artist-credit']?.[0];
      return {
        id: release.id,
        title: release.title,
        artist: artistCredit?.name || artistCredit?.artist?.name || 'Unknown Artist',
        artistId: artistCredit?.artist?.id,
        coverUrl: `https://coverartarchive.org/release/${release.id}/front-250`,
        releaseDate: release.date,
        trackCount: release['track-count'] || null,
      };
    }).filter((a: Album) => a.title && a.artist);
  } catch (error) {
    console.error('MusicBrainz releases error:', error);
    return [];
  }
}

// Get new releases from LastFM (chart top albums)
async function getNewReleasesLastFM(country: string): Promise<Album[]> {
  try {
    const url = `${LASTFM_BASE}?method=geo.gettoptracks&country=${country}&api_key=${LASTFM_API_KEY}&format=json&limit=30`;
    const response = await fetchWithTimeout(url, {}, 8000);
    
    if (!response.ok) {
      console.error('LastFM top tracks error:', response.status);
      return [];
    }
    
    const data = await response.json();
    const tracks = data?.tracks?.track || [];
    
    // Get unique albums from tracks
    const albumMap = new Map<string, Album>();
    
    for (const track of tracks) {
      const albumName = track.name; // LastFM geo.gettoptracks doesn't have album info
      const artistName = track.artist?.name || 'Unknown Artist';
      const key = `${artistName}-${track.name}`;
      
      if (!albumMap.has(key)) {
        albumMap.set(key, {
          id: track.mbid || `lastfm-${key.replace(/\s+/g, '-').toLowerCase()}`,
          title: track.name,
          artist: artistName,
          artistId: track.artist?.mbid,
          coverUrl: track.image?.find((img: any) => img.size === 'extralarge')?.['#text'] ||
                    track.image?.find((img: any) => img.size === 'large')?.['#text'] || undefined,
          releaseDate: undefined,
          trackCount: undefined,
        });
      }
    }
    
    return Array.from(albumMap.values()).slice(0, 20);
  } catch (error) {
    console.error('LastFM releases error:', error);
    return [];
  }
}

// Merge and deduplicate artists
function mergeArtists(lastfm: Artist[], mb: Artist[]): Artist[] {
  const seen = new Map<string, Artist>();
  
  // LastFM first (usually has images)
  for (const artist of lastfm) {
    const key = artist.name.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, artist);
    }
  }
  
  // Add MB artists not in LastFM
  for (const artist of mb) {
    const key = artist.name.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, artist);
    }
  }
  
  return Array.from(seen.values()).slice(0, 15);
}

// Merge and deduplicate albums
function mergeAlbums(mb: Album[], lastfm: Album[]): Album[] {
  const seen = new Map<string, Album>();
  
  // MusicBrainz first (has release dates)
  for (const album of mb) {
    const key = `${album.artist.toLowerCase()}-${album.title.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.set(key, album);
    }
  }
  
  // Add LastFM albums not in MB
  for (const album of lastfm) {
    const key = `${album.artist.toLowerCase()}-${album.title.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.set(key, album);
    }
  }
  
  return Array.from(seen.values()).slice(0, 20);
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const contentType = url.searchParams.get('type') || 'popular_artists';
    const country = url.searchParams.get('country') || 'IT';
    const language = url.searchParams.get('language') || 'it';
    const forceRefresh = url.searchParams.get('refresh') === 'true';

    console.log(`Home content request: type=${contentType}, country=${country}, language=${language}`);

    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const { data: cached } = await supabase
        .from('home_content_cache')
        .select('data, updated_at')
        .eq('content_type', contentType)
        .eq('country', country)
        .eq('language', language)
        .maybeSingle();

      if (cached) {
        const updatedAt = new Date(cached.updated_at);
        const now = new Date();
        const hoursDiff = (now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60);

        if (hoursDiff < CACHE_DURATION_HOURS) {
          console.log(`Returning cached ${contentType} (${hoursDiff.toFixed(1)}h old)`);
          return new Response(JSON.stringify({ 
            data: cached.data, 
            cached: true,
            cached_at: cached.updated_at 
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
    }

    // Fetch fresh data
    let data: any[] = [];

    if (contentType === 'popular_artists') {
      console.log('Fetching popular artists from APIs...');
      
      // Fetch from both APIs in parallel
      const [lastfmArtists, mbArtists] = await Promise.all([
        getPopularArtistsLastFM(country),
        getPopularArtistsMB(country),
      ]);

      console.log(`LastFM: ${lastfmArtists.length}, MB: ${mbArtists.length}`);
      data = mergeArtists(lastfmArtists, mbArtists);
    } else if (contentType === 'new_releases') {
      console.log('Fetching new releases from APIs...');
      
      // Fetch from both APIs in parallel
      const [mbReleases, lastfmReleases] = await Promise.all([
        getNewReleasesMB(country),
        getNewReleasesLastFM(country),
      ]);

      console.log(`MB: ${mbReleases.length}, LastFM: ${lastfmReleases.length}`);
      data = mergeAlbums(mbReleases, lastfmReleases);
    }

    // Update cache
    if (data.length > 0) {
      const { error: upsertError } = await supabase
        .from('home_content_cache')
        .upsert({
          content_type: contentType,
          country,
          language,
          data,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'content_type,country,language',
        });

      if (upsertError) {
        console.error('Cache upsert error:', upsertError);
      } else {
        console.log(`Cached ${data.length} ${contentType} items`);
      }
    }

    return new Response(JSON.stringify({ 
      data, 
      cached: false,
      fetched_at: new Date().toISOString() 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Home content error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      error: 'Failed to fetch content',
      details: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});