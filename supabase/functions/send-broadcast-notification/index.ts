import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Base64URL encode/decode utilities
function base64UrlEncode(data: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...data));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  const binary = atob(base64);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

// Generate VAPID keys
async function generateVAPIDKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
  
  const publicKeyRaw = await crypto.subtle.exportKey("raw", keyPair.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
  
  return {
    publicKey: base64UrlEncode(new Uint8Array(publicKeyRaw)),
    privateKey: JSON.stringify(privateKeyJwk),
  };
}

// Create VAPID JWT token
async function createVapidJwt(
  audience: string,
  subject: string,
  privateKeyJwk: JsonWebKey
): Promise<string> {
  const header = { typ: "JWT", alg: "ES256" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: audience,
    exp: now + 12 * 60 * 60, // 12 hours
    sub: subject,
  };

  const encoder = new TextEncoder();
  const headerB64 = base64UrlEncode(encoder.encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const unsignedToken = `${headerB64}.${payloadB64}`;

  const privateKey = await crypto.subtle.importKey(
    "jwk",
    privateKeyJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    encoder.encode(unsignedToken)
  );

  // Convert DER signature to raw format (P-256 signatures are 64 bytes)
  const signatureArray = new Uint8Array(signature);
  const signatureB64 = base64UrlEncode(signatureArray);

  return `${unsignedToken}.${signatureB64}`;
}

// Encrypt push payload using Web Crypto
async function encryptPayload(
  payload: string,
  p256dhKey: string,
  authSecret: string
): Promise<{ ciphertext: Uint8Array; salt: Uint8Array; publicKey: Uint8Array }> {
  const encoder = new TextEncoder();
  const payloadBytes = encoder.encode(payload);
  
  // Generate ephemeral key pair
  const localKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );
  
  // Import subscriber's public key
  const subscriberKeyBytes = base64UrlDecode(p256dhKey);
  const subscriberKey = await crypto.subtle.importKey(
    "raw",
    subscriberKeyBytes.buffer as ArrayBuffer,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );
  
  // Derive shared secret
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: "ECDH", public: subscriberKey },
    localKeyPair.privateKey,
    256
  );
  
  // Export local public key
  const localPublicKey = await crypto.subtle.exportKey("raw", localKeyPair.publicKey);
  const localPublicKeyBytes = new Uint8Array(localPublicKey);
  
  // Import auth secret
  const authSecretBytes = base64UrlDecode(authSecret);
  
  // Generate salt
  const salt = crypto.getRandomValues(new Uint8Array(16));
  
  // Derive shared secret key for HKDF
  const sharedSecretKey = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(sharedSecret).buffer as ArrayBuffer,
    "HKDF",
    false,
    ["deriveBits", "deriveKey"]
  );
  
  // Create info for HKDF
  const prkInfo = new Uint8Array([
    ...encoder.encode("WebPush: info\0"),
    ...subscriberKeyBytes,
    ...localPublicKeyBytes,
  ]);
  
  // Derive IKM
  const ikm = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: authSecretBytes.buffer as ArrayBuffer,
      info: prkInfo,
    },
    sharedSecretKey,
    256
  );
  
  // Derive content encryption key and nonce
  const ikmKey = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(ikm).buffer as ArrayBuffer,
    "HKDF",
    false,
    ["deriveBits", "deriveKey"]
  );
  
  const cekInfo = encoder.encode("Content-Encoding: aes128gcm\0");
  const nonceInfo = encoder.encode("Content-Encoding: nonce\0");
  
  const cek = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: salt.buffer as ArrayBuffer,
      info: cekInfo,
    },
    ikmKey,
    { name: "AES-GCM", length: 128 },
    false,
    ["encrypt"]
  );
  
  const nonce = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: salt.buffer as ArrayBuffer,
      info: nonceInfo,
    },
    ikmKey,
    96 // 12 bytes
  );
  
  // Add padding delimiter
  const paddedPayload = new Uint8Array(payloadBytes.length + 1);
  paddedPayload.set(payloadBytes);
  paddedPayload[payloadBytes.length] = 2; // Padding delimiter
  
  // Encrypt
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: new Uint8Array(nonce),
    },
    cek,
    paddedPayload
  );
  
  return {
    ciphertext: new Uint8Array(ciphertext),
    salt,
    publicKey: localPublicKeyBytes,
  };
}

// Build aes128gcm encrypted body
function buildEncryptedBody(
  salt: Uint8Array,
  publicKey: Uint8Array,
  ciphertext: Uint8Array
): ArrayBuffer {
  // aes128gcm header: salt (16) + rs (4) + idlen (1) + keyid (65)
  const rs = 4096;
  const header = new Uint8Array(16 + 4 + 1 + publicKey.length);
  header.set(salt, 0);
  header[16] = (rs >> 24) & 0xff;
  header[17] = (rs >> 16) & 0xff;
  header[18] = (rs >> 8) & 0xff;
  header[19] = rs & 0xff;
  header[20] = publicKey.length;
  header.set(publicKey, 21);
  
  const body = new Uint8Array(header.length + ciphertext.length);
  body.set(header, 0);
  body.set(ciphertext, header.length);
  
  return body.buffer as ArrayBuffer;
}

async function sendPushNotification(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: object,
  vapidPublicKey: string,
  vapidPrivateKeyJwk: JsonWebKey,
  vapidSubject: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const url = new URL(subscription.endpoint);
    const audience = `${url.protocol}//${url.host}`;
    
    const payloadString = JSON.stringify(payload);
    console.log(`Encrypting payload for: ${subscription.endpoint.slice(0, 60)}...`);
    
    // Encrypt the payload
    const { ciphertext, salt, publicKey } = await encryptPayload(
      payloadString,
      subscription.p256dh,
      subscription.auth
    );
    
    const body = buildEncryptedBody(salt, publicKey, ciphertext);
    
    // Create VAPID JWT
    const jwt = await createVapidJwt(audience, vapidSubject, vapidPrivateKeyJwk);
    
    const headers: Record<string, string> = {
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      "Content-Length": body.byteLength.toString(),
      "TTL": "86400",
      "Urgency": "high",
      "Authorization": `vapid t=${jwt}, k=${vapidPublicKey}`,
    };
    
    console.log(`Sending push to: ${subscription.endpoint.slice(0, 60)}...`);
    
    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers,
      body,
    });

    if (response.ok || response.status === 201) {
      console.log(`Push succeeded for ${subscription.endpoint.slice(0, 60)}...`);
      return { success: true };
    } else {
      const errorText = await response.text();
      console.error(`Push failed for ${subscription.endpoint}: ${response.status} ${errorText}`);
      return { success: false, error: `${response.status}: ${errorText}` };
    }
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
    const vapidPrivateKeyRaw = Deno.env.get("VAPID_PRIVATE_KEY");
    
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

    const { title, body, url, action } = await req.json();

    // Special action to generate new VAPID keys
    if (action === "generate-vapid-keys") {
      console.log("Generating new VAPID keys...");
      const keys = await generateVAPIDKeys();
      return new Response(
        JSON.stringify({ 
          success: true, 
          publicKey: keys.publicKey,
          privateKey: keys.privateKey,
          message: "Chiavi VAPID generate! Copia questi valori nei secrets VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY.",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

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

    if (!vapidPublicKey || !vapidPrivateKeyRaw) {
      console.warn("VAPID keys not configured");
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Chiavi VAPID non configurate. Usa action='generate-vapid-keys' per generarle.",
          totalSubscriptions: subCount,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (subCount === 0) {
      console.log("No subscriptions found.");
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

    // Parse the private key JWK
    let vapidPrivateKeyJwk: JsonWebKey;
    try {
      vapidPrivateKeyJwk = JSON.parse(vapidPrivateKeyRaw);
    } catch (e) {
      console.error("Failed to parse VAPID_PRIVATE_KEY as JWK:", e);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "VAPID_PRIVATE_KEY non è in formato JWK valido. Rigenera le chiavi con action='generate-vapid-keys'.",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const notificationPayload = {
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
        notificationPayload,
        vapidPublicKey,
        vapidPrivateKeyJwk,
        `mailto:${user.email}`
      );

      if (result.success) {
        successCount++;
      } else {
        failedCount++;
        errors.push(result.error || "Unknown error");
        
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
        message: successCount > 0 
          ? `Notifica inviata a ${successCount} iscritti${failedCount > 0 ? ` (${failedCount} fallite)` : ""}`
          : `Invio fallito. Prova a rigenerare le chiavi VAPID.`,
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
