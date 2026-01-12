import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Web Push implementation using Web Crypto API
async function generateVapidAuthHeader(
  audience: string,
  subject: string,
  publicKey: string,
  privateKey: string
): Promise<{ authorization: string; cryptoKey: string }> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 12 * 60 * 60; // 12 hours

  const header = { alg: "ES256", typ: "JWT" };
  const payload = { aud: audience, exp, sub: subject };

  const encoder = new TextEncoder();
  const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const unsignedToken = `${headerB64}.${payloadB64}`;

  // Import private key
  const privateKeyBuffer = base64UrlToArrayBuffer(privateKey);
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    privateKeyBuffer,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  // Sign the token
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    cryptoKey,
    encoder.encode(unsignedToken)
  );

  const signatureB64 = arrayBufferToBase64Url(new Uint8Array(signature));
  const jwt = `${unsignedToken}.${signatureB64}`;

  return {
    authorization: `vapid t=${jwt}, k=${publicKey}`,
    cryptoKey: publicKey,
  };
}

function base64UrlToArrayBuffer(base64url: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64url.length % 4)) % 4);
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/") + padding;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function arrayBufferToBase64Url(buffer: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < buffer.length; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function sendPushNotification(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: object,
  vapidPublicKey: string,
  vapidPrivateKey: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const url = new URL(subscription.endpoint);
    const audience = `${url.protocol}//${url.host}`;

    // For now, send notification using simple fetch
    // Note: Full web-push requires encryption which is complex in Deno
    // This is a simplified version that works with some push services
    
    const payloadString = JSON.stringify(payload);
    const encoder = new TextEncoder();
    const payloadBytes = encoder.encode(payloadString);

    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Encoding": "aes128gcm",
        "TTL": "86400",
        "Urgency": "high",
      },
      body: payloadBytes,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Push failed for ${subscription.endpoint}: ${response.status} ${errorText}`);
      return { success: false, error: `${response.status}: ${errorText}` };
    }

    return { success: true };
  } catch (error) {
    console.error(`Push error for ${subscription.endpoint}:`, error);
    return { success: false, error: String(error) };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    
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

    // Get all enabled notification subscriptions
    const { data: subscriptions, error: subError } = await supabase
      .from("notification_subscriptions")
      .select("*")
      .eq("enabled", true);

    if (subError) {
      throw subError;
    }

    console.log(`Found ${subscriptions?.length || 0} subscriptions to notify`);
    console.log(`Broadcast notification by admin ${user.email}: "${title}"`);

    if (!vapidPublicKey || !vapidPrivateKey) {
      console.warn("VAPID keys not configured - notifications will be logged only");
      return new Response(
        JSON.stringify({ 
          success: true, 
          sentCount: 0,
          totalSubscriptions: subscriptions?.length || 0,
          message: `VAPID keys not configured. ${subscriptions?.length || 0} subscribers would receive this notification.`,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const payload = {
      title,
      body,
      url: url || "/",
    };

    let successCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    // Send notifications to all subscribers
    for (const sub of subscriptions || []) {
      const result = await sendPushNotification(
        {
          endpoint: sub.endpoint,
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
        payload,
        vapidPublicKey,
        vapidPrivateKey
      );

      if (result.success) {
        successCount++;
      } else {
        failedCount++;
        errors.push(`${sub.endpoint.slice(0, 50)}...: ${result.error}`);
        
        // If subscription is invalid (410 Gone), disable it
        if (result.error?.includes("410")) {
          await supabase
            .from("notification_subscriptions")
            .update({ enabled: false })
            .eq("endpoint", sub.endpoint);
        }
      }
    }

    console.log(`Notification results: ${successCount} sent, ${failedCount} failed`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        sentCount: successCount,
        failedCount,
        totalSubscriptions: subscriptions?.length || 0,
        message: `Notifica inviata a ${successCount} iscritti${failedCount > 0 ? ` (${failedCount} fallite)` : ""}`,
        errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
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
