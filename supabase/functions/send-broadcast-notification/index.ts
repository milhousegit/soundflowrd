import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get auth user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user is admin
    const { data: roleData, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .single();

    if (roleError || !roleData) {
      return new Response(JSON.stringify({ error: "Forbidden - Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { title, body, url } = await req.json();

    if (!title || !body) {
      return new Response(JSON.stringify({ error: "Title and body are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Admin ${user.email} sending in-app notification: "${title}"`);

    // Get all user profiles to send in-app notifications
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id");

    if (profilesError) {
      throw profilesError;
    }

    const userCount = profiles?.length || 0;
    console.log(`Sending in-app notification to ${userCount} users`);

    if (userCount === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          sentCount: 0,
          message: "Nessun utente trovato.",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Insert notification for each user
    const notifications = profiles!.map((profile) => ({
      user_id: profile.id,
      type: 'admin_broadcast',
      title,
      message: body,
      data: url ? { url } : null,
      read: false,
    }));

    const { error: insertError } = await supabase
      .from("in_app_notifications")
      .insert(notifications);

    if (insertError) {
      console.error("Failed to insert notifications:", insertError);
      throw insertError;
    }

    console.log(`Successfully sent ${userCount} in-app notifications`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        sentCount: userCount,
        message: `Notifica inviata a ${userCount} utenti`,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    console.error("Error in send-broadcast-notification:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
