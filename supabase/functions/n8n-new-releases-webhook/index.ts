import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// --- Spotify Auth ---
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
  if (!res.ok) throw new Error(`Spotify ${res.status}: ${await res.text()}`);
  return res.json();
}

interface NewRelease {
  user_id: string;
  telegram_chat_id: string;
  email: string;
  artist_id: string;
  artist_name: string;
  album_id: string;
  album_title: string;
  album_cover: string;
  release_date: string;
  album_url: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Webhook secret authentication
  const webhookSecret = Deno.env.get("N8N_WEBHOOK_SECRET");
  const incomingSecret = req.headers.get("x-webhook-secret");
  if (!webhookSecret || incomingSecret !== webhookSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "check";

    // Action: mark_sent - Update tracking after notification sent
    if (action === "mark_sent" && req.method === "POST") {
      const { user_id, artist_id, album_id, artist_name } = await req.json();
      
      const { data: updateResult } = await supabase
        .from("artist_release_tracking")
        .update({
          last_album_id: String(album_id),
          last_check_at: new Date().toISOString(),
        })
        .eq("user_id", user_id)
        .eq("artist_id", artist_id)
        .select("id");

      if ((!updateResult || updateResult.length === 0) && artist_name) {
        await supabase.from("artist_release_tracking").insert({
          user_id, artist_id, artist_name,
          last_album_id: String(album_id),
          last_check_at: new Date().toISOString(),
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: check - Get users with new releases to notify
    console.log("Fetching users with Telegram connected...");
    
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, email, telegram_chat_id")
      .not("telegram_chat_id", "is", null);

    if (profilesError) throw profilesError;
    if (!profiles || profiles.length === 0) {
      return new Response(JSON.stringify({ 
        message: "No users with Telegram connected", new_releases: [] 
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`Found ${profiles.length} users with Telegram`);

    const newReleases: NewRelease[] = [];
    const seenReleases = new Set<string>();

    for (const profile of profiles) {
      const { data: favorites } = await supabase
        .from("favorites")
        .select("item_id, item_title")
        .eq("user_id", profile.id)
        .eq("item_type", "artist");

      if (!favorites || favorites.length === 0) continue;
      console.log(`User ${profile.email} has ${favorites.length} favorite artists`);

      for (const fav of favorites) {
        const artistId = fav.item_id;
        const artistName = fav.item_title;

        const { data: tracking } = await supabase
          .from("artist_release_tracking")
          .select("last_album_id")
          .eq("user_id", profile.id)
          .eq("artist_id", artistId)
          .maybeSingle();

        try {
          const data = await spotifyFetch(`/artists/${artistId}/albums?include_groups=album,single&limit=1&market=IT`);
          const albums = data?.items || [];
          if (albums.length === 0) continue;

          const latest = albums[0];
          const today = new Date();
          const yesterday = new Date(today);
          yesterday.setDate(yesterday.getDate() - 1);
          const todayStr = today.toISOString().split('T')[0];
          const yesterdayStr = yesterday.toISOString().split('T')[0];
          const releaseDate = latest.release_date;
          const isRecentRelease = releaseDate === todayStr || releaseDate === yesterdayStr;

          const coverUrl = latest.images?.[1]?.url || latest.images?.[0]?.url || '';

          if (!tracking) {
            await supabase.from("artist_release_tracking").upsert({
              user_id: profile.id, artist_id: artistId, artist_name: artistName,
              last_album_id: latest.id, last_check_at: new Date().toISOString(),
            }, { onConflict: "user_id,artist_id" });
            console.log(`Initialized tracking for ${artistName} (album: ${latest.name})`);
          } else if (tracking.last_album_id !== latest.id) {
            if (!isRecentRelease) {
              console.log(`Skipping old release: ${artistName} - ${latest.name} (released: ${releaseDate})`);
              await supabase.from("artist_release_tracking").update({
                last_album_id: latest.id, last_check_at: new Date().toISOString(),
              }).eq("user_id", profile.id).eq("artist_id", artistId);
              continue;
            }

            const releaseKey = `${profile.id}_${latest.id}`;
            if (!seenReleases.has(releaseKey)) {
              seenReleases.add(releaseKey);
              console.log(`NEW RELEASE: ${artistName} - ${latest.name} (released: ${releaseDate})`);
              newReleases.push({
                user_id: profile.id,
                telegram_chat_id: profile.telegram_chat_id,
                email: profile.email,
                artist_id: artistId,
                artist_name: artistName,
                album_id: latest.id,
                album_title: latest.name,
                album_cover: coverUrl,
                release_date: releaseDate,
                album_url: `https://soundflowrd.lovable.app/album/${latest.id}`,
              });
            }
          }
        } catch (e) {
          console.error(`Error fetching albums for artist ${artistId}:`, e);
        }
      }
    }

    console.log(`Found ${newReleases.length} new releases to notify`);

    return new Response(JSON.stringify({
      checked_users: profiles.length,
      new_releases: newReleases,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("Error in n8n webhook:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error" 
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
