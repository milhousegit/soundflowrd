import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Convert base64url to Uint8Array
function base64UrlToUint8Array(base64url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64url.length % 4)) % 4);
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/") + padding;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Convert Uint8Array to base64url
function uint8ArrayToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

// Generate VAPID JWT token
async function generateVapidJwt(
  audience: string,
  subject: string,
  privateKeyBase64: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 12 * 60 * 60; // 12 hours

  const header = { alg: "ES256", typ: "JWT" };
  const payload = { aud: audience, exp, sub: subject };

  const encoder = new TextEncoder();
  const headerB64 = uint8ArrayToBase64Url(encoder.encode(JSON.stringify(header)));
  const payloadB64 = uint8ArrayToBase64Url(encoder.encode(JSON.stringify(payload)));

  const unsignedToken = `${headerB64}.${payloadB64}`;

  // The private key needs to be in JWK format for Web Crypto
  // Convert raw private key to proper format
  const privateKeyBytes = base64UrlToUint8Array(privateKeyBase64);
  
  // Create JWK for P-256 curve
  const jwk = {
    kty: "EC",
    crv: "P-256",
    d: privateKeyBase64,
    x: "", // Will be derived
    y: "", // Will be derived
  };

  try {
    // Try importing as raw key (32 bytes for P-256 private key)
    const cryptoKey = await crypto.subtle.importKey(
      "jwk",
      {
        kty: "EC",
        crv: "P-256",
        d: privateKeyBase64,
        x: "placeholder", // These will be ignored for signing
        y: "placeholder",
      },
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"]
    );

    const signature = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      cryptoKey,
      encoder.encode(unsignedToken)
    );

    // Convert DER signature to raw format (64 bytes for P-256)
    const signatureBytes = new Uint8Array(signature);
    const signatureB64 = uint8ArrayToBase64Url(signatureBytes);

    return `${unsignedToken}.${signatureB64}`;
  } catch (e) {
    console.error("Failed to generate VAPID JWT:", e);
    throw e;
  }
}

async function sendPushNotification(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: object,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  vapidSubject: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const url = new URL(subscription.endpoint);
    const audience = `${url.protocol}//${url.host}`;
    
    const payloadString = JSON.stringify(payload);
    
    console.log(`Sending push to: ${subscription.endpoint.slice(0, 60)}...`);
    
    // For FCM and other push services, we need proper VAPID authentication
    // Build the authorization header
    const vapidHeader = `vapid t=eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9, k=${vapidPublicKey}`;
    
    // Note: Full web push requires payload encryption with ECDH
    // For now, we'll try a simpler approach using the FCM HTTP v1 API format
    
    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "TTL": "86400",
        "Urgency": "high",
        "Authorization": `key=${vapidPrivateKey}`,
        "Crypto-Key": `p256ecdsa=${vapidPublicKey}`,
      },
      body: payloadString,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Push failed for ${subscription.endpoint}: ${response.status} ${errorText}`);
      return { success: false, error: `${response.status}: ${errorText}` };
    }

    console.log(`Push succeeded for ${subscription.endpoint.slice(0, 60)}...`);
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

    const subCount = subscriptions?.length || 0;
    console.log(`Found ${subCount} subscriptions to notify`);
    console.log(`Broadcast notification by admin ${user.email}: "${title}"`);

    if (!vapidPublicKey || !vapidPrivateKey) {
      console.warn("VAPID keys not configured - notifications will be logged only");
      return new Response(
        JSON.stringify({ 
          success: true, 
          sentCount: 0,
          totalSubscriptions: subCount,
          message: `VAPID keys not configured. ${subCount} subscribers would receive this notification.`,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // For testing: if no subscriptions found but user wants to test, 
    // we can create a mock response
    if (subCount === 0) {
      console.log("No subscriptions found. Make sure users have enabled notifications.");
      return new Response(
        JSON.stringify({ 
          success: true, 
          sentCount: 0,
          failedCount: 0,
          totalSubscriptions: 0,
          message: "Nessun iscritto alle notifiche. Gli utenti devono abilitare le notifiche dalla pagina Impostazioni.",
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
      icon: "/icon-192.png",
      badge: "/icon-192.png",
    };

    let successCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    // Send notifications to all subscribers
    for (const sub of subscriptions || []) {
      console.log(`Processing subscription for user: ${sub.user_id}`);
      
      const result = await sendPushNotification(
        {
          endpoint: sub.endpoint,
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
        payload,
        vapidPublicKey,
        vapidPrivateKey,
        `mailto:${user.email}`
      );

      if (result.success) {
        successCount++;
      } else {
        failedCount++;
        errors.push(`${sub.endpoint.slice(0, 50)}...: ${result.error}`);
        
        // If subscription is invalid (410 Gone or 404), disable it
        if (result.error?.includes("410") || result.error?.includes("404")) {
          console.log(`Disabling invalid subscription: ${sub.endpoint.slice(0, 50)}...`);
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
        totalSubscriptions: subCount,
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
