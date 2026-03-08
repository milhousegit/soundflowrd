import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const DEEZER_API = 'https://api.deezer.com';
const requestHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'application/json',
};

function albumCover(obj: any, field = 'cover') {
  return obj?.[`${field}_xl`] || obj?.[`${field}_big`] || obj?.[`${field}_medium`] || obj?.[field] || undefined;
}

async function fetchDeezer(url: string, retries = 2): Promise<any> {
  for (let i = 0; i <= retries; i++) {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(url, { signal: controller.signal, headers: requestHeaders });
      clearTimeout(id);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (e) {
      if (i === retries) throw e;
      await new Promise(r => setTimeout(r, 500 * (i + 1)));
    }
  }
}

// Get genre info for an artist from Deezer
async function getArtistGenre(artistId: string): Promise<string> {
  try {
    const data = await fetchDeezer(`${DEEZER_API}/artist/${artistId}`);
    // Deezer doesn't expose genre directly on artist, but we can check via the artist's top track album
    if (data?.nb_album > 0) {
      const albums = await fetchDeezer(`${DEEZER_API}/artist/${artistId}/albums?limit=1`);
      if (albums?.data?.[0]?.id) {
        const album = await fetchDeezer(`${DEEZER_API}/album/${albums.data[0].id}`);
        if (album?.genres?.data?.[0]?.name) {
          return album.genres.data[0].name;
        }
      }
    }
    return 'Unknown';
  } catch {
    return 'Unknown';
  }
}

// Get discovery tracks from artist radio
async function getArtistRadioTracks(artistId: string, limit: number): Promise<any[]> {
  try {
    const data = await fetchDeezer(`${DEEZER_API}/artist/${artistId}/radio?limit=${limit}`);
    return data?.data || [];
  } catch {
    return [];
  }
}

// Cluster artists by genre similarity
interface ArtistCluster {
  genre: string;
  artists: { id: string; name: string; playCount: number; imageUrl?: string }[];
}

function clusterArtistsByGenre(
  artistGenreMap: Map<string, { genre: string; name: string; playCount: number; imageUrl?: string }>
): ArtistCluster[] {
  const genreGroups = new Map<string, ArtistCluster>();

  for (const [id, info] of artistGenreMap) {
    const normalizedGenre = normalizeGenre(info.genre);
    if (!genreGroups.has(normalizedGenre)) {
      genreGroups.set(normalizedGenre, { genre: normalizedGenre, artists: [] });
    }
    genreGroups.get(normalizedGenre)!.artists.push({
      id,
      name: info.name,
      playCount: info.playCount,
      imageUrl: info.imageUrl,
    });
  }

  // Sort clusters by total play count (most listened first)
  const clusters = Array.from(genreGroups.values())
    .map(c => ({
      ...c,
      artists: c.artists.sort((a, b) => b.playCount - a.playCount),
    }))
    .sort((a, b) => {
      const aTotal = a.artists.reduce((s, ar) => s + ar.playCount, 0);
      const bTotal = b.artists.reduce((s, ar) => s + ar.playCount, 0);
      return bTotal - aTotal;
    });

  // Ensure at least 2 clusters by splitting or duplicating
  while (clusters.length < 2 && clusters.length > 0) {
    const biggest = clusters[0];
    if (biggest.artists.length >= 2) {
      const half = Math.ceil(biggest.artists.length / 2);
      const split1 = { genre: biggest.genre, artists: biggest.artists.slice(0, half) };
      const split2 = { genre: `${biggest.genre} (2)`, artists: biggest.artists.slice(half) };
      clusters.splice(0, 1, split1, split2);
    } else {
      // Duplicate the single artist into a second mix (discovery-focused)
      clusters.push({ genre: `${biggest.genre} Discovery`, artists: [...biggest.artists] });
    }
  }
  // Try to reach 3 if possible
  while (clusters.length < 3) {
    const biggest = clusters.reduce((a, b) => a.artists.length > b.artists.length ? a : b);
    if (biggest.artists.length >= 2) {
      const half = Math.ceil(biggest.artists.length / 2);
      const idx = clusters.indexOf(biggest);
      const split1 = { genre: biggest.genre, artists: biggest.artists.slice(0, half) };
      const split2 = { genre: `${biggest.genre} (${clusters.length + 1})`, artists: biggest.artists.slice(half) };
      clusters.splice(idx, 1, split1, split2);
    } else {
      break;
    }
  }

  return clusters.slice(0, 3);
}

function normalizeGenre(genre: string): string {
  const g = genre.toLowerCase().trim();
  // Group similar genres
  if (g.includes('rap') || g.includes('hip hop') || g.includes('hip-hop') || g.includes('trap')) return 'Hip-Hop/Rap';
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
  // Capitalize first letter
  return genre.charAt(0).toUpperCase() + genre.slice(1);
}

// Mix color palettes by genre
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
  'Mixed': ['#6366F1', '#EC4899'],
};

function getGradientForGenre(genre: string): string {
  const colors = GENRE_COLORS[genre] || GENRE_COLORS['Mixed'];
  return `${colors[0]},${colors[1]}`;
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
      // Check for existing non-expired mixes
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

      // Fall through to generate
    }

    if (action === 'get' || action === 'regenerate') {
      console.log(`Generating daily mixes for user ${user.id}`);

      // Delete old mixes
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
        // Try recently_played as fallback
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

        // Build pseudo artist stats from recently_played
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
        // Use these as artistStats fallback
        const fallbackStats = Array.from(artistCountMap.values())
          .sort((a, b) => b.total_plays - a.total_plays)
          .slice(0, 30);
        artistStats.push(...(fallbackStats as any[]));
      }

      // 2. Get user's known track IDs (to exclude from discovery)
      const { data: userTracks } = await supabase
        .from('user_track_stats')
        .select('track_id')
        .eq('user_id', user.id)
        .limit(1000);

      const knownTrackIds = new Set((userTracks || []).map(t => t.track_id));

      // Also get favorites
      const { data: favTracks } = await supabase
        .from('favorites')
        .select('item_id')
        .eq('user_id', user.id)
        .eq('item_type', 'track');

      for (const f of (favTracks || [])) {
        knownTrackIds.add(f.item_id);
      }

      // 3. Get genres for top artists (limit API calls)
      const topArtistsForGenre = artistStats.slice(0, 15);
      const artistGenreMap = new Map<string, { genre: string; name: string; playCount: number; imageUrl?: string }>();

      // Batch genre lookups
      const genrePromises = topArtistsForGenre.map(async (a) => {
        const genre = await getArtistGenre(a.artist_id);
        return { ...a, genre };
      });

      const genreResults = await Promise.all(genrePromises);

      for (const a of genreResults) {
        artistGenreMap.set(a.artist_id, {
          genre: a.genre,
          name: a.artist_name,
          playCount: a.total_plays,
          imageUrl: a.artist_image_url || undefined,
        });
      }

      // Add remaining artists with 'Unknown' genre
      for (const a of artistStats.slice(15)) {
        artistGenreMap.set(a.artist_id, {
          genre: 'Unknown',
          name: a.artist_name,
          playCount: a.total_plays,
          imageUrl: a.artist_image_url || undefined,
        });
      }

      // 4. Cluster artists
      const clusters = clusterArtistsByGenre(artistGenreMap);

      if (clusters.length === 0) {
        return new Response(JSON.stringify([]), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // 5. Build mixes
      const mixes = [];

      for (let i = 0; i < clusters.length; i++) {
        const cluster = clusters[i];
        const mixTracks: any[] = [];

        // 50% Known tracks - get top tracks from these artists
        const comfortTracks: any[] = [];
        for (const artist of cluster.artists.slice(0, 5)) {
          try {
            const data = await fetchDeezer(`${DEEZER_API}/artist/${artist.id}/top?limit=10`);
            const tracks = (data?.data || []).filter((t: any) => knownTrackIds.has(String(t.id)));
            comfortTracks.push(...tracks);
          } catch {
            // Skip
          }
        }

        // If not enough known tracks, add top tracks regardless
        if (comfortTracks.length < 10) {
          for (const artist of cluster.artists.slice(0, 5)) {
            try {
              const data = await fetchDeezer(`${DEEZER_API}/artist/${artist.id}/top?limit=5`);
              for (const t of (data?.data || [])) {
                if (!comfortTracks.find((ct: any) => ct.id === t.id)) {
                  comfortTracks.push(t);
                }
              }
            } catch {
              // Skip
            }
            if (comfortTracks.length >= 10) break;
          }
        }

        // Dedupe and take 10
        const seenIds = new Set<string>();
        const comfort10: any[] = [];
        for (const t of comfortTracks) {
          const tid = String(t.id);
          if (!seenIds.has(tid)) {
            seenIds.add(tid);
            comfort10.push(t);
            if (comfort10.length >= 10) break;
          }
        }

        // 50% Discovery tracks - from artist radio
        const discoveryTracks: any[] = [];
        for (const artist of cluster.artists.slice(0, 5)) {
          const radio = await getArtistRadioTracks(artist.id, 20);
          for (const t of radio) {
            const tid = String(t.id);
            if (!knownTrackIds.has(tid) && !seenIds.has(tid)) {
              discoveryTracks.push(t);
              seenIds.add(tid);
            }
          }
          if (discoveryTracks.length >= 10) break;
        }

        // If not enough discovery, try related artists
        if (discoveryTracks.length < 10 && cluster.artists.length > 0) {
          try {
            const related = await fetchDeezer(`${DEEZER_API}/artist/${cluster.artists[0].id}/related?limit=5`);
            for (const relArtist of (related?.data || [])) {
              const radio = await getArtistRadioTracks(String(relArtist.id), 10);
              for (const t of radio) {
                const tid = String(t.id);
                if (!knownTrackIds.has(tid) && !seenIds.has(tid)) {
                  discoveryTracks.push(t);
                  seenIds.add(tid);
                }
              }
              if (discoveryTracks.length >= 10) break;
            }
          } catch {
            // Skip
          }
        }

        const discovery10 = discoveryTracks.slice(0, 10);

        // Interleave comfort and discovery
        const allTracks = [...comfort10, ...discovery10];
        // Shuffle lightly - keep comfort first half, discovery second half mostly
        for (let j = allTracks.length - 1; j > 0; j--) {
          const k = Math.floor(Math.random() * (j + 1));
          [allTracks[j], allTracks[k]] = [allTracks[k], allTracks[j]];
        }

        const formattedTracks = allTracks.slice(0, 20).map((t: any) => ({
          id: String(t.id),
          title: t.title,
          artist: t.artist?.name || 'Unknown Artist',
          artistId: String(t.artist?.id || ''),
          album: t.album?.title || 'Unknown Album',
          albumId: String(t.album?.id || ''),
          duration: t.duration || 0,
          coverUrl: albumCover(t.album),
        }));

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

      // Filter out empty mixes and re-index
      const validMixes = mixes
        .filter(m => Array.isArray(m.tracks) && m.tracks.length > 0)
        .map((m, idx) => ({ ...m, mix_index: idx, mix_label: `Daily Mix ${idx + 1}` }));

      console.log(`Valid mixes: ${validMixes.length} out of ${mixes.length} generated`);

      // Save to DB
      if (validMixes.length > 0) {
        const { error: insertError } = await supabase
          .from('daily_mixes')
          .insert(validMixes);

        if (insertError) {
          console.error('Error saving mixes:', insertError);
        }
      }

      // Return fresh mixes
      const { data: freshMixes } = await supabase
        .from('daily_mixes')
        .select('*')
        .eq('user_id', user.id)
        .order('mix_index');

      console.log(`Generated ${freshMixes?.length || 0} mixes for user ${user.id}`);

      return new Response(JSON.stringify(freshMixes || mixes), {
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
