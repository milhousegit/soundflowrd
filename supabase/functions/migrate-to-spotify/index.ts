import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SPOTIFY_API = 'https://api.spotify.com/v1';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';

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

async function spotifySearch(query: string, type: string, market = 'IT'): Promise<any> {
  const token = await getAccessToken();
  const url = `${SPOTIFY_API}/search?q=${encodeURIComponent(query)}&type=${type}&limit=5&market=${market}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('Retry-After') || '5');
    console.log(`Rate limited, waiting ${retryAfter}s`);
    await new Promise(r => setTimeout(r, retryAfter * 1000));
    return spotifySearch(query, type, market);
  }

  if (!res.ok) {
    console.warn(`Spotify search failed ${res.status} for "${query}"`);
    return null;
  }

  return res.json();
}

function bestImage(images: any[]): string | undefined {
  if (!images?.length) return undefined;
  return [...images].sort((a, b) => (b.width || 0) - (a.width || 0))[0]?.url;
}

function normalize(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

async function findSpotifyTrack(title: string, artist: string): Promise<{ id: string; coverUrl: string; album: string; albumId: string; duration: number } | null> {
  const query = `track:"${title}" artist:"${artist}"`;
  const data = await spotifySearch(query, 'track');
  if (!data?.tracks?.items?.length) {
    // Fallback: simpler search
    const data2 = await spotifySearch(`${title} ${artist}`, 'track');
    if (!data2?.tracks?.items?.length) return null;
    const track = data2.tracks.items[0];
    return {
      id: track.id,
      coverUrl: bestImage(track.album?.images) || '',
      album: track.album?.name || '',
      albumId: track.album?.id || '',
      duration: Math.round((track.duration_ms || 0) / 1000),
    };
  }

  // Try exact match first
  const normalTitle = normalize(title);
  const normalArtist = normalize(artist);
  const exact = data.tracks.items.find((t: any) =>
    normalize(t.name) === normalTitle &&
    (t.artists || []).some((a: any) => normalize(a.name) === normalArtist)
  );

  const track = exact || data.tracks.items[0];
  return {
    id: track.id,
    coverUrl: bestImage(track.album?.images) || '',
    album: track.album?.name || '',
    albumId: track.album?.id || '',
    duration: Math.round((track.duration_ms || 0) / 1000),
  };
}

async function findSpotifyArtist(name: string): Promise<{ id: string; imageUrl: string } | null> {
  const data = await spotifySearch(name, 'artist');
  if (!data?.artists?.items?.length) return null;

  const normalName = normalize(name);
  const exact = data.artists.items.find((a: any) => normalize(a.name) === normalName);
  const artist = exact || data.artists.items[0];

  return {
    id: artist.id,
    imageUrl: bestImage(artist.images) || '',
  };
}

async function findSpotifyAlbum(title: string, artist: string): Promise<{ id: string; coverUrl: string } | null> {
  const query = `album:"${title}" artist:"${artist}"`;
  const data = await spotifySearch(query, 'album');
  if (!data?.albums?.items?.length) {
    const data2 = await spotifySearch(`${title} ${artist}`, 'album');
    if (!data2?.albums?.items?.length) return null;
    const album = data2.albums.items[0];
    return { id: album.id, coverUrl: bestImage(album.images) || '' };
  }

  const normalTitle = normalize(title);
  const normalArtist = normalize(artist);
  const exact = data.albums.items.find((a: any) =>
    normalize(a.name) === normalTitle &&
    (a.artists || []).some((ar: any) => normalize(ar.name) === normalArtist)
  );
  const album = exact || data.albums.items[0];
  return { id: album.id, coverUrl: bestImage(album.images) || '' };
}

function isNumericId(id: string): boolean {
  return /^\d+$/.test(id);
}

async function delay(ms: number) {
  await new Promise(r => setTimeout(r, ms));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sb = createClient(supabaseUrl, supabaseKey);

  const stats = {
    favorites_tracks: { total: 0, migrated: 0, failed: 0 },
    favorites_artists: { total: 0, migrated: 0, failed: 0 },
    favorites_albums: { total: 0, migrated: 0, failed: 0 },
    playlist_tracks: { total: 0, migrated: 0, failed: 0 },
    user_track_stats: { total: 0, migrated: 0, failed: 0 },
    user_artist_stats: { total: 0, migrated: 0, failed: 0 },
    recently_played: { total: 0, migrated: 0, failed: 0 },
    album_likes: { total: 0, migrated: 0, failed: 0 },
  };

  // Cache lookups to avoid duplicate Spotify searches
  const trackCache = new Map<string, { id: string; coverUrl: string; album: string; albumId: string; duration: number } | null>();
  const artistCache = new Map<string, { id: string; imageUrl: string } | null>();
  const albumCache = new Map<string, { id: string; coverUrl: string } | null>();

  async function resolveTrack(title: string, artist: string) {
    const key = `${normalize(title)}||${normalize(artist)}`;
    if (trackCache.has(key)) return trackCache.get(key)!;
    await delay(200); // Rate limit protection
    const result = await findSpotifyTrack(title, artist);
    trackCache.set(key, result);
    return result;
  }

  async function resolveArtist(name: string) {
    const key = normalize(name);
    if (artistCache.has(key)) return artistCache.get(key)!;
    await delay(200);
    const result = await findSpotifyArtist(name);
    artistCache.set(key, result);
    return result;
  }

  async function resolveAlbum(title: string, artist: string) {
    const key = `${normalize(title)}||${normalize(artist)}`;
    if (albumCache.has(key)) return albumCache.get(key)!;
    await delay(200);
    const result = await findSpotifyAlbum(title, artist);
    albumCache.set(key, result);
    return result;
  }

  try {
    // ========== 1. FAVORITES - TRACKS ==========
    console.log('Migrating favorites tracks...');
    const { data: favTracks } = await sb.from('favorites').select('id, item_id, item_title, item_artist').eq('item_type', 'track');
    for (const fav of (favTracks || []).filter(f => isNumericId(f.item_id))) {
      stats.favorites_tracks.total++;
      const spotify = await resolveTrack(fav.item_title, fav.item_artist || '');
      if (spotify) {
        await sb.from('favorites').update({
          item_id: spotify.id,
          item_cover_url: spotify.coverUrl,
        }).eq('id', fav.id);
        stats.favorites_tracks.migrated++;
      } else {
        stats.favorites_tracks.failed++;
        console.warn(`Track not found: "${fav.item_title}" by "${fav.item_artist}"`);
      }
    }

    // ========== 2. FAVORITES - ARTISTS ==========
    console.log('Migrating favorites artists...');
    const { data: favArtists } = await sb.from('favorites').select('id, item_id, item_title').eq('item_type', 'artist');
    for (const fav of (favArtists || []).filter(f => isNumericId(f.item_id))) {
      stats.favorites_artists.total++;
      const spotify = await resolveArtist(fav.item_title);
      if (spotify) {
        await sb.from('favorites').update({
          item_id: spotify.id,
          item_cover_url: spotify.imageUrl,
        }).eq('id', fav.id);
        stats.favorites_artists.migrated++;
      } else {
        stats.favorites_artists.failed++;
        console.warn(`Artist not found: "${fav.item_title}"`);
      }
    }

    // ========== 3. FAVORITES - ALBUMS ==========
    console.log('Migrating favorites albums...');
    const { data: favAlbums } = await sb.from('favorites').select('id, item_id, item_title, item_artist').eq('item_type', 'album');
    for (const fav of (favAlbums || []).filter(f => isNumericId(f.item_id))) {
      stats.favorites_albums.total++;
      const spotify = await resolveAlbum(fav.item_title, fav.item_artist || '');
      if (spotify) {
        await sb.from('favorites').update({
          item_id: spotify.id,
          item_cover_url: spotify.coverUrl,
        }).eq('id', fav.id);
        stats.favorites_albums.migrated++;
      } else {
        stats.favorites_albums.failed++;
        console.warn(`Album not found: "${fav.item_title}" by "${fav.item_artist}"`);
      }
    }

    // ========== 4. PLAYLIST_TRACKS ==========
    console.log('Migrating playlist_tracks...');
    const { data: plTracks } = await sb.from('playlist_tracks').select('id, track_id, track_title, track_artist');
    for (const pt of (plTracks || []).filter(t => isNumericId(t.track_id))) {
      stats.playlist_tracks.total++;
      const spotify = await resolveTrack(pt.track_title, pt.track_artist);
      if (spotify) {
        await sb.from('playlist_tracks').update({
          track_id: spotify.id,
          track_cover_url: spotify.coverUrl,
          track_album: spotify.album,
          track_album_id: spotify.albumId,
          track_duration: spotify.duration,
        }).eq('id', pt.id);
        stats.playlist_tracks.migrated++;
      } else {
        stats.playlist_tracks.failed++;
        console.warn(`Playlist track not found: "${pt.track_title}" by "${pt.track_artist}"`);
      }
    }

    // ========== 5. USER_TRACK_STATS ==========
    console.log('Migrating user_track_stats...');
    const { data: trackStats } = await sb.from('user_track_stats').select('id, track_id, track_title, track_artist, artist_id');
    for (const ts of (trackStats || []).filter(t => isNumericId(t.track_id))) {
      stats.user_track_stats.total++;
      const spotify = await resolveTrack(ts.track_title, ts.track_artist);
      const artistSpotify = ts.artist_id && isNumericId(ts.artist_id) ? await resolveArtist(ts.track_artist) : null;
      if (spotify) {
        const update: any = {
          track_id: spotify.id,
          track_cover_url: spotify.coverUrl,
          track_album: spotify.album,
          track_album_id: spotify.albumId,
          track_duration: spotify.duration,
        };
        if (artistSpotify) update.artist_id = artistSpotify.id;
        await sb.from('user_track_stats').update(update).eq('id', ts.id);
        stats.user_track_stats.migrated++;
      } else {
        stats.user_track_stats.failed++;
      }
    }

    // ========== 6. USER_ARTIST_STATS ==========
    console.log('Migrating user_artist_stats...');
    const { data: artistStats } = await sb.from('user_artist_stats').select('id, artist_id, artist_name');
    for (const as_ of (artistStats || []).filter(a => isNumericId(a.artist_id))) {
      stats.user_artist_stats.total++;
      const spotify = await resolveArtist(as_.artist_name);
      if (spotify) {
        await sb.from('user_artist_stats').update({
          artist_id: spotify.id,
          artist_image_url: spotify.imageUrl,
        }).eq('id', as_.id);
        stats.user_artist_stats.migrated++;
      } else {
        stats.user_artist_stats.failed++;
        console.warn(`Artist stat not found: "${as_.artist_name}"`);
      }
    }

    // ========== 7. RECENTLY_PLAYED ==========
    console.log('Migrating recently_played...');
    const { data: recentlyPlayed } = await sb.from('recently_played').select('id, track_id, track_title, track_artist, artist_id');
    for (const rp of (recentlyPlayed || []).filter(r => isNumericId(r.track_id))) {
      stats.recently_played.total++;
      const spotify = await resolveTrack(rp.track_title, rp.track_artist);
      const artistSpotify = rp.artist_id && isNumericId(rp.artist_id) ? await resolveArtist(rp.track_artist) : null;
      if (spotify) {
        const update: any = {
          track_id: spotify.id,
          track_cover_url: spotify.coverUrl,
          track_album: spotify.album,
          track_album_id: spotify.albumId,
          track_duration: spotify.duration,
        };
        if (artistSpotify) update.artist_id = artistSpotify.id;
        await sb.from('recently_played').update(update).eq('id', rp.id);
        stats.recently_played.migrated++;
      } else {
        stats.recently_played.failed++;
      }
    }

    // ========== 8. ALBUM_LIKES ==========
    console.log('Migrating album_likes...');
    const { data: albumLikes } = await sb.from('album_likes').select('id, album_id, album_title, album_artist');
    for (const al of (albumLikes || []).filter(a => isNumericId(a.album_id))) {
      stats.album_likes.total++;
      const spotify = await resolveAlbum(al.album_title, al.album_artist);
      if (spotify) {
        await sb.from('album_likes').update({
          album_id: spotify.id,
          album_cover_url: spotify.coverUrl,
        }).eq('id', al.id);
        stats.album_likes.migrated++;
      } else {
        stats.album_likes.failed++;
      }
    }

    console.log('Migration complete!', JSON.stringify(stats, null, 2));

    return new Response(JSON.stringify({
      success: true,
      stats,
      cacheSize: { tracks: trackCache.size, artists: artistCache.size, albums: albumCache.size },
    }), {
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