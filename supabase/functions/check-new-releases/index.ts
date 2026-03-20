import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: subscriptions, error: subError } = await supabase
      .from("notification_subscriptions")
      .select("*")
      .eq("enabled", true);

    if (subError) throw subError;
    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ message: "No active subscriptions" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userIds = [...new Set(subscriptions.map((s) => s.user_id))];
    const notificationsToSend: { subscription: any; artist: string; album: string; albumId: string }[] = [];

    for (const userId of userIds) {
      const { data: favorites, error: favError } = await supabase
        .from("favorites")
        .select("*")
        .eq("user_id", userId)
        .eq("item_type", "artist");

      if (favError || !favorites) continue;

      for (const fav of favorites) {
        const artistId = fav.item_id;
        const artistName = fav.item_title;

        const { data: tracking } = await supabase
          .from("artist_release_tracking")
          .select("*")
          .eq("user_id", userId)
          .eq("artist_id", artistId)
          .maybeSingle();

        // Fetch latest albums from Spotify
        try {
          const data = await spotifyFetch(`/artists/${artistId}/albums?include_groups=album,single&limit=5&market=IT`);
          const albums = data?.items || [];
          
          if (albums.length === 0) continue;

          const latestAlbum = albums[0];

          if (!tracking) {
            await supabase.from("artist_release_tracking").insert({
              user_id: userId,
              artist_id: artistId,
              artist_name: artistName,
              last_album_id: latestAlbum.id,
              last_check_at: new Date().toISOString(),
            });
          } else if (tracking.last_album_id !== latestAlbum.id) {
            console.log(`New album detected for ${artistName}: ${latestAlbum.name}`);
            
            await supabase
              .from("artist_release_tracking")
              .update({
                last_album_id: latestAlbum.id,
                last_check_at: new Date().toISOString(),
              })
              .eq("id", tracking.id);

            const userSubs = subscriptions.filter((s) => s.user_id === userId);
            for (const sub of userSubs) {
              notificationsToSend.push({
                subscription: sub,
                artist: artistName,
                album: latestAlbum.name,
                albumId: latestAlbum.id,
              });
            }
          } else {
            await supabase
              .from("artist_release_tracking")
              .update({ last_check_at: new Date().toISOString() })
              .eq("id", tracking.id);
          }
        } catch (e) {
          console.error(`Failed to check releases for ${artistName}:`, e);
        }
      }
    }

    console.log(`Would send ${notificationsToSend.length} notifications`);

    return new Response(
      JSON.stringify({
        checked: userIds.length,
        notificationsSent: notificationsToSend.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error checking new releases:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
