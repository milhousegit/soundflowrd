import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const DEEZER_API = 'https://api.deezer.com';

// ---- Deezer helpers ----
async function deezerFetch(path: string): Promise<any> {
  const res = await fetch(`${DEEZER_API}${path}`, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
  });
  if (!res.ok) throw new Error(`Deezer ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'Deezer error');
  return data;
}

function deezerCover(obj: any): string | undefined {
  return obj?.cover_xl || obj?.cover_big || obj?.cover_medium || obj?.cover ||
    obj?.picture_xl || obj?.picture_big || obj?.picture_medium || obj?.picture;
}

function mapDeezerTrack(t: any, albumOverride?: any): any {
  const album = albumOverride || t?.album;
  return {
    id: String(t?.id || ''),
    title: t?.title || 'Unknown Track',
    artist: t?.artist?.name || album?.artist?.name || 'Unknown Artist',
    artistId: String(t?.artist?.id || album?.artist?.id || ''),
    album: album?.title || 'Unknown Album',
    albumId: String(album?.id || ''),
    duration: Math.round(t?.duration || 0),
    coverUrl: deezerCover(album) || deezerCover(t?.artist),
  };
}

function mapDeezerAlbum(album: any): any {
  return {
    id: String(album?.id || ''),
    title: album?.title || 'Unknown Album',
    artist: album?.artist?.name || 'Unknown Artist',
    artistId: String(album?.artist?.id || ''),
    coverUrl: deezerCover(album),
    releaseDate: album?.release_date || undefined,
    trackCount: album?.nb_tracks || undefined,
    recordType: album?.record_type || 'album',
  };
}

// Resolve any artist ID (Spotify or Deezer) to a Deezer ID
async function resolveToDeezer(artistId: string, artistName: string): Promise<string | null> {
  if (/^\d+$/.test(artistId)) return artistId;
  // Spotify ID: search by name on Deezer
  try {
    const data = await deezerFetch(`/search/artist?q=${encodeURIComponent(artistName)}&limit=5`);
    const normalized = artistName.toLowerCase().trim();
    const exact = (data?.data || []).find((a: any) => a.name?.toLowerCase().trim() === normalized);
    return exact ? String(exact.id) : (data?.data?.[0] ? String(data.data[0].id) : null);
  } catch {
    return null;
  }
}

// Get genre from first album
async function getArtistGenre(deezerId: string): Promise<string> {
  try {
    const albumsData = await deezerFetch(`/artist/${deezerId}/albums?limit=1`);
    const firstAlbumId = albumsData?.data?.[0]?.id;
    if (!firstAlbumId) return 'Unknown';
    const albumData = await deezerFetch(`/album/${firstAlbumId}`);
    const genres = albumData?.genres?.data || [];
    return genres[0]?.name || 'Unknown';
  } catch {
    return 'Unknown';
  }
}

// Get related artist IDs from Deezer
async function getRelatedArtistIds(deezerId: string): Promise<string[]> {
  try {
    const data = await deezerFetch(`/artist/${deezerId}/related?limit=20`);
    return (data?.data || []).map((a: any) => String(a.id));
  } catch {
    return [];
  }
}

// Get top tracks from Deezer
async function getArtistTopTracks(deezerId: string): Promise<any[]> {
  try {
    const data = await deezerFetch(`/artist/${deezerId}/top?limit=10`);
    return (data?.data || []).map((t: any) => mapDeezerTrack(t));
  } catch {
    return [];
  }
}

// Get artist radio (mix of similar tracks)
async function getArtistRadio(deezerId: string, limit = 40): Promise<any[]> {
  try {
    const data = await deezerFetch(`/artist/${deezerId}/radio?limit=${limit}`);
    return (data?.data || []).map((t: any) => mapDeezerTrack(t));
  } catch {
    return [];
  }
}

// ---- Clustering ----
interface ArtistCluster {
  genre: string;
  artists: { id: string; deezerId: string; name: string; playCount: number; imageUrl?: string }[];
}

function normalizeGenre(genre: string): string {
  const g = genre.toLowerCase().trim();
  if (g.includes('rap') || g.includes('hip hop') || g.includes('hip-hop') || g.includes('trap')) return 'Hip-Hop/Rap';
  if (g.includes('comedy') || g.includes('humor') || g.includes('parody') || g.includes('comico')) return 'Comedy';
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

function getMostCommonGenre(genres: string[]): string {
  const counts = new Map<string, number>();
  for (const g of genres) {
    const n = normalizeGenre(g);
    counts.set(n, (counts.get(n) || 0) + 1);
  }
  let best = 'Mixed';
  let bestCount = 0;
  for (const [genre, count] of counts) {
    if (count > bestCount && genre !== 'Mixed') { best = genre; bestCount = count; }
  }
  return best;
}

function clusterArtistsByAffinity(
  artists: { id: string; deezerId: string; name: string; playCount: number; genre: string; imageUrl?: string; relatedIds: string[] }[]
): ArtistCluster[] {
  if (artists.length === 0) return [];
  const assigned = new Set<string>();
  const clusters: ArtistCluster[] = [];
  const sorted = [...artists].sort((a, b) => b.playCount - a.playCount);

  for (const seed of sorted) {
    if (assigned.has(seed.deezerId)) continue;
    const clusterArtists = [seed];
    assigned.add(seed.deezerId);

    for (const candidate of sorted) {
      if (assigned.has(candidate.deezerId)) continue;
      const seedRelated = seed.relatedIds.includes(candidate.deezerId);
      const candidateRelated = candidate.relatedIds.includes(seed.deezerId);
      const sameGenre = normalizeGenre(seed.genre) === normalizeGenre(candidate.genre) && normalizeGenre(seed.genre) !== 'Mixed';
      if (seedRelated || candidateRelated || sameGenre) {
        clusterArtists.push(candidate);
        assigned.add(candidate.deezerId);
      }
    }

    clusters.push({
      genre: getMostCommonGenre(clusterArtists.map(a => a.genre)),
      artists: clusterArtists.map(a => ({ id: a.id, deezerId: a.deezerId, name: a.name, playCount: a.playCount, imageUrl: a.imageUrl })),
    });
    if (clusters.length >= 3) break;
  }

  // Assign remaining
  for (const artist of sorted) {
    if (assigned.has(artist.deezerId)) continue;
    let bestCluster = 0, bestScore = -1;
    for (let i = 0; i < clusters.length; i++) {
      let score = 0;
      for (const ca of clusters[i].artists) {
        const orig = sorted.find(a => a.deezerId === ca.deezerId);
        if (orig?.relatedIds.includes(artist.deezerId)) score += 2;
        if (normalizeGenre(orig?.genre || '') === normalizeGenre(artist.genre) && normalizeGenre(artist.genre) !== 'Mixed') score += 1;
      }
      if (score > bestScore) { bestScore = score; bestCluster = i; }
    }
    if (clusters[bestCluster]) {
      clusters[bestCluster].artists.push({ id: artist.id, deezerId: artist.deezerId, name: artist.name, playCount: artist.playCount, imageUrl: artist.imageUrl });
    }
    assigned.add(artist.deezerId);
  }

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

const GENRE_COLORS: Record<string, string[]> = {
  'Hip-Hop/Rap': ['#7C3AED', '#4F46E5'], 'Pop': ['#EC4899', '#F43F5E'],
  'Rock': ['#DC2626', '#EA580C'], 'Electronic': ['#06B6D4', '#8B5CF6'],
  'R&B/Soul': ['#A855F7', '#EC4899'], 'Latin': ['#F59E0B', '#EF4444'],
  'Indie/Alternative': ['#10B981', '#3B82F6'], 'K-Pop': ['#F472B6', '#A78BFA'],
  'Jazz': ['#D97706', '#92400E'], 'Classical': ['#6366F1', '#8B5CF6'],
  'Country': ['#D97706', '#65A30D'], 'Comedy': ['#FBBF24', '#F97316'],
  'Mixed': ['#6366F1', '#EC4899'],
};

function getGradientForGenre(genre: string): string {
  const colors = GENRE_COLORS[genre] || GENRE_COLORS['Mixed'];
  return `${colors[0]},${colors[1]}`;
}

// ======================== HANDLER ========================

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { action } = await req.json();

    if (action === 'get') {
      const { data: existing } = await supabase
        .from('daily_mixes').select('*')
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

      // 1. Fetch user's top artists
      const { data: rawArtistStats } = await supabase
        .from('user_artist_stats')
        .select('artist_id, artist_name, total_plays, artist_image_url')
        .eq('user_id', user.id)
        .order('total_plays', { ascending: false })
        .limit(30);

      const artistStats: { artist_id: string; artist_name: string; total_plays: number; artist_image_url: string | null }[] = [...(rawArtistStats || [])];

      if (artistStats.length === 0) {
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

        const artistCountMap = new Map<string, typeof artistStats[number]>();
        for (const r of recentArtists) {
          if (!r.artist_id) continue;
          const existing = artistCountMap.get(r.artist_id);
          if (existing) existing.total_plays++;
          else artistCountMap.set(r.artist_id, { artist_id: r.artist_id, artist_name: r.track_artist, total_plays: 1, artist_image_url: null });
        }
        artistStats.push(...Array.from(artistCountMap.values()).sort((a, b) => b.total_plays - a.total_plays).slice(0, 30));
      }

      // 2. Resolve all artist IDs to Deezer and enrich
      const topArtists = artistStats.slice(0, 15);
      const enrichedArtists: {
        id: string; deezerId: string; name: string; playCount: number;
        genre: string; imageUrl?: string; relatedIds: string[];
      }[] = [];

      for (let batch = 0; batch < topArtists.length; batch += 5) {
        const slice = topArtists.slice(batch, batch + 5);
        const results = await Promise.all(slice.map(async (a) => {
          const deezerId = await resolveToDeezer(a.artist_id, a.artist_name);
          if (!deezerId) return null;
          const [genre, relatedIds] = await Promise.all([
            getArtistGenre(deezerId),
            getRelatedArtistIds(deezerId),
          ]);
          return {
            id: a.artist_id,
            deezerId,
            name: a.artist_name,
            playCount: a.total_plays,
            genre,
            imageUrl: a.artist_image_url || undefined,
            relatedIds,
          };
        }));
        for (const r of results) {
          if (r) enrichedArtists.push(r);
        }
      }

      console.log(`Enriched ${enrichedArtists.length} artists:`, enrichedArtists.map(a => `${a.name}(${a.genre})`).join(', '));

      for (const a of artistStats.slice(15)) {
        const deezerId = await resolveToDeezer(a.artist_id, a.artist_name);
        enrichedArtists.push({
          id: a.artist_id,
          deezerId: deezerId || a.artist_id,
          name: a.artist_name,
          playCount: a.total_plays,
          genre: 'Unknown',
          imageUrl: a.artist_image_url || undefined,
          relatedIds: [],
        });
      }

      // 3. Cluster by affinity
      const clusters = clusterArtistsByAffinity(enrichedArtists);
      if (clusters.length === 0) {
        return new Response(JSON.stringify([]), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // 4. Build mixes (up to 50 tracks)
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

        // Phase 1: Top tracks from cluster artists (Deezer)
        for (const artist of cluster.artists.slice(0, 10)) {
          try {
            const tracks = await getArtistTopTracks(artist.deezerId);
            console.log(`Artist ${artist.name} (deezer:${artist.deezerId}): ${tracks.length} top tracks`);
            for (const t of tracks) {
              if (allTracks.length >= MIX_TARGET) break;
              tryAdd(t);
            }
          } catch (err) {
            console.error(`Failed top tracks for ${artist.name}:`, err);
          }
        }

        console.log(`Cluster ${i} after phase 1: ${allTracks.length} tracks`);

        // Phase 2: Artist radio for discovery
        if (allTracks.length < MIX_TARGET) {
          for (const artist of cluster.artists.slice(0, 3)) {
            if (allTracks.length >= MIX_TARGET) break;
            try {
              const radioTracks = await getArtistRadio(artist.deezerId, 20);
              for (const t of radioTracks) {
                if (allTracks.length >= MIX_TARGET) break;
                tryAdd(t);
              }
            } catch { /* skip */ }
          }
        }

        // Phase 3: Related artists' top tracks
        if (allTracks.length < MIX_TARGET) {
          const clusterDeezerIds = new Set(cluster.artists.map(a => a.deezerId));
          const relatedIds = new Set<string>();
          for (const a of enrichedArtists.filter(e => cluster.artists.some(ca => ca.deezerId === e.deezerId))) {
            for (const rid of a.relatedIds) {
              if (!clusterDeezerIds.has(rid)) relatedIds.add(rid);
            }
          }
          const relatedArr = [...relatedIds].sort(() => Math.random() - 0.5).slice(0, 10);
          for (const relId of relatedArr) {
            if (allTracks.length >= MIX_TARGET) break;
            try {
              const tracks = await getArtistTopTracks(relId);
              for (const t of tracks.slice(0, 5)) {
                if (allTracks.length >= MIX_TARGET) break;
                tryAdd(t);
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

        const topArtistNames = cluster.artists.slice(0, 4).map(a => a.name);
        const gradient = getGradientForGenre(cluster.genre);
        const topArtistCover = cluster.artists[0]?.imageUrl || allTracks[0]?.coverUrl;

        mixes.push({
          user_id: user.id,
          mix_index: i,
          mix_label: `Daily Mix ${i + 1}`,
          top_artists: topArtistNames,
          genre_tags: [cluster.genre],
          tracks: allTracks.slice(0, MIX_TARGET),
          dominant_color: gradient,
          cover_url: topArtistCover,
          generated_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        });
      }

      const validMixes = mixes.filter((m: any) => m.tracks && m.tracks.length > 0);

      // ---- NEW RELEASES MIX (Deezer) ----
      console.log('Generating NEW releases mix...');
      const newReleaseTracks: any[] = [];
      const newReleaseSeenIds = new Set<string>();

      const allArtistDeezerIds = new Set<string>();
      for (const e of enrichedArtists) {
        if (e.deezerId && /^\d+$/.test(e.deezerId)) allArtistDeezerIds.add(e.deezerId);
      }

      // Also resolve favorite artists
      const { data: favArtists } = await supabase
        .from('favorites')
        .select('item_id, item_title')
        .eq('user_id', user.id)
        .eq('item_type', 'artist');
      for (const f of (favArtists || [])) {
        const did = await resolveToDeezer(f.item_id, f.item_title || '');
        if (did) allArtistDeezerIds.add(did);
      }

      const uniqueArtistDeezerIds = [...allArtistDeezerIds].slice(0, 30);
      console.log(`Checking new releases for ${uniqueArtistDeezerIds.length} Deezer artists`);

      const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      for (let batch = 0; batch < uniqueArtistDeezerIds.length; batch += 5) {
        const slice = uniqueArtistDeezerIds.slice(batch, batch + 5);
        const results = await Promise.all(slice.map(async (deezerId) => {
          try {
            const data = await deezerFetch(`/artist/${deezerId}/albums?limit=5`);
            const albums = data?.data || [];
            const recentAlbums = albums.filter((a: any) => {
              if (!a.release_date) return false;
              return new Date(a.release_date) >= sixtyDaysAgo;
            });
            const tracks: any[] = [];
            for (const album of recentAlbums.slice(0, 2)) {
              try {
                const albumData = await deezerFetch(`/album/${album.id}`);
                if (albumData?.tracks?.data) {
                  for (const t of albumData.tracks.data) {
                    tracks.push(mapDeezerTrack(t, albumData));
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
              newReleaseTracks.push(t);
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

        validMixes.push({
          user_id: user.id,
          mix_index: validMixes.length,
          mix_label: 'NEW',
          top_artists: [...new Set(newReleaseTracks.map(t => t.artist))].slice(0, 4),
          genre_tags: ['New Releases'],
          tracks: newReleaseTracks.slice(0, 50),
          dominant_color: '#10B981,#3B82F6',
          cover_url: newReleaseTracks[0]?.coverUrl || null,
          generated_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        });
      }

      const finalMixes = validMixes.map((m, idx) => ({
        ...m,
        mix_index: idx,
        mix_label: m.mix_label === 'NEW' ? 'NEW' : `Daily Mix ${idx + 1}`,
      }));

      console.log(`Final mixes: ${finalMixes.length}`);

      if (finalMixes.length > 0) {
        const { error: insertError } = await supabase.from('daily_mixes').insert(finalMixes);
        if (insertError) console.error('Error saving mixes:', insertError);
      }

      const { data: freshMixes } = await supabase
        .from('daily_mixes').select('*')
        .eq('user_id', user.id)
        .order('mix_index');

      return new Response(JSON.stringify(freshMixes || finalMixes), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Daily mix error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
