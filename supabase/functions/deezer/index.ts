import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEEZER_API = 'https://api.deezer.com';

// Fetch with timeout
async function fetchWithTimeout(url: string, timeout = 10000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } finally {
    clearTimeout(id);
  }
}

// Retry fetch with exponential backoff
async function fetchWithRetry(url: string, retries = 3): Promise<any> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetchWithTimeout(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, query, id, limit = 20, country } = await req.json();

    console.log(`Deezer request: action=${action}, query=${query}, id=${id}`);

    switch (action) {
      case 'search-tracks': {
        const data = await fetchWithRetry(
          `${DEEZER_API}/search/track?q=${encodeURIComponent(query)}&limit=${limit}`
        );
        
        const tracks = (data.data || []).map((track: any) => ({
          id: String(track.id),
          title: track.title,
          artist: track.artist?.name || 'Unknown Artist',
          artistId: String(track.artist?.id || ''),
          album: track.album?.title || 'Unknown Album',
          albumId: String(track.album?.id || ''),
          duration: track.duration || 0,
          coverUrl: track.album?.cover_medium || track.album?.cover || undefined,
          previewUrl: track.preview || undefined,
        }));

        return new Response(JSON.stringify(tracks), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'search-albums': {
        const data = await fetchWithRetry(
          `${DEEZER_API}/search/album?q=${encodeURIComponent(query)}&limit=${limit}`
        );
        
        const albums = (data.data || []).map((album: any) => ({
          id: String(album.id),
          title: album.title,
          artist: album.artist?.name || 'Unknown Artist',
          artistId: String(album.artist?.id || ''),
          coverUrl: album.cover_medium || album.cover_big || album.cover || undefined,
          trackCount: album.nb_tracks || undefined,
        }));

        return new Response(JSON.stringify(albums), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'search-artists': {
        const data = await fetchWithRetry(
          `${DEEZER_API}/search/artist?q=${encodeURIComponent(query)}&limit=${limit}`
        );
        
        const artists = (data.data || []).map((artist: any) => ({
          id: String(artist.id),
          name: artist.name,
          imageUrl: artist.picture_medium || artist.picture_big || artist.picture || undefined,
          popularity: artist.nb_fan || 0,
        }));

        return new Response(JSON.stringify(artists), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'get-artist': {
        const [artistData, albumsData, topData] = await Promise.all([
          fetchWithRetry(`${DEEZER_API}/artist/${id}`),
          fetchWithRetry(`${DEEZER_API}/artist/${id}/albums?limit=50`),
          fetchWithRetry(`${DEEZER_API}/artist/${id}/top?limit=10`),
        ]);

        const artist = {
          id: String(artistData.id),
          name: artistData.name,
          imageUrl: artistData.picture_big || artistData.picture_medium || artistData.picture || undefined,
          popularity: artistData.nb_fan || 0,
          releases: (albumsData.data || []).map((album: any) => ({
            id: String(album.id),
            title: album.title,
            artist: artistData.name,
            artistId: String(artistData.id),
            coverUrl: album.cover_medium || album.cover_big || album.cover || undefined,
            releaseDate: album.release_date || undefined,
            trackCount: album.nb_tracks || undefined,
          })),
          topTracks: (topData.data || []).map((track: any) => ({
            id: String(track.id),
            title: track.title,
            artist: track.artist?.name || artistData.name,
            artistId: String(track.artist?.id || artistData.id),
            album: track.album?.title || 'Unknown Album',
            albumId: String(track.album?.id || ''),
            duration: track.duration || 0,
            coverUrl: track.album?.cover_medium || track.album?.cover || undefined,
            previewUrl: track.preview || undefined,
          })),
        };

        return new Response(JSON.stringify(artist), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'get-artist-top': {
        const data = await fetchWithRetry(
          `${DEEZER_API}/artist/${id}/top?limit=${limit}`
        );
        
        const tracks = (data.data || []).map((track: any) => ({
          id: String(track.id),
          title: track.title,
          artist: track.artist?.name || 'Unknown Artist',
          artistId: String(track.artist?.id || ''),
          album: track.album?.title || 'Unknown Album',
          albumId: String(track.album?.id || ''),
          duration: track.duration || 0,
          coverUrl: track.album?.cover_medium || track.album?.cover || undefined,
          previewUrl: track.preview || undefined,
        }));

        return new Response(JSON.stringify(tracks), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'get-album': {
        const data = await fetchWithRetry(`${DEEZER_API}/album/${id}`);
        
        const album = {
          id: String(data.id),
          title: data.title,
          artist: data.artist?.name || 'Unknown Artist',
          artistId: String(data.artist?.id || ''),
          coverUrl: data.cover_big || data.cover_medium || data.cover || undefined,
          releaseDate: data.release_date || undefined,
          trackCount: data.nb_tracks || undefined,
          tracks: (data.tracks?.data || []).map((track: any, index: number) => ({
            id: String(track.id),
            title: track.title,
            artist: track.artist?.name || data.artist?.name || 'Unknown Artist',
            artistId: String(track.artist?.id || data.artist?.id || ''),
            album: data.title,
            albumId: String(data.id),
            duration: track.duration || 0,
            coverUrl: data.cover_medium || data.cover || undefined,
            previewUrl: track.preview || undefined,
            trackNumber: index + 1,
          })),
        };

        return new Response(JSON.stringify(album), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'get-chart': {
        // Get charts - Deezer provides global charts
        const data = await fetchWithRetry(`${DEEZER_API}/chart`);
        
        const result = {
          tracks: (data.tracks?.data || []).slice(0, limit).map((track: any) => ({
            id: String(track.id),
            title: track.title,
            artist: track.artist?.name || 'Unknown Artist',
            artistId: String(track.artist?.id || ''),
            album: track.album?.title || 'Unknown Album',
            albumId: String(track.album?.id || ''),
            duration: track.duration || 0,
            coverUrl: track.album?.cover_medium || track.album?.cover || undefined,
            previewUrl: track.preview || undefined,
          })),
          albums: (data.albums?.data || []).slice(0, limit).map((album: any) => ({
            id: String(album.id),
            title: album.title,
            artist: album.artist?.name || 'Unknown Artist',
            artistId: String(album.artist?.id || ''),
            coverUrl: album.cover_medium || album.cover_big || album.cover || undefined,
          })),
          artists: (data.artists?.data || []).slice(0, limit).map((artist: any) => ({
            id: String(artist.id),
            name: artist.name,
            imageUrl: artist.picture_medium || artist.picture_big || artist.picture || undefined,
            popularity: artist.nb_fan || 0,
          })),
        };

        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'get-new-releases': {
        // Deezer doesn't have a direct new releases endpoint, use editorial/releases
        const data = await fetchWithRetry(`${DEEZER_API}/editorial/0/releases?limit=${limit}`);
        
        const albums = (data.data || []).map((album: any) => ({
          id: String(album.id),
          title: album.title,
          artist: album.artist?.name || 'Unknown Artist',
          artistId: String(album.artist?.id || ''),
          coverUrl: album.cover_medium || album.cover_big || album.cover || undefined,
          releaseDate: album.release_date || undefined,
          trackCount: album.nb_tracks || undefined,
        }));

        return new Response(JSON.stringify(albums), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'get-popular-artists': {
        // Use chart artists
        const data = await fetchWithRetry(`${DEEZER_API}/chart/0/artists?limit=${limit}`);
        
        const artists = (data.data || []).map((artist: any) => ({
          id: String(artist.id),
          name: artist.name,
          imageUrl: artist.picture_medium || artist.picture_big || artist.picture || undefined,
          popularity: artist.position || 0,
        }));

        return new Response(JSON.stringify(artists), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        return new Response(JSON.stringify({ error: 'Unknown action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
  } catch (error: unknown) {
    console.error('Deezer API error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: 'Deezer API error', details: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
