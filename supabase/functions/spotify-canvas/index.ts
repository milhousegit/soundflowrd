const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// --- Protobuf helpers ---
function encodeVarint(value: number): number[] {
  const result: number[] = [];
  while (value > 0x7F) {
    result.push((value & 0x7F) | 0x80);
    value >>>= 7;
  }
  result.push(value & 0x7F);
  return result;
}

function encodeStringField(fieldNumber: number, value: string): number[] {
  const bytes = new TextEncoder().encode(value);
  const tag = (fieldNumber << 3) | 2;
  return [...encodeVarint(tag), ...encodeVarint(bytes.length), ...bytes];
}

function encodeMessageField(fieldNumber: number, content: number[]): number[] {
  const tag = (fieldNumber << 3) | 2;
  return [...encodeVarint(tag), ...encodeVarint(content.length), ...content];
}

function encodeCanvasRequest(trackUris: string[]): Uint8Array {
  const parts: number[] = [];
  for (const uri of trackUris) {
    const entity = encodeStringField(1, uri);
    parts.push(...encodeMessageField(1, entity));
  }
  return new Uint8Array(parts);
}

function readVarint(data: Uint8Array, offset: number): [number, number] {
  let result = 0;
  let shift = 0;
  let len = 0;
  while (offset + len < data.length) {
    const byte = data[offset + len];
    result |= (byte & 0x7F) << shift;
    len++;
    if ((byte & 0x80) === 0) break;
    shift += 7;
  }
  return [result, len];
}

interface ProtoField {
  fieldNumber: number;
  wireType: number;
  value: Uint8Array | number;
}

function decodeProtobuf(data: Uint8Array): ProtoField[] {
  const fields: ProtoField[] = [];
  let offset = 0;
  while (offset < data.length) {
    const [tag, tagLen] = readVarint(data, offset);
    if (tagLen === 0) break;
    offset += tagLen;
    const fieldNumber = tag >> 3;
    const wireType = tag & 0x07;
    if (wireType === 0) {
      const [value, len] = readVarint(data, offset);
      offset += len;
      fields.push({ fieldNumber, wireType, value });
    } else if (wireType === 2) {
      const [length, lenLen] = readVarint(data, offset);
      offset += lenLen;
      if (offset + length > data.length) break;
      fields.push({ fieldNumber, wireType, value: data.slice(offset, offset + length) });
      offset += length;
    } else if (wireType === 5) { offset += 4; }
    else if (wireType === 1) { offset += 8; }
    else break;
  }
  return fields;
}

function extractCanvasResults(data: Uint8Array): { trackUri: string; canvasUrl: string }[] {
  const results: { trackUri: string; canvasUrl: string }[] = [];
  const topFields = decodeProtobuf(data);
  for (const field of topFields) {
    if (field.fieldNumber === 1 && field.wireType === 2) {
      const canvasFields = decodeProtobuf(field.value as Uint8Array);
      let canvasUrl = '';
      let trackUri = '';
      for (const cf of canvasFields) {
        if (cf.wireType === 2) {
          try {
            const strValue = new TextDecoder().decode(cf.value as Uint8Array);
            if (cf.fieldNumber === 2 && (strValue.includes('canvaz.scdn.co') || strValue.includes('.mp4'))) {
              canvasUrl = strValue;
            }
            if (cf.fieldNumber === 5 && strValue.startsWith('spotify:track:')) {
              trackUri = strValue;
            }
          } catch { /* not a valid string */ }
        }
      }
      if (canvasUrl && trackUri) results.push({ trackUri, canvasUrl });
    }
  }
  return results;
}

// --- Spotify token (anonymous) ---
async function getSpotifyToken(): Promise<string | null> {
  try {
    const res = await fetch('https://open.spotify.com/get_access_token?reason=transport&productType=web_player', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://open.spotify.com/',
      },
    });
    if (res.ok) {
      const data = await res.json();
      if (data.accessToken) return data.accessToken;
    }
    // Fallback: embed page
    const embedRes = await fetch('https://open.spotify.com/embed/track/4cOdK2wGLETKBW3PvgPWqT', {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html' },
    });
    if (embedRes.ok) {
      const html = await embedRes.text();
      const m = html.match(/"accessToken":"([^"]+)"/);
      if (m) return m[1];
    }
    return null;
  } catch { return null; }
}

// --- Main handler ---
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json() as {
      tracks: { id: string; title: string; artist: string }[];
    };

    const tracks = body.tracks;
    if (!tracks?.length) {
      return new Response(
        JSON.stringify({ error: 'No tracks provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const batch = tracks.slice(0, 10);
    console.log(`Processing ${batch.length} tracks for canvas...`);

    const token = await getSpotifyToken();
    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Failed to get Spotify token' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build Spotify URIs directly from track IDs (already Spotify IDs)
    const trackUris = batch.map(t => `spotify:track:${t.id}`);

    // Fetch canvases in one protobuf request
    const canvasMap = await fetchCanvasUrls(trackUris, token);
    console.log(`Found ${canvasMap.size} canvas URLs`);

    // Store results in database
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const results: { track_id: string; canvas_url: string }[] = [];

    for (const track of batch) {
      const uri = `spotify:track:${track.id}`;
      const canvasUrl = canvasMap.get(uri);
      if (canvasUrl) {
        results.push({ track_id: track.id, canvas_url: canvasUrl });
        await supabase.from('track_canvases').upsert(
          { track_id: track.id, canvas_url: canvasUrl, updated_at: new Date().toISOString() },
          { onConflict: 'track_id' }
        );
      }
    }

    return new Response(
      JSON.stringify({ results, found: results.length, total: batch.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in spotify-canvas:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function fetchCanvasUrls(trackUris: string[], token: string): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  try {
    const body = encodeCanvasRequest(trackUris);
    const res = await fetch('https://spclient.wg.spotify.com/canvaz-cache/v0/canvases', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/x-protobuf',
        'Accept': 'application/protobuf',
      },
      body,
    });
    if (!res.ok) { console.error(`Canvas API returned ${res.status}`); return result; }
    const responseBytes = new Uint8Array(await res.arrayBuffer());
    for (const c of extractCanvasResults(responseBytes)) {
      result.set(c.trackUri, c.canvasUrl);
    }
  } catch (error) { console.error('Error fetching canvases:', error); }
  return result;
}
