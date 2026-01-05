import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MUSICBRAINZ_API = 'https://musicbrainz.org/ws/2';
const COVER_ART_API = 'https://coverartarchive.org';
const FANART_API = 'https://webservice.fanart.tv/v3';

// You can get a free API key from https://fanart.tv/get-an-api-key/
const FANART_API_KEY = Deno.env.get('FANART_API_KEY') || '';

// Retry fetch with exponential backoff
async function fetchWithRetry(url: string, options: RequestInit = {}, maxRetries = 3): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Add delay between retries (exponential backoff)
      if (attempt > 0) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });
      
      // If rate limited, wait and retry
      if (response.status === 503 || response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 2000;
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.log(`Fetch attempt ${attempt + 1} failed for ${url}: ${lastError.message}`);
      
      // Don't retry on abort/timeout for last attempt
      if (attempt === maxRetries - 1) {
        break;
      }
    }
  }
  
  throw lastError || new Error('Fetch failed after retries');
}

async function getArtistImage(mbid: string): Promise<string | undefined> {
  // Try fanart.tv first if we have an API key
  if (FANART_API_KEY) {
    try {
      const response = await fetchWithRetry(`${FANART_API}/music/${mbid}?api_key=${FANART_API_KEY}`, {}, 2);
      if (response.ok) {
        const data = await response.json();
        // Get artistthumb or artistbackground
        if (data.artistthumb && data.artistthumb.length > 0) {
          return data.artistthumb[0].url;
        }
        if (data.artistbackground && data.artistbackground.length > 0) {
          return data.artistbackground[0].url;
        }
      }
    } catch (e) {
      console.log('Fanart.tv fetch failed:', e);
    }
  }
  
  // Fallback: try to get from Wikipedia/Wikidata via MusicBrainz relations
  try {
    const url = `${MUSICBRAINZ_API}/artist/${mbid}?inc=url-rels&fmt=json`;
    const response = await fetchWithRetry(url, {
      headers: { 'User-Agent': 'SoundFlow/1.0.0 (https://soundflow.app)' }
    }, 2);
    if (response.ok) {
      const data = await response.json();
      // Find Wikidata relation
      const wikidataRel = data.relations?.find((r: any) => r.type === 'wikidata');
      if (wikidataRel) {
        const wikidataId = wikidataRel.url?.resource?.split('/').pop();
        if (wikidataId) {
          // Get image from Wikidata
          const wdResponse = await fetchWithRetry(`https://www.wikidata.org/wiki/Special:EntityData/${wikidataId}.json`, {}, 2);
          if (wdResponse.ok) {
            const wdData = await wdResponse.json();
            const imageFile = wdData.entities?.[wikidataId]?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
            if (imageFile) {
              // Convert to Commons URL
              const fileName = encodeURIComponent(imageFile.replace(/ /g, '_'));
              return `https://commons.wikimedia.org/wiki/Special:FilePath/${fileName}?width=500`;
            }
          }
        }
      }
    }
  } catch (e) {
    console.log('Wikipedia/Wikidata fetch failed:', e);
  }
  
  return undefined;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, query, id, limit = 25, country = 'IT' } = await req.json();
    console.log(`MusicBrainz request: action=${action}, query=${query}, id=${id}, country=${country}`);

    const headers = {
      'User-Agent': 'SoundFlow/1.0.0 (https://soundflow.app)',
      'Accept': 'application/json',
    };

    let result;

    switch (action) {
      case 'search-artists': {
        const url = `${MUSICBRAINZ_API}/artist?query=${encodeURIComponent(query)}&limit=${limit}&fmt=json`;
        const response = await fetchWithRetry(url, { headers });
        const data = await response.json();
        
        // Get images for top artists
        const artists = await Promise.all((data.artists || []).slice(0, 10).map(async (a: any) => {
          const imageUrl = await getArtistImage(a.id);
          return {
            id: a.id,
            name: a.name,
            imageUrl,
            genres: a.tags?.slice(0, 3).map((t: any) => t.name) || [],
            country: a.country,
            type: a.type,
          };
        }));
        
        // Add remaining artists without images
        const remaining = (data.artists || []).slice(10).map((a: any) => ({
          id: a.id,
          name: a.name,
          genres: a.tags?.slice(0, 3).map((t: any) => t.name) || [],
          country: a.country,
          type: a.type,
        }));
        
        result = [...artists, ...remaining];
        break;
      }

      case 'search-releases': {
        const url = `${MUSICBRAINZ_API}/release?query=${encodeURIComponent(query)}&limit=${limit}&fmt=json`;
        const response = await fetchWithRetry(url, { headers });
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
        const response = await fetchWithRetry(url, { headers });
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
        const response = await fetchWithRetry(url, { headers });
        const data = await response.json();
        
        // Get artist image
        const imageUrl = await getArtistImage(id);
        
        // Get releases with covers
        const releasesUrl = `${MUSICBRAINZ_API}/release?artist=${id}&limit=30&fmt=json`;
        const releasesRes = await fetchWithRetry(releasesUrl, { headers });
        const releasesData = await releasesRes.json();
        
        // Sort by date and get unique albums
        const sortedReleases = (releasesData.releases || [])
          .sort((a: any, b: any) => {
            const dateA = a.date ? new Date(a.date).getTime() : 0;
            const dateB = b.date ? new Date(b.date).getTime() : 0;
            return dateB - dateA;
          });
        
        const releases = await Promise.all(sortedReleases.slice(0, 12).map(async (r: any) => {
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
          imageUrl,
          genres: data.tags?.slice(0, 5).map((t: any) => t.name) || [],
          country: data.country,
          type: data.type,
          releases,
        };
        break;
      }

      case 'get-artist-recordings': {
        // Get popular recordings by this artist
        const url = `${MUSICBRAINZ_API}/recording?artist=${id}&limit=${limit}&fmt=json`;
        const response = await fetchWithRetry(url, { headers });
        const data = await response.json();
        
        // Get album covers for the recordings
        const recordings = await Promise.all((data.recordings || []).slice(0, limit).map(async (r: any) => {
          let coverUrl;
          const albumId = r.releases?.[0]?.id;
          if (albumId) {
            try {
              const coverRes = await fetch(`${COVER_ART_API}/release/${albumId}`, { headers });
              if (coverRes.ok) {
                const coverData = await coverRes.json();
                coverUrl = coverData.images?.[0]?.thumbnails?.small || coverData.images?.[0]?.image;
              }
            } catch { /* no cover */ }
          }
          
          return {
            id: r.id,
            title: r.title,
            artist: r['artist-credit']?.[0]?.name || 'Unknown',
            artistId: r['artist-credit']?.[0]?.artist?.id,
            duration: r.length ? Math.floor(r.length / 1000) : 0,
            album: r.releases?.[0]?.title,
            albumId: r.releases?.[0]?.id,
            coverUrl,
          };
        }));
        
        result = recordings;
        break;
      }

      case 'get-release': {
        const url = `${MUSICBRAINZ_API}/release/${id}?inc=recordings+artist-credits&fmt=json`;
        const response = await fetchWithRetry(url, { headers });
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

      case 'get-new-releases': {
        // Get recent releases, filter by country if specified
        const today = new Date();
        const threeMonthsAgo = new Date(today.setMonth(today.getMonth() - 3));
        const dateStr = threeMonthsAgo.toISOString().split('T')[0];
        
        let queryStr = `date:[${dateStr} TO *]`;
        if (country) {
          queryStr += ` AND country:${country}`;
        }
        
        const url = `${MUSICBRAINZ_API}/release?query=${encodeURIComponent(queryStr)}&limit=${limit}&fmt=json`;
        const response = await fetchWithRetry(url, { headers });
        const data = await response.json();
        
        result = await Promise.all((data.releases || []).slice(0, limit).map(async (r: any) => {
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

      case 'get-popular-artists': {
        // Use a list of known popular artists per country for better results
        const popularByCountry: Record<string, string[]> = {
          'IT': ['Måneskin', 'Laura Pausini', 'Eros Ramazzotti', 'Andrea Bocelli', 'Zucchero', 'Jovanotti', 'Ligabue', 'Vasco Rossi', 'Tiziano Ferro', 'Gianna Nannini', 'Caparezza', 'Salmo', 'Ghali', 'Sfera Ebbasta', 'Fedez'],
          'US': ['Taylor Swift', 'Drake', 'Beyoncé', 'Kendrick Lamar', 'Post Malone', 'Billie Eilish', 'The Weeknd', 'Doja Cat', 'SZA', 'Bad Bunny', 'Travis Scott', 'Ariana Grande'],
          'ES': ['Rosalía', 'Bad Bunny', 'J Balvin', 'Enrique Iglesias', 'Shakira', 'Alejandro Sanz', 'Pablo Alborán', 'Malú', 'David Bisbal', 'Aitana'],
          'FR': ['Stromae', 'Daft Punk', 'David Guetta', 'Aya Nakamura', 'Jul', 'Ninho', 'Angèle', 'Christine and the Queens', 'Indila', 'Zaz'],
          'DE': ['Rammstein', 'Kraftwerk', 'Scorpions', 'Nena', 'Tokio Hotel', 'Seeed', 'Cro', 'Sido', 'Marteria', 'Peter Fox'],
          'PT': ['Amália Rodrigues', 'Mariza', 'Salvador Sobral', 'Ana Moura', 'David Carreira', 'Diogo Piçarra', 'Bárbara Tinoco', 'Blaya'],
        };
        
        const artistNames = popularByCountry[country || 'IT'] || popularByCountry['IT'];
        const shuffledNames = artistNames.sort(() => Math.random() - 0.5).slice(0, limit);
        
        const artists: any[] = [];
        
        for (const name of shuffledNames) {
          try {
            const url = `${MUSICBRAINZ_API}/artist?query=${encodeURIComponent(`artist:"${name}"`)}&limit=1&fmt=json`;
            const response = await fetchWithRetry(url, { headers });
            const data = await response.json();
            
            if (data.artists?.[0]) {
              const a = data.artists[0];
              const imageUrl = await getArtistImage(a.id);
              artists.push({
                id: a.id,
                name: a.name,
                imageUrl,
                genres: a.tags?.slice(0, 3).map((t: any) => t.name) || [],
                country: a.country,
                type: a.type,
              });
            }
          } catch (e) {
            console.error(`Error fetching artist ${name}:`, e);
          }
        }
        
        result = artists;
        break;
      }

      case 'get-charts': {
        // Get popular releases (simulated with recent releases)
        const url = `${MUSICBRAINZ_API}/release?query=*&limit=20&fmt=json`;
        const response = await fetchWithRetry(url, { headers });
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
