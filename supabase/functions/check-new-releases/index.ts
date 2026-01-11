import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEEZER_API = "https://api.deezer.com";

interface Artist {
  id: string;
  name: string;
}

interface Album {
  id: number;
  title: string;
  cover_medium: string;
  release_date: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all users with notification subscriptions
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
    const notificationsToSend: { subscription: any; artist: string; album: string; albumId: number }[] = [];

    for (const userId of userIds) {
      // Get favorite artists for this user
      const { data: favorites, error: favError } = await supabase
        .from("favorites")
        .select("*")
        .eq("user_id", userId)
        .eq("item_type", "artist");

      if (favError || !favorites) continue;

      for (const fav of favorites) {
        const artistId = fav.item_id;
        const artistName = fav.item_title;

        // Get tracking info for this artist
        const { data: tracking } = await supabase
          .from("artist_release_tracking")
          .select("*")
          .eq("user_id", userId)
          .eq("artist_id", artistId)
          .maybeSingle();

        // Fetch latest albums from Deezer
        const response = await fetch(`${DEEZER_API}/artist/${artistId}/albums?limit=5`);
        if (!response.ok) continue;

        const data = await response.json();
        const albums: Album[] = data.data || [];
        
        if (albums.length === 0) continue;

        const latestAlbum = albums[0];

        if (!tracking) {
          // First time checking this artist, just save the current latest album
          await supabase.from("artist_release_tracking").insert({
            user_id: userId,
            artist_id: artistId,
            artist_name: artistName,
            last_album_id: String(latestAlbum.id),
            last_check_at: new Date().toISOString(),
          });
        } else if (tracking.last_album_id !== String(latestAlbum.id)) {
          // New album detected!
          console.log(`New album detected for ${artistName}: ${latestAlbum.title}`);
          
          // Update tracking
          await supabase
            .from("artist_release_tracking")
            .update({
              last_album_id: String(latestAlbum.id),
              last_check_at: new Date().toISOString(),
            })
            .eq("id", tracking.id);

          // Queue notification for this user
          const userSubs = subscriptions.filter((s) => s.user_id === userId);
          for (const sub of userSubs) {
            notificationsToSend.push({
              subscription: sub,
              artist: artistName,
              album: latestAlbum.title,
              albumId: latestAlbum.id,
            });
          }
        } else {
          // No new album, update check time
          await supabase
            .from("artist_release_tracking")
            .update({ last_check_at: new Date().toISOString() })
            .eq("id", tracking.id);
        }
      }
    }

    // Send push notifications
    // Note: In production, you'd need web-push library or a push service
    // For now, we'll just log the notifications that would be sent
    console.log(`Would send ${notificationsToSend.length} notifications`);
    
    for (const notif of notificationsToSend) {
      console.log(`Notification: ${notif.artist} released "${notif.album}"`);
      // In production, use web-push to send the notification
      // await sendPushNotification(notif.subscription, {
      //   title: `Nuova uscita di ${notif.artist}`,
      //   body: notif.album,
      //   url: `/album/${notif.albumId}`,
      // });
    }

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
