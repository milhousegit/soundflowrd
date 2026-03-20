import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ---- Spotify Auth ----
let cachedToken: string | null = null;
let tokenExpiry = 0;

async function getSpotifyToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  const clientId = Deno.env.get('SPOTIFY_CLIENT_ID')!;
  const clientSecret = Deno.env.get('SPOTIFY_CLIENT_SECRET')!;
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken!;
}

async function spotifyFetch(path: string, retries = 2): Promise<any> {
  for (let i = 0; i <= retries; i++) {
    try {
      const token = await getSpotifyToken();
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(`https://api.spotify.com/v1${path}`, {
        signal: controller.signal,
        headers: { 'Authorization': `Bearer ${token}` },
      });
      clearTimeout(id);
      if (res.status === 401) { cachedToken = null; tokenExpiry = 0; continue; }
      if (res.status === 429) {
        const wait = parseInt(res.headers.get('Retry-After') || '2') * 1000;
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) throw new Error(`Spotify ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i === retries) throw e;
      await new Promise(r => setTimeout(r, 500 * (i + 1)));
    }
  }
}

function bestImage(images: any[]): string | undefined {
  if (!images?.length) return undefined;
  return images.sort((a: any, b: any) => (b.width || 0) - (a.width || 0))[0]?.url;
}

// Get genre for an artist from Spotify
async function getArtistGenre(artistId: string): Promise<string> {
  try {
    const data = await spotifyFetch(`/artists/${artistId}`);
    const genres = data?.genres || [];
    return genres[0] || 'Unknown';
  } catch {
    return 'Unknown';
  }
}

// Get related artist IDs
async function getRelatedArtistIds(artistId: string): Promise<string[]> {
  try {
    const data = await spotifyFetch(`/artists/${artistId}/related-artists`);
    return (data?.artists || []).slice(0, 20).map((a: any) => a.id);
  } catch {
    return [];
  }
}

// Get top tracks for an artist
async function getArtistTopTracks(artistId: string): Promise<any[]> {
  try {
    const data = await spotifyFetch(`/artists/${artistId}/top-tracks?market=IT`);
    return data?.tracks || [];
  } catch {
    return [];
  }
}

// Cluster artists by genre similarity
interface ArtistCluster {
  genre: string;
  artists: { id: string; name: string; playCount: number; imageUrl?: string }[];
}

function clusterArtistsByAffinity(
  artists: { id: string; name: string; playCount: number; genre: string; imageUrl?: string; relatedIds: string[] }[]
): ArtistCluster[] {
  if (artists.length === 0) return [];

  const assigned = new Set<string>();
  const clusters: ArtistCluster[] = [];

  const sorted = [...artists].sort((a, b) => b.playCount - a.playCount);

  for (const seed of sorted) {
    if (assigned.has(seed.id)) continue;

    const clusterArtists = [seed];
    assigned.add(seed.id);

    for (const candidate of sorted) {
      if (assigned.has(candidate.id)) continue;
      
      const seedRelated = seed.relatedIds.includes(candidate.id);
      const candidateRelated = candidate.relatedIds.includes(seed.id);
      const sameGenre = normalizeGenre(seed.genre) === normalizeGenre(candidate.genre) && 
                        normalizeGenre(seed.genre) !== 'Mixed';
      
      if (seedRelated || candidateRelated || sameGenre) {
        clusterArtists.push(candidate);
        assigned.add(candidate.id);
      }
    }

    const genre = getMostCommonGenre(clusterArtists.map(a => a.genre));
    clusters.push({
      genre,
      artists: clusterArtists.map(a => ({
        id: a.id, name: a.name, playCount: a.playCount, imageUrl: a.imageUrl,
      })),
    });

    if (clusters.length >= 3) break;
  }

  // Add remaining unassigned artists to the closest cluster
  for (const artist of sorted) {
    if (assigned.has(artist.id)) continue;
    let bestCluster = 0;
    let bestScore = -1;
    for (let i = 0; i < clusters.length; i++) {
      let score = 0;
      for (const ca of clusters[i].artists) {
        const orig = sorted.find(a => a.id === ca.id);
        if (orig?.relatedIds.includes(artist.id)) score += 2;
        if (normalizeGenre(orig?.genre || '') === normalizeGenre(artist.genre) &&
            normalizeGenre(artist.genre) !== 'Mixed') score += 1;
      }
      if (score > bestScore) {
        bestScore = score;
        bestCluster = i;
      }
    }
    if (clusters[bestCluster]) {
      clusters[bestCluster].artists.push({
        id: artist.id, name: artist.name, playCount: artist.playCount, imageUrl: artist.imageUrl,
      });
    }
    assigned.add(artist.id);
  }

  // Ensure at least 2 clusters
  while (clusters.length < 2 && clusters.length > 0) {
    const biggest = clusters[0];
    if (biggest.artists.length >= 2) {
      const half = Math.ceil(biggest.artists.length / 2);
      clusters.splice(0, 1,
        { genre: biggest.genre, artists: biggest.artists.slice(0, half) },
        { genre: `${biggest.genre} (2)`, artists: biggest.artists.slice(half) },
      );
    } else {
      clusters.push({ genre: `${biggest.genre} Discovery`, artists: [...biggest.artists] });
    }
  }

  clusters.sort((a, b) => {
    const aTotal = a.artists.reduce((s, ar) => s + ar.playCount, 0);
    const bTotal = b.artists.reduce((s, ar) => s + ar.playCount, 0);
    return bTotal - aTotal;
  });

  return clusters.slice(0, 3);
}

function getMostCommonGenre(genres: string[]): string {
  const counts = new Map<string, number>();
  for (const g of genres) {
    const n = normalizeGenre(g);
    counts.set(n, (counts.get(n) || 0) + 1);
  }
  let best = 'Mixed';
  let bestCount = 0;
  for (const [genre, count] of counts) {
    if (count > bestCount && genre !== 'Mixed') {
      best = genre;
      bestCount = count;
    }
  }
  return best;
}

function normalizeGenre(genre: string): string {
  const g = genre.toLowerCase().trim();
  if (g.includes('rap') || g.includes('hip hop') || g.includes('hip-hop') || g.includes('trap')) return 'Hip-Hop/Rap';
  if (g.includes('comedy') || g.includes('humor') || g.includes('parody') || g.includes('comico') || g.includes('commedia') || g.includes('umorismo')) return 'Comedy';
  if (g.includes('pop') && !g.includes('k-pop')) return 'Pop';
  if (g.includes('k-pop') || g.includes('kpop')) return 'K-Pop';
  if (g.includes('rock') || g.includes('punk') || g.includes('metal')) return 'Rock';
  if (g.includes('electro') || g.includes('dance') || g.includes('edm') || g.includes('house') || g.includes('techno')) return 'Electronic';
  if (g.includes('r&b') || g.includes('rnb') || g.includes('soul')) return 'R&B/Soul';
  if (g.includes('jazz')) return 'Jazz';
  if (g.includes('classical') || g.includes('classica')) return 'Classical';
  if (g.includes('reggaeton') || g.includes('latin') || g.includes('latino')) return 'Latin';
  if (g.includes('indie') || g.includes('alternative')) return 'Indie/Alternative';
  if (g.includes('country')) return 'Country';
  if (g === 'unknown') return 'Mixed';
  return genre.charAt(0).toUpperCase() + genre.slice(1);
}

const GENRE_COLORS: Record<string, string[]> = {
  'Hip-Hop/Rap': ['#7C3AED', '#4F46E5'],
  'Pop': ['#EC4899', '#F43F5E'],
  'Rock': ['#DC2626', '#EA580C'],
  'Electronic': ['#06B6D4', '#8B5CF6'],
  'R&B/Soul': ['#A855F7', '#EC4899'],
  'Latin': ['#F59E0B', '#EF4444'],
  'Indie/Alternative': ['#10B981', '#3B82F6'],
  'K-Pop': ['#F472B6', '#A78BFA'],
  'Jazz': ['#D97706', '#92400E'],
  'Classical': ['#6366F1', '#8B5CF6'],
  'Country': ['#D97706', '#65A30D'],
  'Comedy': ['#FBBF24', '#F97316'],
  'Mixed': ['#6366F1', '#EC4899'],
};

function getGradientForGenre(genre: string): string {
  const colors = GENRE_COLORS[genre] || GENRE_COLORS['Mixed'];
  return `${colors[0]},${colors[1]}`;
}

function mapSpotifyTrack(t: any): any {
  return {
    id: t.id,
    title: t.name,
    artist: t.artists?.[0]?.name || 'Unknown Artist',
    artistId: t.artists?.[0]?.id || '',
    album: t.album?.name || 'Unknown Album',
    albumId: t.album?.id || '',
    duration: Math.round((t.duration_ms || 0) / 1000),
    coverUrl: bestImage(t.album?.images || []),
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { action } = await req.json();

    if (action === 'get') {
      const { data: existing } = await supabase
        .from('daily_mixes')
        .select('*')
        .eq('user_id', user.id)
        .gt('expires_at', new Date().toISOString())
        .order('mix_index');

      if (existing && existing.length > 0) {
        console.log(`Returning ${existing.length} cached mixes for user ${user.id}`);
        return new Response(JSON.stringify(existing), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    if (action === 'get' || action === 'regenerate') {
      console.log(`Generating daily mixes for user ${user.id}`);

      await supabase.from('daily_mixes').delete().eq('user_id', user.id);

      // 1. Fetch user's top artists from stats
      const { data: rawArtistStats } = await supabase
        .from('user_artist_stats')
        .select('artist_id, artist_name, total_plays, artist_image_url')
        .eq('user_id', user.id)
        .order('total_plays', { ascending: false })
        .limit(30);

      const artistStats: { artist_id: string; artist_name: string; total_plays: number; artist_image_url: string | null }[] = [...(rawArtistStats || [])];

      if (!artistStats || artistStats.length === 0) {
        const { data: recentArtists } = await supabase
          .from('recently_played')
          .select('artist_id, track_artist')
          .eq('user_id', user.id)
          .order('played_at', { ascending: false })
          .limit(50);

        if (!recentArtists || recentArtists.length === 0) {
          return new Response(JSON.stringify([]), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const artistCountMap = new Map<string, { artist_id: string; artist_name: string; total_plays: number; artist_image_url: string | null }>();
        for (const r of recentArtists) {
          if (!r.artist_id) continue;
          const existing = artistCountMap.get(r.artist_id);
          if (existing) {
            existing.total_plays++;
          } else {
            artistCountMap.set(r.artist_id, {
              artist_id: r.artist_id,
              artist_name: r.track_artist,
              total_plays: 1,
              artist_image_url: null,
            });
          }
        }
        const fallbackStats = Array.from(artistCountMap.values())
          .sort((a, b) => b.total_plays - a.total_plays)
          .slice(0, 30);
        artistStats.push(...(fallbackStats as any[]));
      }

      // 2. Get user's known track IDs
      const { data: userTracks } = await supabase
        .from('user_track_stats')
        .select('track_id')
        .eq('user_id', user.id)
        .limit(1000);

      const knownTrackIds = new Set((userTracks || []).map(t => t.track_id));

      const { data: favTracks } = await supabase
        .from('favorites')
        .select('item_id')
        .eq('user_id', user.id)
        .eq('item_type', 'track');

      for (const f of (favTracks || [])) {
        knownTrackIds.add(f.item_id);
      }

      // 3. Enrich top artists with genres and related artists (batch of 5)
      const topArtistsForLookup = artistStats.slice(0, 15);
      const enrichedArtists: { id: string; name: string; playCount: number; genre: string; imageUrl?: string; relatedIds: string[] }[] = [];

      for (let batch = 0; batch < topArtistsForLookup.length; batch += 5) {
        const slice = topArtistsForLookup.slice(batch, batch + 5);
        const results = await Promise.all(slice.map(async (a) => {
          const [genre, relatedIds] = await Promise.all([
            getArtistGenre(a.artist_id),
            getRelatedArtistIds(a.artist_id),
          ]);
          return { ...a, genre, relatedIds };
        }));
        for (const a of results) {
          enrichedArtists.push({
            id: a.artist_id,
            name: a.artist_name,
            playCount: a.total_plays,
            genre: a.genre,
            imageUrl: a.artist_image_url || undefined,
            relatedIds: a.relatedIds,
          });
        }
      }

      console.log(`Enriched ${enrichedArtists.length} artists:`, enrichedArtists.map(a => `${a.name}(${a.genre})`).join(', '));

      for (const a of artistStats.slice(15)) {
        enrichedArtists.push({
          id: a.artist_id,
          name: a.artist_name,
          playCount: a.total_plays,
          genre: 'Unknown',
          imageUrl: a.artist_image_url || undefined,
          relatedIds: [],
        });
      }

      // 4. Cluster artists by affinity
      const clusters = clusterArtistsByAffinity(enrichedArtists);

      if (clusters.length === 0) {
        return new Response(JSON.stringify([]), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // 5. Build mixes (up to 50 tracks)
      const MIX_TARGET = 50;
      const mixes = [];

      for (let i = 0; i < clusters.length; i++) {
        const cluster = clusters[i];
        const seenIds = new Set<string>();
        const allTracks: any[] = [];

        const tryAdd = (t: any): boolean => {
          if (seenIds.has(t.id)) return false;
          seenIds.add(t.id);
          allTracks.push(t);
          return true;
        };

        // Phase 1: Top tracks from cluster artists
        for (const artist of cluster.artists.slice(0, 10)) {
          try {
            const tracks = await getArtistTopTracks(artist.id);
            console.log(`Artist ${artist.name} (${artist.id}): ${tracks.length} top tracks`);
            for (const t of tracks) {
              if (allTracks.length >= MIX_TARGET) break;
              tryAdd(mapSpotifyTrack(t));
            }
          } catch (err) {
            console.error(`Failed top tracks for ${artist.name}:`, err);
          }
        }

        console.log(`Cluster ${i} after phase 1: ${allTracks.length} tracks`);

        // Phase 2: Related artists to broaden the mix
        if (allTracks.length < MIX_TARGET) {
          const relatedArtistIds = new Set<string>();
          const clusterArtistIds = new Set(cluster.artists.map(a => a.id));

          const relatedPromises = cluster.artists.slice(0, 3).map(async (artist) => {
            try {
              const data = await spotifyFetch(`/artists/${artist.id}/related-artists`);
              return (data?.artists || []).slice(0, 10).map((r: any) => r.id).filter((id: string) => !clusterArtistIds.has(id));
            } catch { return []; }
          });
          const relatedResults = await Promise.all(relatedPromises);
          for (const ids of relatedResults) {
            for (const id of ids) relatedArtistIds.add(id);
          }

          console.log(`Cluster ${i}: ${relatedArtistIds.size} related artists found`);

          const relatedArr = [...relatedArtistIds].sort(() => Math.random() - 0.5);
          for (const relId of relatedArr.slice(0, 15)) {
            if (allTracks.length >= MIX_TARGET) break;
            try {
              const tracks = await getArtistTopTracks(relId);
              for (const t of tracks.slice(0, 5)) {
                if (allTracks.length >= MIX_TARGET) break;
                tryAdd(mapSpotifyTrack(t));
              }
            } catch { /* skip */ }
          }
        }

        console.log(`Cluster ${i} final: ${allTracks.length} tracks`);

        // Shuffle
        for (let j = allTracks.length - 1; j > 0; j--) {
          const k = Math.floor(Math.random() * (j + 1));
          [allTracks[j], allTracks[k]] = [allTracks[k], allTracks[j]];
        }

        const formattedTracks = allTracks.slice(0, MIX_TARGET);

        const topArtistNames = cluster.artists.slice(0, 4).map(a => a.name);
        const gradient = getGradientForGenre(cluster.genre);
        const topArtistCover = cluster.artists[0]?.imageUrl || formattedTracks[0]?.coverUrl;

        mixes.push({
          user_id: user.id,
          mix_index: i,
          mix_label: `Daily Mix ${i + 1}`,
          top_artists: topArtistNames,
          genre_tags: [cluster.genre],
          tracks: formattedTracks,
          dominant_color: gradient,
          cover_url: topArtistCover,
          generated_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        });
      }

      const validMixes = mixes.filter((m: any) => m.tracks && m.tracks.length > 0);

      // ---- NEW RELEASES MIX ----
      console.log('Generating NEW releases mix...');
      const newReleaseTracks: any[] = [];
      const newReleaseSeenIds = new Set<string>();

      const allArtistIds = new Set<string>();
      for (const a of artistStats) {
        if (a.artist_id) allArtistIds.add(a.artist_id);
      }

      const { data: favArtists } = await supabase
        .from('favorites')
        .select('item_id')
        .eq('user_id', user.id)
        .eq('item_type', 'artist');
      for (const f of (favArtists || [])) {
        if (f.item_id) allArtistIds.add(f.item_id);
      }

      const { data: favTrackData } = await supabase
        .from('favorites')
        .select('item_data')
        .eq('user_id', user.id)
        .eq('item_type', 'track');
      for (const f of (favTrackData || [])) {
        const d = f.item_data as any;
        if (d?.artistId) allArtistIds.add(String(d.artistId));
      }

      const uniqueArtistIds = [...allArtistIds].slice(0, 30);
      console.log(`Checking new releases for ${uniqueArtistIds.length} artists`);

      const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      for (let batch = 0; batch < uniqueArtistIds.length; batch += 5) {
        const slice = uniqueArtistIds.slice(batch, batch + 5);
        const results = await Promise.all(slice.map(async (artistId) => {
          try {
            const data = await spotifyFetch(`/artists/${artistId}/albums?include_groups=album,single&limit=5&market=IT`);
            const albums = data?.items || [];
            const recentAlbums = albums.filter((a: any) => {
              if (!a.release_date) return false;
              return new Date(a.release_date) >= sixtyDaysAgo;
            });
            const tracks: any[] = [];
            for (const album of recentAlbums.slice(0, 2)) {
              try {
                const albumData = await spotifyFetch(`/albums/${album.id}?market=IT`);
                if (albumData?.tracks?.items) {
                  for (const t of albumData.tracks.items) {
                    tracks.push({
                      ...t,
                      album: { id: album.id, name: album.name, images: album.images },
                    });
                  }
                }
              } catch { /* skip */ }
            }
            return tracks;
          } catch { return []; }
        }));
        for (const tracks of results) {
          for (const t of tracks) {
            if (!newReleaseSeenIds.has(t.id)) {
              newReleaseSeenIds.add(t.id);
              newReleaseTracks.push(mapSpotifyTrack(t));
            }
          }
        }
      }

      console.log(`NEW mix: ${newReleaseTracks.length} tracks from new releases`);

      if (newReleaseTracks.length > 0) {
        for (let j = newReleaseTracks.length - 1; j > 0; j--) {
          const k = Math.floor(Math.random() * (j + 1));
          [newReleaseTracks[j], newReleaseTracks[k]] = [newReleaseTracks[k], newReleaseTracks[j]];
        }

        const formattedNewTracks = newReleaseTracks.slice(0, 50);

        const newMixIndex = validMixes.length;
        validMixes.push({
          user_id: user.id,
          mix_index: newMixIndex,
          mix_label: 'NEW',
          top_artists: [...new Set(formattedNewTracks.map(t => t.artist))].slice(0, 4),
          genre_tags: ['New Releases'],
          tracks: formattedNewTracks,
          dominant_color: '#10B981,#3B82F6',
          cover_url: formattedNewTracks[0]?.coverUrl || null,
          generated_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        });
      }

      const finalMixes = validMixes.map((m, idx) => ({
        ...m,
        mix_index: idx,
        mix_label: m.mix_label === 'NEW' ? 'NEW' : `Daily Mix ${idx + 1}`,
      }));

      console.log(`Final mixes: ${finalMixes.length} (including NEW)`);

      if (finalMixes.length > 0) {
        const { error: insertError } = await supabase
          .from('daily_mixes')
          .insert(finalMixes);

        if (insertError) {
          console.error('Error saving mixes:', insertError);
        }
      }

      const { data: freshMixes } = await supabase
        .from('daily_mixes')
        .select('*')
        .eq('user_id', user.id)
        .order('mix_index');

      console.log(`Generated ${freshMixes?.length || 0} mixes for user ${user.id}`);

      return new Response(JSON.stringify(freshMixes || finalMixes), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Daily mix error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
