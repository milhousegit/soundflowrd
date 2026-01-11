import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEEZER_API = 'https://api.deezer.com';

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
  popularity?: number;
}

// Fetch with timeout
async function fetchWithTimeout(url: string, timeout = 10000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } finally {
    clearTimeout(id);
  }
}

// Get popular artists from Deezer charts
async function getPopularArtists(): Promise<Artist[]> {
  try {
    const response = await fetchWithTimeout(`${DEEZER_API}/chart/0/artists?limit=20`);
    
    if (!response.ok) {
      console.error('Deezer artists error:', response.status);
      return [];
    }
    
    const data = await response.json();
    const artists = data.data || [];
    
    return artists.map((artist: any) => ({
      id: String(artist.id),
      name: artist.name,
      imageUrl: artist.picture_medium || artist.picture_big || artist.picture || undefined,
      popularity: artist.position || 0,
    }));
  } catch (error) {
    console.error('Deezer artists fetch error:', error);
    return [];
  }
}

// Get new releases from Deezer editorial
async function getNewReleases(): Promise<Album[]> {
  try {
    const response = await fetchWithTimeout(`${DEEZER_API}/editorial/0/releases?limit=30`);
    
    if (!response.ok) {
      console.error('Deezer releases error:', response.status);
      return [];
    }
    
    const data = await response.json();
    const releases = data.data || [];
    
    return releases.map((album: any) => ({
      id: String(album.id),
      title: album.title,
      artist: album.artist?.name || 'Unknown Artist',
      artistId: String(album.artist?.id || ''),
      coverUrl: album.cover_medium || album.cover_big || album.cover || undefined,
      releaseDate: album.release_date || undefined,
      trackCount: album.nb_tracks || undefined,
    }));
  } catch (error) {
    console.error('Deezer releases fetch error:', error);
    return [];
  }
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

    // Fetch fresh data from Deezer
    let data: any[] = [];

    if (contentType === 'popular_artists') {
      console.log('Fetching popular artists from Deezer...');
      data = await getPopularArtists();
      console.log(`Deezer: ${data.length} artists`);
    } else if (contentType === 'new_releases') {
      console.log('Fetching new releases from Deezer...');
      data = await getNewReleases();
      console.log(`Deezer: ${data.length} releases`);
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
