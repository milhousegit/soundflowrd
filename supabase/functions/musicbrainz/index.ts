import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MUSICBRAINZ_API = 'https://musicbrainz.org/ws/2';
const COVER_ART_API = 'https://coverartarchive.org';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, query, id, limit = 25 } = await req.json();
    console.log(`MusicBrainz request: action=${action}, query=${query}, id=${id}`);

    const headers = {
      'User-Agent': 'SoundFlow/1.0.0 (https://soundflow.app)',
      'Accept': 'application/json',
    };

    let result;

    switch (action) {
      case 'search-artists': {
        const url = `${MUSICBRAINZ_API}/artist?query=${encodeURIComponent(query)}&limit=${limit}&fmt=json`;
        const response = await fetch(url, { headers });
        const data = await response.json();
        result = data.artists?.map((a: any) => ({
          id: a.id,
          name: a.name,
          genres: a.tags?.slice(0, 3).map((t: any) => t.name) || [],
          country: a.country,
          type: a.type,
        })) || [];
        break;
      }

      case 'search-releases': {
        const url = `${MUSICBRAINZ_API}/release?query=${encodeURIComponent(query)}&limit=${limit}&fmt=json`;
        const response = await fetch(url, { headers });
        const data = await response.json();
        result = await Promise.all((data.releases || []).map(async (r: any) => {
          let coverUrl;
          try {
            const coverRes = await fetch(`${COVER_ART_API}/release/${r.id}`, { headers });
            if (coverRes.ok) {
              const coverData = await coverRes.json();
              coverUrl = coverData.images?.[0]?.thumbnails?.small || coverData.images?.[0]?.image;
            }
          } catch { /* no cover */ }
          
          return {
            id: r.id,
            title: r.title,
            artist: r['artist-credit']?.[0]?.name || 'Unknown',
            artistId: r['artist-credit']?.[0]?.artist?.id,
            releaseDate: r.date,
            trackCount: r['track-count'],
            coverUrl,
          };
        }));
        break;
      }

      case 'search-recordings': {
        const url = `${MUSICBRAINZ_API}/recording?query=${encodeURIComponent(query)}&limit=${limit}&fmt=json`;
        const response = await fetch(url, { headers });
        const data = await response.json();
        result = data.recordings?.map((r: any) => ({
          id: r.id,
          title: r.title,
          artist: r['artist-credit']?.[0]?.name || 'Unknown',
          artistId: r['artist-credit']?.[0]?.artist?.id,
          duration: r.length ? Math.floor(r.length / 1000) : 0,
          album: r.releases?.[0]?.title,
          albumId: r.releases?.[0]?.id,
        })) || [];
        break;
      }

      case 'get-artist': {
        const url = `${MUSICBRAINZ_API}/artist/${id}?inc=releases+recordings+tags&fmt=json`;
        const response = await fetch(url, { headers });
        const data = await response.json();
        
        // Get releases with covers
        const releasesUrl = `${MUSICBRAINZ_API}/release?artist=${id}&limit=20&fmt=json`;
        const releasesRes = await fetch(releasesUrl, { headers });
        const releasesData = await releasesRes.json();
        
        const releases = await Promise.all((releasesData.releases || []).slice(0, 10).map(async (r: any) => {
          let coverUrl;
          try {
            const coverRes = await fetch(`${COVER_ART_API}/release/${r.id}`, { headers });
            if (coverRes.ok) {
              const coverData = await coverRes.json();
              coverUrl = coverData.images?.[0]?.thumbnails?.small || coverData.images?.[0]?.image;
            }
          } catch { /* no cover */ }
          
          return {
            id: r.id,
            title: r.title,
            releaseDate: r.date,
            trackCount: r['track-count'],
            coverUrl,
          };
        }));

        result = {
          id: data.id,
          name: data.name,
          genres: data.tags?.slice(0, 5).map((t: any) => t.name) || [],
          country: data.country,
          type: data.type,
          releases,
        };
        break;
      }

      case 'get-release': {
        const url = `${MUSICBRAINZ_API}/release/${id}?inc=recordings+artist-credits&fmt=json`;
        const response = await fetch(url, { headers });
        const data = await response.json();
        
        let coverUrl;
        try {
          const coverRes = await fetch(`${COVER_ART_API}/release/${id}`, { headers });
          if (coverRes.ok) {
            const coverData = await coverRes.json();
            coverUrl = coverData.images?.[0]?.thumbnails?.large || coverData.images?.[0]?.image;
          }
        } catch { /* no cover */ }

        const tracks = data.media?.[0]?.tracks?.map((t: any) => ({
          id: t.recording?.id || t.id,
          title: t.title,
          duration: t.length ? Math.floor(t.length / 1000) : 0,
          position: t.position,
        })) || [];

        result = {
          id: data.id,
          title: data.title,
          artist: data['artist-credit']?.[0]?.name || 'Unknown',
          artistId: data['artist-credit']?.[0]?.artist?.id,
          releaseDate: data.date,
          coverUrl,
          tracks,
        };
        break;
      }

      case 'get-charts': {
        // Get popular releases (simulated with recent releases)
        const url = `${MUSICBRAINZ_API}/release?query=*&limit=20&fmt=json`;
        const response = await fetch(url, { headers });
        const data = await response.json();
        result = data.releases || [];
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    console.log(`MusicBrainz result: ${JSON.stringify(result).slice(0, 200)}...`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('MusicBrainz error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
