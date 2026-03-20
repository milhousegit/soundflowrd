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
  
  const body = JSON.stringify({ action, ...params });
  console.log(`Calling spotify-api: ${action}`, body);
  
  const res = await fetch(`${supabaseUrl}/functions/v1/spotify-api`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseKey}`,
    },
    body,
  });
  
  const text = await res.text();
  console.log(`spotify-api response status: ${res.status}, body length: ${text.length}, preview: ${text.slice(0, 200)}`);
  
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

    let data: any[] = [];

    if (contentType === 'popular_artists') {
      console.log('Fetching popular artists via spotify-api...');
      data = await callSpotifyApi('get-popular-artists', { limit: 20, market: country });
      console.log(`Got ${(data || []).length} artists`);
      data = data || [];
    } else if (contentType === 'new_releases') {
      console.log('Fetching new releases via spotify-api...');
      data = await callSpotifyApi('get-new-releases', { limit: 30, market: country });
      console.log(`Got ${(data || []).length} releases`);
      data = data || [];
    }

    if (data.length > 0) {
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
