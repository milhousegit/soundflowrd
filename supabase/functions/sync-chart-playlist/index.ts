import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function extractSpotifyId(url: string): string | null {
  const m = url.match(/spotify\.com\/playlist\/([a-zA-Z0-9]+)/);
  return m ? m[1] : null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get all chart configs that have a spotify_url linked via sf: prefix
    const { data: configs, error: cfgErr } = await supabase
      .from('chart_configurations')
      .select('*')
      .like('playlist_id', 'sf:%');

    if (cfgErr) throw cfgErr;
    if (!configs || configs.length === 0) {
      return new Response(JSON.stringify({ message: 'No chart playlists to sync' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results: any[] = [];

    for (const config of configs) {
      const sfId = config.playlist_id.replace('sf:', '');

      // Get the playlist to find its spotify_url
      const { data: playlist } = await supabase
        .from('playlists')
        .select('id, name, spotify_url, cover_url')
        .eq('id', sfId)
        .single();

      if (!playlist?.spotify_url) {
        results.push({ country: config.country_code, status: 'skipped', reason: 'no spotify_url' });
        continue;
      }

      const spotifyId = extractSpotifyId(playlist.spotify_url);
      if (!spotifyId) {
        results.push({ country: config.country_code, status: 'skipped', reason: 'invalid spotify_url' });
        continue;
      }

      console.log(`Syncing ${config.country_code}: Spotify ${spotifyId} -> SoundFlow ${sfId}`);

      // Use spotify-import to fetch and match tracks
      const importRes = await fetch(`${supabaseUrl}/functions/v1/spotify-import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({ url: playlist.spotify_url }),
      });

      if (!importRes.ok) {
        const err = await importRes.text();
        console.error(`spotify-import failed: ${importRes.status} ${err}`);
        results.push({ country: config.country_code, status: 'error', reason: `import failed: ${importRes.status}` });
        continue;
      }

      const importData = await importRes.json();
      if (importData.error || !importData.tracks?.length) {
        results.push({ country: config.country_code, status: 'error', reason: importData.error || 'no tracks' });
        continue;
      }

      const tracks = importData.tracks;
      console.log(`Got ${tracks.length} tracks from spotify-import for ${config.country_code}`);

      if (tracks.length === 0) {
        results.push({ country: config.country_code, status: 'error', reason: 'no tracks' });
        continue;
      }

      // Replace playlist tracks
      await supabase.from('playlist_tracks').delete().eq('playlist_id', sfId);

      const trackRows = tracks.map((t: any, idx: number) => ({
        playlist_id: sfId,
        track_id: t.id,
        track_title: t.title,
        track_artist: t.artist,
        track_album: t.album,
        track_album_id: t.albumId,
        track_cover_url: t.coverUrl,
        track_duration: t.duration,
        position: idx,
      }));

      const { error: insertErr } = await supabase.from('playlist_tracks').insert(trackRows);
      if (insertErr) {
        console.error('Insert error:', insertErr);
        results.push({ country: config.country_code, status: 'error', reason: insertErr.message });
        continue;
      }

      // Update playlist track_count
      await supabase.from('playlists').update({
        track_count: tracks.length,
        updated_at: new Date().toISOString(),
      }).eq('id', sfId);

      results.push({
        country: config.country_code,
        status: 'synced',
        tracks: tracks.length,
      });

      console.log(`✅ ${config.country_code} synced: ${tracks.length} tracks`);
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Sync error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
