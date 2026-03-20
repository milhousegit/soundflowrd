import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CACHE_DURATION_HOURS = 6;

// ---- Spotify Auth ----
let cachedToken: string | null = null;
let tokenExpiry = 0;

async function getSpotifyToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  const clientId = Deno.env.get('SPOTIFY_CLIENT_ID')!;
  const clientSecret = Deno.env.get('SPOTIFY_CLIENT_SECRET')!;
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken!;
}

async function spotifyFetch(path: string): Promise<any> {
  const token = await getSpotifyToken();
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Spotify ${res.status}: ${text}`);
  }
  return res.json();
}

function bestImage(images: any[]): string | undefined {
  if (!images?.length) return undefined;
  return images.sort((a: any, b: any) => (b.width || 0) - (a.width || 0))[0]?.url;
}

async function getPopularArtists(): Promise<any[]> {
  try {
    // Search for popular artists by genre
    const data = await spotifyFetch('/search?q=genre:pop&type=artist&limit=20&market=IT');
    const artists = (data?.artists?.items || []).map((a: any) => ({
      id: a.id,
      name: a.name,
      imageUrl: bestImage(a.images),
      popularity: a.popularity || 0,
    }));
    return artists;
  } catch (error) {
    console.error('Spotify artists fetch error:', error);
    return [];
  }
}

async function getNewReleases(): Promise<any[]> {
  try {
    // Use tag:new search since /browse/new-releases is restricted with client credentials
    const data = await spotifyFetch('/search?q=tag:new&type=album&limit=30&market=IT');
    const albums = data?.albums?.items || [];
    return albums.map((album: any) => ({
      id: album.id,
      title: album.name,
      artist: album.artists?.[0]?.name || 'Unknown Artist',
      artistId: album.artists?.[0]?.id || '',
      coverUrl: bestImage(album.images),
      releaseDate: album.release_date || undefined,
      trackCount: album.total_tracks || undefined,
    }));
  } catch (error) {
    console.error('Spotify releases fetch error:', error);
    return [];
  }
}

serve(async (req) => {
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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

    let data: any[] = [];

    if (contentType === 'popular_artists') {
      console.log('Fetching popular artists from Spotify...');
      data = await getPopularArtists();
      console.log(`Spotify: ${data.length} artists`);
    } else if (contentType === 'new_releases') {
      console.log('Fetching new releases from Spotify...');
      data = await getNewReleases();
      console.log(`Spotify: ${data.length} releases`);
    }

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
