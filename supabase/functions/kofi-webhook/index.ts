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

    // Try to find user email: first from Ko-fi email, then from "from_name" field
    // (users are instructed to put their app email in the "Name" field)
    const kofiEmail = data.email;
    const fromName = data.from_name?.trim();
    const isSubscription = data.is_subscription_payment === true;
    const isFirstSub = data.is_first_subscription_payment === true;

    console.log(`Ko-fi payment: email=${kofiEmail}, from_name=${fromName}, type=${data.type}, subscription=${isSubscription}, firstSub=${isFirstSub}, amount=${data.amount}`);

    // Create Supabase admin client
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Try to find user by email first, then by from_name (which should contain their app email)
    let profile = null;
    let profileError = null;

    // Strategy 1: match Ko-fi email
    if (kofiEmail) {
      const result = await supabase
        .from("profiles")
        .select("id, email, is_premium, premium_expires_at")
        .eq("email", kofiEmail)
        .maybeSingle();
      profile = result.data;
      profileError = result.error;
    }

    // Strategy 2: from_name might be the user's app email
    if (!profile && fromName && fromName.includes("@")) {
      const result = await supabase
        .from("profiles")
        .select("id, email, is_premium, premium_expires_at")
        .eq("email", fromName.toLowerCase())
        .maybeSingle();
      profile = result.data;
      profileError = result.error;
    }

    if (profileError) {
      console.error("Error finding profile:", profileError);
      return new Response(JSON.stringify({ error: "Database error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!profile) {
      console.error(`No profile found for email: ${kofiEmail}, from_name: ${fromName}`);
      return new Response(
        JSON.stringify({ error: "User not found", email: kofiEmail, from_name: fromName }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Calculate premium duration based on payment type
    let newExpiresAt: Date;
    const now = new Date();

    if (isSubscription) {
      // Monthly subscription: premium for 1 month
      // If already premium and not expired, extend from current expiry
      if (
        profile.is_premium &&
        profile.premium_expires_at &&
        new Date(profile.premium_expires_at) > now
      ) {
        newExpiresAt = new Date(profile.premium_expires_at);
        newExpiresAt.setMonth(newExpiresAt.getMonth() + 1);
      } else {
        newExpiresAt = new Date(now);
        newExpiresAt.setMonth(newExpiresAt.getMonth() + 1);
      }
    } else {
      // One-time donation: premium for 1 year
      if (
        profile.is_premium &&
        profile.premium_expires_at &&
        new Date(profile.premium_expires_at) > now
      ) {
        newExpiresAt = new Date(profile.premium_expires_at);
        newExpiresAt.setFullYear(newExpiresAt.getFullYear() + 1);
      } else {
        newExpiresAt = new Date(now);
        newExpiresAt.setFullYear(newExpiresAt.getFullYear() + 1);
      }
    }

    const durationLabel = isSubscription ? "1 mese" : "1 anno";

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
      message: `Il tuo Premium è stato attivato per ${durationLabel} (fino al ${newExpiresAt.toLocaleDateString("it-IT")}). Grazie per il supporto!`,
      type: "premium_activated",
    });

    console.log(`Premium activated for ${profile.email} (${durationLabel}) until ${newExpiresAt.toISOString()}`);

    return new Response(
      JSON.stringify({
        success: true,
        user_id: profile.id,
        premium_expires_at: newExpiresAt.toISOString(),
        duration: durationLabel,
        is_subscription: isSubscription,
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
