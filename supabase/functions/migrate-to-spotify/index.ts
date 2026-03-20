import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SPOTIFY_API = 'https://api.spotify.com/v1';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const DELAY_BETWEEN_REQUESTS = 350; // ms between Spotify API calls
const MAX_RETRY_AFTER = 10; // cap retry-after to 10 seconds

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt - 60_000) return cachedToken;
  const clientId = Deno.env.get('SPOTIFY_CLIENT_ID')!;
  const clientSecret = Deno.env.get('SPOTIFY_CLIENT_SECRET')!;
  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = now + data.expires_in * 1000;
  return cachedToken!;
}

async function spotifySearch(query: string, type: string, market = 'IT', retries = 2): Promise<any> {
  for (let i = 0; i <= retries; i++) {
    const token = await getAccessToken();
    const url = `${SPOTIFY_API}/search?q=${encodeURIComponent(query)}&type=${type}&limit=5&market=${market}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

    if (res.status === 401 && i < retries) {
      cachedToken = null;
      tokenExpiresAt = 0;
      continue;
    }

    if (res.status === 429) {
      const raw = parseInt(res.headers.get('Retry-After') || '3');
      const wait = Math.min(raw, MAX_RETRY_AFTER);
      console.log(`Rate limited, waiting ${wait}s (raw=${raw}s)`);
      await new Promise(r => setTimeout(r, wait * 1000));
      if (i < retries) continue;
      return null;
    }

    if (!res.ok) {
      const text = await res.text();
      console.warn(`Spotify search failed ${res.status} for "${query}": ${text.slice(0, 100)}`);
      return null;
    }

    return res.json();
  }
  return null;
}

function bestImage(images: any[]): string | undefined {
  if (!images?.length) return undefined;
  return [...images].sort((a, b) => (b.width || 0) - (a.width || 0))[0]?.url;
}

function normalize(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function isNumericId(id: string): boolean {
  return /^\d+$/.test(id);
}

async function delay(ms: number) {
  await new Promise(r => setTimeout(r, ms));
}

// Cache
const trackCache = new Map<string, any>();
const artistCache = new Map<string, any>();
const albumCache = new Map<string, any>();

async function findTrack(title: string, artist: string) {
  const key = `${normalize(title)}||${normalize(artist)}`;
  if (trackCache.has(key)) return trackCache.get(key);
  await delay(DELAY_BETWEEN_REQUESTS);

  let data = await spotifySearch(`track:"${title}" artist:"${artist}"`, 'track');
  if (!data?.tracks?.items?.length) {
    await delay(DELAY_BETWEEN_REQUESTS);
    data = await spotifySearch(`${title} ${artist}`, 'track');
  }
  if (!data?.tracks?.items?.length) { trackCache.set(key, null); return null; }

  const normalTitle = normalize(title);
  const normalArtist = normalize(artist);
  const exact = data.tracks.items.find((t: any) =>
    normalize(t.name) === normalTitle &&
    (t.artists || []).some((a: any) => normalize(a.name) === normalArtist)
  );
  const track = exact || data.tracks.items[0];
  const result = {
    id: track.id,
    coverUrl: bestImage(track.album?.images) || '',
    album: track.album?.name || '',
    albumId: track.album?.id || '',
    duration: Math.round((track.duration_ms || 0) / 1000),
  };
  trackCache.set(key, result);
  return result;
}

async function findArtist(name: string) {
  const key = normalize(name);
  if (artistCache.has(key)) return artistCache.get(key);
  await delay(DELAY_BETWEEN_REQUESTS);

  const data = await spotifySearch(name, 'artist');
  if (!data?.artists?.items?.length) { artistCache.set(key, null); return null; }

  const exact = data.artists.items.find((a: any) => normalize(a.name) === key);
  const artist = exact || data.artists.items[0];
  const result = { id: artist.id, imageUrl: bestImage(artist.images) || '' };
  artistCache.set(key, result);
  return result;
}

async function findAlbum(title: string, artist: string) {
  const key = `${normalize(title)}||${normalize(artist)}`;
  if (albumCache.has(key)) return albumCache.get(key);
  await delay(DELAY_BETWEEN_REQUESTS);

  let data = await spotifySearch(`album:"${title}" artist:"${artist}"`, 'album');
  if (!data?.albums?.items?.length) {
    await delay(DELAY_BETWEEN_REQUESTS);
    data = await spotifySearch(`${title} ${artist}`, 'album');
  }
  if (!data?.albums?.items?.length) { albumCache.set(key, null); return null; }

  const normalTitle = normalize(title);
  const normalArtist = normalize(artist);
  const exact = data.albums.items.find((a: any) =>
    normalize(a.name) === normalTitle &&
    (a.artists || []).some((ar: any) => normalize(ar.name) === normalArtist)
  );
  const album = exact || data.albums.items[0];
  const result = { id: album.id, coverUrl: bestImage(album.images) || '' };
  albumCache.set(key, result);
  return result;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const { table, offset: startOffset = 0, limit: batchLimit = 50 } = await req.json().catch(() => ({}));

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sb = createClient(supabaseUrl, supabaseKey);

  const stats = { total: 0, migrated: 0, failed: 0, skipped: 0, failedItems: [] as string[] };

  try {
    const targetTable = table || 'favorites_tracks';

    if (targetTable === 'favorites_tracks') {
      const { data: rows } = await sb.from('favorites').select('id, item_id, item_title, item_artist').eq('item_type', 'track').order('created_at');
      const toMigrate = (rows || []).filter(r => isNumericId(r.item_id)).slice(startOffset, startOffset + batchLimit);
      for (const row of toMigrate) {
        stats.total++;
        const sp = await findTrack(row.item_title, row.item_artist || '');
        if (sp) {
          await sb.from('favorites').update({ item_id: sp.id, item_cover_url: sp.coverUrl }).eq('id', row.id);
          stats.migrated++;
        } else {
          stats.failed++;
          stats.failedItems.push(`${row.item_title} - ${row.item_artist}`);
        }
      }
    } else if (targetTable === 'favorites_artists') {
      const { data: rows } = await sb.from('favorites').select('id, item_id, item_title').eq('item_type', 'artist').order('created_at');
      const toMigrate = (rows || []).filter(r => isNumericId(r.item_id)).slice(startOffset, startOffset + batchLimit);
      for (const row of toMigrate) {
        stats.total++;
        const sp = await findArtist(row.item_title);
        if (sp) {
          await sb.from('favorites').update({ item_id: sp.id, item_cover_url: sp.imageUrl }).eq('id', row.id);
          stats.migrated++;
        } else {
          stats.failed++;
          stats.failedItems.push(row.item_title);
        }
      }
    } else if (targetTable === 'favorites_albums') {
      const { data: rows } = await sb.from('favorites').select('id, item_id, item_title, item_artist').eq('item_type', 'album').order('created_at');
      const toMigrate = (rows || []).filter(r => isNumericId(r.item_id)).slice(startOffset, startOffset + batchLimit);
      for (const row of toMigrate) {
        stats.total++;
        const sp = await findAlbum(row.item_title, row.item_artist || '');
        if (sp) {
          await sb.from('favorites').update({ item_id: sp.id, item_cover_url: sp.coverUrl }).eq('id', row.id);
          stats.migrated++;
        } else {
          stats.failed++;
          stats.failedItems.push(`${row.item_title} - ${row.item_artist}`);
        }
      }
    } else if (targetTable === 'playlist_tracks') {
      const { data: rows } = await sb.from('playlist_tracks').select('id, track_id, track_title, track_artist').order('added_at');
      const toMigrate = (rows || []).filter(r => isNumericId(r.track_id)).slice(startOffset, startOffset + batchLimit);
      for (const row of toMigrate) {
        stats.total++;
        const sp = await findTrack(row.track_title, row.track_artist);
        if (sp) {
          await sb.from('playlist_tracks').update({ track_id: sp.id, track_cover_url: sp.coverUrl, track_album: sp.album, track_album_id: sp.albumId, track_duration: sp.duration }).eq('id', row.id);
          stats.migrated++;
        } else {
          stats.failed++;
          stats.failedItems.push(`${row.track_title} - ${row.track_artist}`);
        }
      }
    } else if (targetTable === 'user_track_stats') {
      const { data: rows } = await sb.from('user_track_stats').select('id, track_id, track_title, track_artist, artist_id').order('created_at');
      const toMigrate = (rows || []).filter(r => isNumericId(r.track_id)).slice(startOffset, startOffset + batchLimit);
      for (const row of toMigrate) {
        stats.total++;
        const sp = await findTrack(row.track_title, row.track_artist);
        const artSp = row.artist_id && isNumericId(row.artist_id) ? await findArtist(row.track_artist) : null;
        if (sp) {
          const upd: any = { track_id: sp.id, track_cover_url: sp.coverUrl, track_album: sp.album, track_album_id: sp.albumId, track_duration: sp.duration };
          if (artSp) upd.artist_id = artSp.id;
          await sb.from('user_track_stats').update(upd).eq('id', row.id);
          stats.migrated++;
        } else { stats.failed++; }
      }
    } else if (targetTable === 'user_artist_stats') {
      const { data: rows } = await sb.from('user_artist_stats').select('id, artist_id, artist_name').order('created_at');
      const toMigrate = (rows || []).filter(r => isNumericId(r.artist_id)).slice(startOffset, startOffset + batchLimit);
      for (const row of toMigrate) {
        stats.total++;
        const sp = await findArtist(row.artist_name);
        if (sp) {
          await sb.from('user_artist_stats').update({ artist_id: sp.id, artist_image_url: sp.imageUrl }).eq('id', row.id);
          stats.migrated++;
        } else { stats.failed++; stats.failedItems.push(row.artist_name); }
      }
    } else if (targetTable === 'recently_played') {
      const { data: rows } = await sb.from('recently_played').select('id, track_id, track_title, track_artist, artist_id').order('played_at');
      const toMigrate = (rows || []).filter(r => isNumericId(r.track_id)).slice(startOffset, startOffset + batchLimit);
      for (const row of toMigrate) {
        stats.total++;
        const sp = await findTrack(row.track_title, row.track_artist);
        const artSp = row.artist_id && isNumericId(row.artist_id) ? await findArtist(row.track_artist) : null;
        if (sp) {
          const upd: any = { track_id: sp.id, track_cover_url: sp.coverUrl, track_album: sp.album, track_album_id: sp.albumId, track_duration: sp.duration };
          if (artSp) upd.artist_id = artSp.id;
          await sb.from('recently_played').update(upd).eq('id', row.id);
          stats.migrated++;
        } else { stats.failed++; }
      }
    } else if (targetTable === 'album_likes') {
      const { data: rows } = await sb.from('album_likes').select('id, album_id, album_title, album_artist').order('created_at');
      const toMigrate = (rows || []).filter(r => isNumericId(r.album_id)).slice(startOffset, startOffset + batchLimit);
      for (const row of toMigrate) {
        stats.total++;
        const sp = await findAlbum(row.album_title, row.album_artist);
        if (sp) {
          await sb.from('album_likes').update({ album_id: sp.id, album_cover_url: sp.coverUrl }).eq('id', row.id);
          stats.migrated++;
        } else { stats.failed++; }
      }
    }

    console.log(`Migration batch done: table=${targetTable}, offset=${startOffset}`, JSON.stringify(stats));

    return new Response(JSON.stringify({ success: true, table: targetTable, offset: startOffset, stats }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Migration error:', error);
    return new Response(JSON.stringify({ error: String(error), stats }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});