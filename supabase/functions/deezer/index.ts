import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEEZER_API = 'https://api.deezer.com';

// Headers to avoid being blocked by Deezer API
const requestHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
};

// Fetch with timeout
async function fetchWithTimeout(url: string, timeout = 10000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { 
      signal: controller.signal,
      headers: requestHeaders,
    });
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
        // Log response body for debugging
        const text = await response.text();
        console.error(`Deezer API response ${response.status}:`, text.substring(0, 200));
        
        // If it's a 403, don't retry - return graceful error
        if (response.status === 403) {
          return { error: true, status: 403, message: 'Access denied by Deezer' };
        }
        
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.log(`Attempt ${i + 1} failed:`, error);
      if (i === retries - 1) {
        // Return graceful error instead of throwing
        return { error: true, message: String(error) };
      }
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  return { error: true, message: 'Max retries exceeded' };
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
        
        // Fetch full album details to get release_date for each album
        const albumIds = (data.data || []).slice(0, 10).map((a: any) => a.id);
        const albumDetailsPromises = albumIds.map((albumId: number) =>
          fetchWithRetry(`${DEEZER_API}/album/${albumId}`).catch(() => null)
        );
        
        const albumDetails = await Promise.all(albumDetailsPromises);
        const detailsMap = new Map<string, any>();
        albumDetails.forEach((detail) => {
          if (detail && detail.id) {
            detailsMap.set(String(detail.id), detail);
          }
        });
        
        const albums = (data.data || []).map((album: any) => {
          const detail = detailsMap.get(String(album.id));
          return {
            id: String(album.id),
            title: album.title,
            artist: album.artist?.name || 'Unknown Artist',
            artistId: String(album.artist?.id || ''),
            coverUrl: album.cover_medium || album.cover_big || album.cover || undefined,
            trackCount: album.nb_tracks || undefined,
            releaseDate: detail?.release_date || undefined,
            recordType: detail?.record_type || album.record_type || undefined,
          };
        });

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
        const [artistData, albumsData, topData, relatedData] = await Promise.all([
          fetchWithRetry(`${DEEZER_API}/artist/${id}`),
          fetchWithRetry(`${DEEZER_API}/artist/${id}/albums?limit=50`),
          fetchWithRetry(`${DEEZER_API}/artist/${id}/top?limit=20`),
          fetchWithRetry(`${DEEZER_API}/artist/${id}/related?limit=10`).catch(() => ({ data: [] })),
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
            recordType: album.record_type || 'album',
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
          relatedArtists: (relatedData.data || []).map((artist: any) => ({
            id: String(artist.id),
            name: artist.name,
            imageUrl: artist.picture_medium || artist.picture_big || artist.picture || undefined,
            popularity: artist.nb_fan || 0,
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

      case 'search-playlists': {
        const data = await fetchWithRetry(
          `${DEEZER_API}/search/playlist?q=${encodeURIComponent(query)}&limit=${limit}`
        );
        
        const playlists = (data.data || []).map((playlist: any) => ({
          id: String(playlist.id),
          title: playlist.title,
          description: playlist.description || '',
          coverUrl: playlist.picture_medium || playlist.picture_big || playlist.picture || undefined,
          trackCount: playlist.nb_tracks || 0,
          creator: playlist.user?.name || 'Deezer',
          isEditable: false,
          isDeezerPlaylist: true,
        }));

        return new Response(JSON.stringify(playlists), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'get-playlist': {
        try {
          const data = await fetchWithRetry(`${DEEZER_API}/playlist/${id}`);
          
          const playlist = {
            id: String(data.id),
            title: data.title,
            description: data.description || '',
            coverUrl: data.picture_big || data.picture_medium || data.picture || undefined,
            trackCount: data.nb_tracks || 0,
            creator: data.creator?.name || 'Deezer',
            duration: data.duration || 0,
            tracks: (data.tracks?.data || []).map((track: any, index: number) => ({
              id: String(track.id),
              title: track.title,
              artist: track.artist?.name || 'Unknown Artist',
              artistId: String(track.artist?.id || ''),
              album: track.album?.title || 'Unknown Album',
              albumId: String(track.album?.id || ''),
              duration: track.duration || 0,
              coverUrl: track.album?.cover_medium || track.album?.cover || undefined,
              previewUrl: track.preview || undefined,
              trackNumber: index + 1,
            })),
          };

          return new Response(JSON.stringify(playlist), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } catch (error) {
          // Return empty playlist on error (403, etc.) instead of throwing
          console.error(`Error fetching playlist ${id}:`, error);
          return new Response(JSON.stringify({
            id: String(id),
            title: '',
            description: '',
            coverUrl: null,
            trackCount: 0,
            creator: '',
            duration: 0,
            tracks: [],
            error: true,
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      case 'get-artist-playlists': {
        // Search for "100% ArtistName" playlists on Deezer
        const artistName = query;
        const searchQueries = [
          `100% ${artistName}`,
          `This is ${artistName}`,
          `Best of ${artistName}`,
          artistName,
        ];
        
        const allPlaylists: any[] = [];
        
        for (const q of searchQueries) {
          try {
            const data = await fetchWithRetry(
              `${DEEZER_API}/search/playlist?q=${encodeURIComponent(q)}&limit=5`
            );
            
            const playlists = (data.data || [])
              .filter((p: any) => {
                const title = p.title?.toLowerCase() || '';
                const artistLower = artistName.toLowerCase();
                return title.includes(artistLower) || 
                       title.includes('100%') ||
                       title.includes('this is') ||
                       title.includes('best of');
              })
              .map((playlist: any) => ({
                id: String(playlist.id),
                title: playlist.title,
                description: playlist.description || '',
                coverUrl: playlist.picture_medium || playlist.picture_big || playlist.picture || undefined,
                trackCount: playlist.nb_tracks || 0,
                creator: playlist.user?.name || 'Deezer',
              }));
            
            allPlaylists.push(...playlists);
          } catch (e) {
            console.error(`Error searching playlists for "${q}":`, e);
          }
        }
        
        // Dedupe by ID
        const unique = allPlaylists.reduce((acc, p) => {
          if (!acc.find((x: any) => x.id === p.id)) acc.push(p);
          return acc;
        }, [] as any[]);

        return new Response(JSON.stringify(unique.slice(0, 6)), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'get-country-chart': {
        // Fallback country codes to Deezer chart IDs mapping
        const defaultCountryToEditorial: Record<string, string> = {
          'IT': '116',
          'US': '0',
          'ES': '134',
          'FR': '52',
          'DE': '56',
          'PT': '131',
          'GB': '104',
          'BR': '91',
        };
        
        // Try to fetch from database configuration
        let playlistId = defaultCountryToEditorial[country?.toUpperCase()] ?? '0';
        let usePlaylist = false;
        let useSoundFlowPlaylist = false;
        
        try {
          const supabaseUrl = Deno.env.get('SUPABASE_URL');
          const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
          
          if (supabaseUrl && supabaseKey) {
            const configResponse = await fetch(
              `${supabaseUrl}/rest/v1/chart_configurations?country_code=eq.${country?.toUpperCase()}&select=playlist_id`,
              {
                headers: {
                  'apikey': supabaseKey,
                  'Authorization': `Bearer ${supabaseKey}`,
                },
              }
            );
            
            if (configResponse.ok) {
              const configData = await configResponse.json();
              if (configData && configData.length > 0 && configData[0].playlist_id) {
                playlistId = configData[0].playlist_id;
                
                // Check if it's a SoundFlow playlist (prefixed with "sf:")
                if (playlistId.startsWith('sf:')) {
                  useSoundFlowPlaylist = true;
                  playlistId = playlistId.replace('sf:', '');
                } else if (playlistId.length > 3) {
                  // If playlist_id is a long number (more than 3 digits), it's a Deezer playlist ID
                  usePlaylist = true;
                }
              }
            }
          }
        } catch (configError) {
          console.error('Failed to fetch chart configuration, using default:', configError);
        }
        
        console.log(`Getting chart for country: ${country}, ID: ${playlistId}, isDeezerPlaylist: ${usePlaylist}, isSoundFlow: ${useSoundFlowPlaylist}`);
        
        let tracks: any[] = [];
        
        if (useSoundFlowPlaylist) {
          // Fetch tracks from SoundFlow (local) playlist
          try {
            const supabaseUrl = Deno.env.get('SUPABASE_URL');
            const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
            
            if (supabaseUrl && supabaseKey) {
              const tracksResponse = await fetch(
                `${supabaseUrl}/rest/v1/playlist_tracks?playlist_id=eq.${playlistId}&order=position.asc&limit=${limit}&select=track_id,track_title,track_artist,track_album,track_album_id,track_cover_url,track_duration`,
                {
                  headers: {
                    'apikey': supabaseKey,
                    'Authorization': `Bearer ${supabaseKey}`,
                  },
                }
              );
              
              if (tracksResponse.ok) {
                const tracksData = await tracksResponse.json();
                tracks = (tracksData || []).map((t: any, index: number) => ({
                  id: t.track_id,
                  title: t.track_title,
                  artist: t.track_artist || 'Unknown Artist',
                  artistId: '',
                  album: t.track_album || 'Unknown Album',
                  albumId: t.track_album_id || '',
                  duration: t.track_duration || 0,
                  coverUrl: t.track_cover_url || undefined,
                  position: index + 1,
                }));
              }
            }
          } catch (sfError) {
            console.error('Failed to fetch SoundFlow playlist:', sfError);
          }
        } else {
          let data;
          if (usePlaylist) {
            // Fetch tracks from a Deezer playlist
            data = await fetchWithRetry(`${DEEZER_API}/playlist/${playlistId}/tracks?limit=${limit}`);
          } else {
            // Fetch from editorial chart
            data = await fetchWithRetry(`${DEEZER_API}/chart/${playlistId}/tracks?limit=${limit}`);
          }
          
          tracks = (data.data || []).map((track: any, index: number) => ({
            id: String(track.id),
            title: track.title,
            artist: track.artist?.name || 'Unknown Artist',
            artistId: String(track.artist?.id || ''),
            album: track.album?.title || 'Unknown Album',
            albumId: String(track.album?.id || ''),
            duration: track.duration || 0,
            coverUrl: track.album?.cover_medium || track.album?.cover || undefined,
            previewUrl: track.preview || undefined,
            position: index + 1,
          }));
        }

        return new Response(JSON.stringify(tracks), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'get-track': {
        const data = await fetchWithRetry(`${DEEZER_API}/track/${id}`);
        
        if (data.error) {
          return new Response(JSON.stringify({ error: 'Track not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        const track = {
          id: String(data.id),
          title: data.title,
          artist: data.artist?.name || 'Unknown Artist',
          artistId: String(data.artist?.id || ''),
          album: data.album?.title || 'Unknown Album',
          albumId: String(data.album?.id || ''),
          duration: data.duration || 0,
          coverUrl: data.album?.cover_medium || data.album?.cover || undefined,
          previewUrl: data.preview || undefined,
        };

        return new Response(JSON.stringify(track), {
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
