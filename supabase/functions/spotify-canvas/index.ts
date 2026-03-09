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
    if (offset >= data.length) break;
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
      const value = data.slice(offset, offset + length);
      offset += length;
      fields.push({ fieldNumber, wireType, value });
    } else if (wireType === 5) {
      offset += 4; // fixed32
    } else if (wireType === 1) {
      offset += 8; // fixed64
    } else {
      break;
    }
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
          } catch {
            // not a valid string
          }
        }
      }

      if (canvasUrl && trackUri) {
        results.push({ trackUri, canvasUrl });
      }
    }
  }
  return results;
}

// --- Spotify helpers ---
async function getSpotifyToken(): Promise<string | null> {
  try {
    console.log('Fetching Spotify token...');
    const res = await fetch('https://open.spotify.com/get_access_token?reason=transport&productType=web_player', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://open.spotify.com/',
        'Origin': 'https://open.spotify.com',
      },
    });
    console.log('Token response status:', res.status);
    if (res.ok) {
      const data = await res.json();
      if (data.accessToken) {
        console.log('Got token via get_access_token');
        return data.accessToken;
      }
      console.log('No accessToken in response');
    }

    // Fallback: extract from embed page
    console.log('Trying embed fallback...');
    const embedRes = await fetch('https://open.spotify.com/embed/track/4cOdK2wGLETKBW3PvgPWqT', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (embedRes.ok) {
      const html = await embedRes.text();
      const m = html.match(/"accessToken":"([^"]+)"/);
      if (m) {
        console.log('Got token via embed page');
        return m[1];
      }
    }

    console.error('All token methods failed');
    return null;
  } catch (err) {
    console.error('Token error:', err);
    return null;
  }
}

function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

async function searchSpotifyTrack(deezerId: string, title: string, artist: string, token: string): Promise<string | null> {
  try {
    // Step 1: Get ISRC from Deezer
    const deezerRes = await fetch(`https://api.deezer.com/track/${deezerId}`);
    if (deezerRes.ok) {
      const deezerData = await deezerRes.json();
      if (deezerData.isrc) {
        // Step 2: Search Spotify by ISRC
        const isrcQuery = encodeURIComponent(`isrc:${deezerData.isrc}`);
        const isrcRes = await fetch(`https://api.spotify.com/v1/search?q=${isrcQuery}&type=track&limit=1`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (isrcRes.ok) {
          const isrcData = await isrcRes.json();
          const uri = isrcData.tracks?.items?.[0]?.uri;
          if (uri) return uri;
        } else {
          console.log(`ISRC search returned ${isrcRes.status}`);
        }
      }
    }

    // Fallback: text search
    const cleanTitle = title.replace(/\(feat\..*?\)/gi, '').replace(/\[.*?\]/g, '').trim();
    const q = encodeURIComponent(`track:${cleanTitle} artist:${artist}`);
    const res = await fetch(`https://api.spotify.com/v1/search?q=${q}&type=track&limit=5`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (res.ok) {
      const data = await res.json();
      const items = data.tracks?.items;
      if (items?.length) {
        const normalTitle = normalizeString(cleanTitle);
        const normalArtist = normalizeString(artist);

        for (const item of items) {
          const itemTitle = normalizeString(item.name);
          const itemArtist = normalizeString(item.artists?.[0]?.name || '');
          if (itemTitle.includes(normalTitle) || normalTitle.includes(itemTitle)) {
            if (itemArtist.includes(normalArtist) || normalArtist.includes(itemArtist)) {
              return item.uri;
            }
          }
        }
        return items[0].uri;
      }
    } else {
      console.log(`Text search returned ${res.status}: ${await res.text().catch(() => 'unknown')}`);
    }

    return null;
  } catch (err) {
    console.error('Search error:', err);
    return null;
  }
}

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
      body: body,
    });

    if (!res.ok) {
      console.error(`Canvas API returned ${res.status}`);
      return result;
    }

    const responseBytes = new Uint8Array(await res.arrayBuffer());
    const canvases = extractCanvasResults(responseBytes);

    for (const c of canvases) {
      result.set(c.trackUri, c.canvasUrl);
    }
  } catch (error) {
    console.error('Error fetching canvases:', error);
  }

  return result;
}

// --- Main handler ---
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tracks } = await req.json() as {
      tracks: { deezer_id: string; title: string; artist: string }[];
    };

    if (!tracks?.length) {
      return new Response(
        JSON.stringify({ error: 'No tracks provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Limit batch size
    const batch = tracks.slice(0, 50);

    console.log(`Processing ${batch.length} tracks for canvas...`);

    // Get Spotify token
    const token = await getSpotifyToken();
    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Failed to get Spotify token' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Search Spotify for each track
    const spotifyMatches: { deezerId: string; spotifyUri: string }[] = [];
    for (const track of batch) {
      const uri = await searchSpotifyTrack(track.title, track.artist, token);
      if (uri) {
        spotifyMatches.push({ deezerId: track.deezer_id, spotifyUri: uri });
      }
      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 100));
    }

    console.log(`Found ${spotifyMatches.length}/${batch.length} Spotify matches`);

    if (spotifyMatches.length === 0) {
      return new Response(
        JSON.stringify({ results: [], found: 0, total: batch.length }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch canvases in one protobuf request
    const uris = spotifyMatches.map(m => m.spotifyUri);
    const canvasMap = await fetchCanvasUrls(uris, token);

    console.log(`Found ${canvasMap.size} canvas URLs`);

    // Build results and store in database
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const results: { deezer_id: string; canvas_url: string }[] = [];

    for (const match of spotifyMatches) {
      const canvasUrl = canvasMap.get(match.spotifyUri);
      if (canvasUrl) {
        results.push({ deezer_id: match.deezerId, canvas_url: canvasUrl });

        // Upsert into track_canvases
        await supabase
          .from('track_canvases')
          .upsert(
            { track_id: match.deezerId, canvas_url: canvasUrl, updated_at: new Date().toISOString() },
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
