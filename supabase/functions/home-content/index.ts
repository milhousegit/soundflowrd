import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CACHE_DURATION_HOURS = 6;

// Call the spotify-api edge function internally
async function callSpotifyApi(action: string, params: Record<string, any> = {}): Promise<any> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY')!;
  
  const res = await fetch(`${supabaseUrl}/functions/v1/spotify-api`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseKey}`,
      'apikey': supabaseKey,
    },
    body: JSON.stringify({ action, ...params }),
  });
  
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`spotify-api ${res.status}: ${text}`);
  }
  return JSON.parse(text);
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
        const hoursDiff = (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60);

        if (hoursDiff < CACHE_DURATION_HOURS) {
          console.log(`Returning cached ${contentType} (${hoursDiff.toFixed(1)}h old)`);
          return new Response(JSON.stringify({ 
            data: cached.data, cached: true, cached_at: cached.updated_at 
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
    }

    let data: any = [];

    if (contentType === 'popular_artists') {
      console.log('Fetching popular artists via spotify-api...');
      data = await callSpotifyApi('get-popular-artists', { limit: 10, market: country });
      data = data || [];
    } else if (contentType === 'new_releases') {
      console.log('Fetching new releases via spotify-api...');
      data = await callSpotifyApi('get-new-releases', { limit: 10, market: country });
      data = data || [];
    } else if (contentType === 'trending') {
      // Fetch trending chart for a specific country
      console.log(`Fetching trending for country=${country}...`);
      const tracks = await callSpotifyApi('get-country-chart', { country, limit: 30 });
      // Extract unique albums from tracks
      const albumMap: Record<string, any> = {};
      for (const track of (tracks || [])) {
        if (track.albumId && !albumMap[track.albumId]) {
          albumMap[track.albumId] = {
            id: track.albumId,
            title: track.album || track.title,
            artist: track.artist,
            artistId: track.artistId,
            coverUrl: track.coverUrl,
          };
        }
      }
      data = Object.values(albumMap).slice(0, 12);
      console.log(`Got ${data.length} trending albums`);
    } else if (contentType === 'charts') {
      // Fetch all chart configurations and resolve each one
      console.log('Fetching all chart configurations...');
      const { data: configs, error: cfgErr } = await supabase
        .from('chart_configurations')
        .select('*')
        .order('country_code');
      
      if (cfgErr) throw cfgErr;

      const chartsData: any[] = [];

      for (const config of (configs || [])) {
        const playlistId = config.playlist_id;
        let coverUrl: string | null = null;
        let trackCount = 0;

        if (playlistId.startsWith('sf:')) {
          const sfId = playlistId.replace('sf:', '');
          const [plRes, trRes] = await Promise.all([
            supabase.from('playlists').select('cover_url').eq('id', sfId).single(),
            supabase.from('playlist_tracks').select('id', { count: 'exact' }).eq('playlist_id', sfId)
          ]);
          coverUrl = plRes.data?.cover_url || null;
          trackCount = trRes.count || 0;
        } else {
          // Fetch playlist metadata via spotify-api
          try {
            const playlist = await callSpotifyApi('get-playlist', { id: playlistId });
            if (playlist && !playlist.error) {
              coverUrl = playlist.coverUrl || null;
              trackCount = playlist.trackCount || playlist.tracks?.length || 0;
            }
          } catch (e) {
            console.error(`Error fetching chart playlist ${playlistId}:`, e);
          }
        }

        chartsData.push({
          id: config.id,
          country_code: config.country_code,
          playlist_id: config.playlist_id,
          playlist_title: config.playlist_title,
          coverUrl,
          trackCount,
        });
      }

      data = chartsData;
      console.log(`Got ${data.length} chart entries`);
    }

    const dataArray = Array.isArray(data) ? data : [data];
    if (dataArray.length > 0) {
      await supabase
        .from('home_content_cache')
        .upsert({
          content_type: contentType,
          country,
          language,
          data,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'content_type,country,language' });
    }

    return new Response(JSON.stringify({ 
      data, cached: false, fetched_at: new Date().toISOString() 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Home content error:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to fetch content',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
