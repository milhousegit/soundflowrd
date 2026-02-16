import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const verificationToken = Deno.env.get("KOFI_VERIFICATION_TOKEN");
    if (!verificationToken) {
      console.error("KOFI_VERIFICATION_TOKEN not configured");
      return new Response(JSON.stringify({ error: "Server misconfigured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ko-fi sends data as form-encoded with a "data" field containing JSON
    const formData = await req.formData();
    const dataString = formData.get("data");

    if (!dataString) {
      return new Response(JSON.stringify({ error: "No data received" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = JSON.parse(dataString as string);
    console.log("Ko-fi webhook received:", JSON.stringify(data));

    // Verify the token
    if (data.verification_token !== verificationToken) {
      console.error("Invalid verification token");
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract email from the webhook payload
    const email = data.email;
    if (!email) {
      console.error("No email in webhook payload");
      return new Response(JSON.stringify({ error: "No email provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Processing Ko-fi payment for email: ${email}, type: ${data.type}, amount: ${data.amount}`);

    // Create Supabase admin client
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find the user by email in profiles
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, email, is_premium, premium_expires_at")
      .eq("email", email)
      .maybeSingle();

    if (profileError) {
      console.error("Error finding profile:", profileError);
      return new Response(JSON.stringify({ error: "Database error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!profile) {
      console.error(`No profile found for email: ${email}`);
      return new Response(
        JSON.stringify({ error: "User not found", email }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Calculate new premium expiration (1 year from now, or extend if already premium)
    let newExpiresAt: Date;
    if (
      profile.is_premium &&
      profile.premium_expires_at &&
      new Date(profile.premium_expires_at) > new Date()
    ) {
      // Extend from current expiration
      newExpiresAt = new Date(profile.premium_expires_at);
      newExpiresAt.setFullYear(newExpiresAt.getFullYear() + 1);
    } else {
      // Start fresh from now
      newExpiresAt = new Date();
      newExpiresAt.setFullYear(newExpiresAt.getFullYear() + 1);
    }

    // Update profile with premium status
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        is_premium: true,
        premium_expires_at: newExpiresAt.toISOString(),
        payment_pending_since: null,
      })
      .eq("id", profile.id);

    if (updateError) {
      console.error("Error updating profile:", updateError);
      return new Response(JSON.stringify({ error: "Failed to activate premium" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send in-app notification
    await supabase.from("in_app_notifications").insert({
      user_id: profile.id,
      title: "Premium Attivato! 🎉",
      message: `Il tuo Premium è stato attivato fino al ${newExpiresAt.toLocaleDateString("it-IT")}. Grazie per il supporto!`,
      type: "premium_activated",
    });

    console.log(`Premium activated for ${email} until ${newExpiresAt.toISOString()}`);

    return new Response(
      JSON.stringify({
        success: true,
        user_id: profile.id,
        premium_expires_at: newExpiresAt.toISOString(),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
