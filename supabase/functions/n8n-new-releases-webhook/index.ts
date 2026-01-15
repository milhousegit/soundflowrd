import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEEZER_API = "https://api.deezer.com";

interface UserWithFavorites {
  user_id: string;
  telegram_chat_id: string;
  email: string;
  artists: {
    id: string;
    name: string;
  }[];
}

interface NewRelease {
  user_id: string;
  telegram_chat_id: string;
  email: string;
  artist_id: string;
  artist_name: string;
  album_id: number;
  album_title: string;
  album_cover: string;
  release_date: string;
  album_url: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
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
      
      console.log(`Marking album ${album_id} as sent for user ${user_id}, artist ${artist_id}`);
      
      // Try update first (record should exist from check phase)
      const { data: updateResult, error: updateError } = await supabase
        .from("artist_release_tracking")
        .update({
          last_album_id: String(album_id),
          last_check_at: new Date().toISOString(),
        })
        .eq("user_id", user_id)
        .eq("artist_id", artist_id)
        .select("id");

      if (updateError) {
        console.error("Error updating tracking:", updateError);
        throw updateError;
      }

      // If no record was updated and artist_name is provided, insert new record
      if ((!updateResult || updateResult.length === 0) && artist_name) {
        const { error: insertError } = await supabase
          .from("artist_release_tracking")
          .insert({
            user_id,
            artist_id,
            artist_name,
            last_album_id: String(album_id),
            last_check_at: new Date().toISOString(),
          });

        if (insertError) {
          console.error("Error inserting tracking:", insertError);
          throw insertError;
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: check - Get users with new releases to notify
    console.log("Fetching users with Telegram connected...");
    
    // Get all users with telegram_chat_id
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, email, telegram_chat_id")
      .not("telegram_chat_id", "is", null);

    if (profilesError) throw profilesError;
    if (!profiles || profiles.length === 0) {
      return new Response(JSON.stringify({ 
        message: "No users with Telegram connected",
        new_releases: [] 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Found ${profiles.length} users with Telegram`);

    const newReleases: NewRelease[] = [];
    const seenReleases = new Set<string>(); // Track user_id + album_id combinations

    for (const profile of profiles) {
      // Get favorite artists for this user
      const { data: favorites, error: favError } = await supabase
        .from("favorites")
        .select("item_id, item_title")
        .eq("user_id", profile.id)
        .eq("item_type", "artist");

      if (favError || !favorites || favorites.length === 0) continue;

      console.log(`User ${profile.email} has ${favorites.length} favorite artists`);

      for (const fav of favorites) {
        const artistId = fav.item_id;
        const artistName = fav.item_title;

        // Get current tracking info
        const { data: tracking } = await supabase
          .from("artist_release_tracking")
          .select("last_album_id")
          .eq("user_id", profile.id)
          .eq("artist_id", artistId)
          .maybeSingle();

        // Fetch latest album from Deezer
        try {
          const response = await fetch(`${DEEZER_API}/artist/${artistId}/albums?limit=1`);
          if (!response.ok) continue;

          const data = await response.json();
          const albums = data.data || [];
          
          if (albums.length === 0) continue;

          const latestAlbum = albums[0];
          
          // Check if the album was released today or yesterday (to account for timezone differences)
          const today = new Date();
          const yesterday = new Date(today);
          yesterday.setDate(yesterday.getDate() - 1);
          
          const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
          const yesterdayStr = yesterday.toISOString().split('T')[0];
          const releaseDate = latestAlbum.release_date; // Deezer format: YYYY-MM-DD
          
          const isRecentRelease = releaseDate === todayStr || releaseDate === yesterdayStr;

          // Check if this is a new release (different from last tracked)
          if (!tracking) {
            // First time - initialize tracking without notifying
            await supabase
              .from("artist_release_tracking")
              .upsert({
                user_id: profile.id,
                artist_id: artistId,
                artist_name: artistName,
                last_album_id: String(latestAlbum.id),
                last_check_at: new Date().toISOString(),
              }, {
                onConflict: "user_id,artist_id"
              });
            console.log(`Initialized tracking for ${artistName} (album: ${latestAlbum.title})`);
          } else if (tracking.last_album_id !== String(latestAlbum.id)) {
            // New album detected - only notify if released today/yesterday
            if (!isRecentRelease) {
              console.log(`Skipping old release: ${artistName} - ${latestAlbum.title} (released: ${releaseDate})`);
              // Still update tracking to avoid re-checking this album
              await supabase
                .from("artist_release_tracking")
                .update({
                  last_album_id: String(latestAlbum.id),
                  last_check_at: new Date().toISOString(),
                })
                .eq("user_id", profile.id)
                .eq("artist_id", artistId);
              continue;
            }
            
            // Check for duplicates
            const releaseKey = `${profile.id}_${latestAlbum.id}`;
            if (!seenReleases.has(releaseKey)) {
              seenReleases.add(releaseKey);
              console.log(`NEW RELEASE: ${artistName} - ${latestAlbum.title} (released: ${releaseDate})`);
              
              newReleases.push({
                user_id: profile.id,
                telegram_chat_id: profile.telegram_chat_id,
                email: profile.email,
                artist_id: artistId,
                artist_name: artistName,
                album_id: latestAlbum.id,
                album_title: latestAlbum.title,
                album_cover: latestAlbum.cover_medium || latestAlbum.cover,
                release_date: latestAlbum.release_date,
                album_url: `https://soundflowrd.lovable.app/album/${latestAlbum.id}`,
              });
            } else {
              console.log(`Skipping duplicate: ${artistName} - ${latestAlbum.title} for user ${profile.id}`);
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
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error in n8n webhook:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
