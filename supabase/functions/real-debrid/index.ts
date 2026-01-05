import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RD_API = 'https://api.real-debrid.com/rest/1.0';

// Fetch with retry logic
async function fetchWithRetry(url: string, options: RequestInit, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      return response;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.log(`Fetch attempt ${i + 1} failed:`, errorMessage);
      if (i === retries - 1) throw err;
      await new Promise(resolve => setTimeout(resolve, 500 * (i + 1)));
    }
  }
  throw new Error('All fetch attempts failed');
}

interface TorrentResult {
  title: string;
  magnet: string;
  size: string;
  seeders: number;
  source: string;
}

// Search apibay.org (Pirate Bay API)
async function searchApibay(query: string): Promise<TorrentResult[]> {
  const results: TorrentResult[] = [];
  
  try {
    const searchUrl = `https://apibay.org/q.php?q=${encodeURIComponent(query)}`;
    console.log('Searching apibay:', query);
    
    const response = await fetch(searchUrl, {
      headers: { 'Accept': 'application/json' },
    });
    
    if (response.ok) {
      const data = await response.json();
      
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item.id === '0' || item.id === 0) continue;
          
          const magnet = `magnet:?xt=urn:btih:${item.info_hash}&dn=${encodeURIComponent(item.name)}`;
          const sizeNum = parseInt(item.size) || 0;
          const sizeMB = sizeNum > 0 ? `${Math.round(sizeNum / 1024 / 1024)}MB` : 'Unknown';
          
          results.push({
            title: item.name,
            magnet,
            size: sizeMB,
            seeders: parseInt(item.seeders) || 0,
            source: 'TPB',
          });
        }
      }
    }
  } catch (error) {
    console.error('Apibay error:', error);
  }
  
  return results;
}

// Search Il Corsaro Nero (Italian torrent site)
async function searchCorsaroNero(query: string): Promise<TorrentResult[]> {
  const results: TorrentResult[] = [];
  
  try {
    // Il Corsaro Nero search - try multiple domains
    const domains = ['ilcorsaronero.link', 'ilcorsaronero.info', 'ilcorsaronero.ch'];
    
    for (const domain of domains) {
      try {
        const searchUrl = `https://${domain}/argh.php?search=${encodeURIComponent(query)}`;
        console.log('Searching Corsaro Nero:', domain);
        
        const response = await fetch(searchUrl, {
          headers: { 
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml',
          },
        });
        
        if (response.ok) {
          const html = await response.text();
          
          // Extract magnet links from page
          const magnetRegex = /magnet:\?xt=urn:btih:[a-zA-Z0-9]+[^"'\s<>]*/gi;
          const magnets = html.match(magnetRegex) || [];
          
          // Extract titles - look for links with torrent info
          const titleRegex = /<a[^>]*href="[^"]*magnet[^"]*"[^>]*>([^<]+)<\/a>/gi;
          const rowRegex = /<tr[^>]*class="[^"]*odd|even[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi;
          
          // Simple extraction - get unique magnets
          const uniqueMagnets = [...new Set(magnets)];
          
          for (let i = 0; i < Math.min(uniqueMagnets.length, 5); i++) {
            const magnet = uniqueMagnets[i];
            const dnMatch = magnet.match(/dn=([^&]+)/);
            const title = dnMatch ? decodeURIComponent(dnMatch[1].replace(/\+/g, ' ')) : `Corsaro Result ${i + 1}`;
            
            results.push({
              title,
              magnet,
              size: 'Unknown',
              seeders: 0,
              source: 'CNero',
            });
          }
          
          if (results.length > 0) break; // Found results, stop trying other domains
        }
      } catch (domainError) {
        console.log(`Corsaro Nero ${domain} failed:`, domainError);
        continue;
      }
    }
  } catch (error) {
    console.error('Corsaro Nero error:', error);
  }
  
  return results;
}

// Search 1337x via API proxy
async function search1337x(query: string): Promise<TorrentResult[]> {
  const results: TorrentResult[] = [];
  
  try {
    const searchUrl = `https://1337x.wtf/search/${encodeURIComponent(query)}/1/`;
    console.log('Searching 1337x:', query);
    
    const response = await fetch(searchUrl, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html',
      },
    });
    
    if (response.ok) {
      const html = await response.text();
      const linkRegex = /href="\/torrent\/(\d+)\/([^"]+)"/g;
      const matches = [...html.matchAll(linkRegex)];
      
      for (const match of matches.slice(0, 3)) {
        const torrentId = match[1];
        const torrentSlug = match[2];
        
        try {
          const torrentUrl = `https://1337x.wtf/torrent/${torrentId}/${torrentSlug}/`;
          const torrentRes = await fetch(torrentUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          });
          
          if (torrentRes.ok) {
            const torrentHtml = await torrentRes.text();
            const magnetMatch = torrentHtml.match(/magnet:\?xt=urn:btih:[^"]+/);
            
            if (magnetMatch) {
              results.push({
                title: torrentSlug.replace(/-/g, ' '),
                magnet: magnetMatch[0],
                size: 'Unknown',
                seeders: 0,
                source: '1337x',
              });
            }
          }
        } catch (e) {
          console.error('1337x torrent fetch error:', e);
        }
      }
    }
  } catch (error) {
    console.error('1337x error:', error);
  }
  
  return results;
}

// Combined search from multiple sources
async function searchTorrents(query: string): Promise<TorrentResult[]> {
  console.log('Searching all sources for:', query);
  
  // Search multiple sources in parallel
  const [apibayResults, corsaroResults] = await Promise.all([
    searchApibay(query).catch(() => []),
    searchCorsaroNero(query).catch(() => []),
  ]);
  
  const allResults = [...apibayResults, ...corsaroResults];
  
  // Sort by seeders (TPB results have seeders, others don't)
  allResults.sort((a, b) => b.seeders - a.seeders);
  
  console.log(`Found ${allResults.length} total torrents (TPB: ${apibayResults.length}, CNero: ${corsaroResults.length})`);
  return allResults.slice(0, 10);
}

// Normalize string for matching
function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Match track in file list
function findBestTrackMatch(files: {id: number, path: string, filename: string}[], trackName: string, artistName?: string): {id: number, path: string, filename: string, score: number}[] {
  const normalizedTrack = normalizeString(trackName);
  const normalizedArtist = artistName ? normalizeString(artistName) : '';
  const trackWords = normalizedTrack.split(' ').filter(w => w.length > 2);
  
  const scored = files.map(file => {
    const normalizedFile = normalizeString(file.filename);
    
    let score = 0;
    
    // Exact track name match
    if (normalizedFile.includes(normalizedTrack)) {
      score += 100;
    }
    
    // Word matches
    for (const word of trackWords) {
      if (normalizedFile.includes(word)) {
        score += 10;
      }
    }
    
    // Artist name match (bonus)
    if (normalizedArtist && normalizedFile.includes(normalizedArtist)) {
      score += 20;
    }
    
    // Penalty for compilation/various artists
    if (normalizedFile.includes('various') || normalizedFile.includes('compilation')) {
      score -= 30;
    }
    
    return { ...file, score };
  });
  
  return scored.filter(f => f.score > 0).sort((a, b) => b.score - a.score);
}

// Get all audio files from a torrent
async function getAlbumTracks(apiKey: string, magnet: string, source: string): Promise<{
  torrentId: string;
  files: {id: number, path: string, filename: string}[];
  links: string[];
} | null> {
  const rdHeaders = { 'Authorization': `Bearer ${apiKey}` };
  
  try {
    const formData = new FormData();
    formData.append('magnet', magnet);
    
    const addRes = await fetchWithRetry(`${RD_API}/torrents/addMagnet`, {
      method: 'POST',
      headers: rdHeaders,
      body: formData,
    });
    
    if (!addRes.ok) {
      console.log('Failed to add magnet:', await addRes.text());
      return null;
    }
    
    const addData = await addRes.json();
    const torrentId = addData.id;
    console.log('Torrent added:', torrentId);
    
    // Get torrent info to see files
    const infoRes1 = await fetchWithRetry(`${RD_API}/torrents/info/${torrentId}`, {
      headers: rdHeaders,
    });
    
    if (!infoRes1.ok) return null;
    
    const info1 = await infoRes1.json();
    
    // Get all audio files
    const audioFiles: {id: number, path: string, filename: string}[] = [];
    const audioFileIds: string[] = [];
    
    if (info1.files && Array.isArray(info1.files)) {
      for (const file of info1.files) {
        const filepath = file.path || '';
        const filename = filepath.split('/').pop() || filepath;
        const lowerFilename = filename.toLowerCase();
        
        if (lowerFilename.endsWith('.mp3') || lowerFilename.endsWith('.flac') || 
            lowerFilename.endsWith('.m4a') || lowerFilename.endsWith('.wav') ||
            lowerFilename.endsWith('.aac') || lowerFilename.endsWith('.ogg')) {
          audioFiles.push({ id: file.id, path: filepath, filename });
          audioFileIds.push(file.id.toString());
        }
      }
    }
    
    console.log(`Found ${audioFiles.length} audio files in torrent`);
    
    if (audioFileIds.length === 0) return null;
    
    // Select all audio files
    const selectForm = new FormData();
    selectForm.append('files', audioFileIds.join(','));
    
    await fetchWithRetry(`${RD_API}/torrents/selectFiles/${torrentId}`, {
      method: 'POST',
      headers: rdHeaders,
      body: selectForm,
    });
    
    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Get updated info with links
    const infoRes2 = await fetchWithRetry(`${RD_API}/torrents/info/${torrentId}`, {
      headers: rdHeaders,
    });
    
    if (!infoRes2.ok) return null;
    
    const info2 = await infoRes2.json();
    console.log('Status:', info2.status, 'Links:', info2.links?.length);
    
    return { 
      torrentId, 
      files: audioFiles,
      links: info2.links || []
    };
  } catch (error) {
    console.error('Get album tracks error:', error);
    return null;
  }
}

// Add magnet to Real-Debrid and get download links
async function processMagnet(apiKey: string, magnet: string, source: string): Promise<{id: string, links: string[], source: string} | null> {
  const rdHeaders = { 'Authorization': `Bearer ${apiKey}` };
  
  try {
    const formData = new FormData();
    formData.append('magnet', magnet);
    
    const addRes = await fetchWithRetry(`${RD_API}/torrents/addMagnet`, {
      method: 'POST',
      headers: rdHeaders,
      body: formData,
    });
    
    if (!addRes.ok) {
      console.log('Failed to add magnet:', await addRes.text());
      return null;
    }
    
    const addData = await addRes.json();
    const torrentId = addData.id;
    console.log('Torrent added:', torrentId);
    
    // Get torrent info
    const infoRes1 = await fetchWithRetry(`${RD_API}/torrents/info/${torrentId}`, {
      headers: rdHeaders,
    });
    
    if (!infoRes1.ok) return null;
    
    const info1 = await infoRes1.json();
    
    // Select audio files only
    const audioFileIds: string[] = [];
    if (info1.files && Array.isArray(info1.files)) {
      for (const file of info1.files) {
        const filename = file.path?.toLowerCase() || '';
        if (filename.endsWith('.mp3') || filename.endsWith('.flac') || 
            filename.endsWith('.m4a') || filename.endsWith('.wav') ||
            filename.endsWith('.aac') || filename.endsWith('.ogg')) {
          audioFileIds.push(file.id.toString());
        }
      }
    }
    
    const filesToSelect = audioFileIds.length > 0 ? audioFileIds.join(',') : 'all';
    
    const selectForm = new FormData();
    selectForm.append('files', filesToSelect);
    
    await fetchWithRetry(`${RD_API}/torrents/selectFiles/${torrentId}`, {
      method: 'POST',
      headers: rdHeaders,
      body: selectForm,
    });
    
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const infoRes2 = await fetchWithRetry(`${RD_API}/torrents/info/${torrentId}`, {
      headers: rdHeaders,
    });
    
    if (!infoRes2.ok) return null;
    
    const info2 = await infoRes2.json();
    console.log('Status:', info2.status, 'Links:', info2.links?.length);
    
    return { id: torrentId, links: info2.links || [], source };
  } catch (error) {
    console.error('Process magnet error:', error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, apiKey, query, link } = await req.json();
    console.log(`Real-Debrid: action=${action}, query=${query?.slice(0, 50)}`);

    if (!apiKey) {
      throw new Error('Real-Debrid API key is required');
    }

    const rdHeaders = { 'Authorization': `Bearer ${apiKey}` };
    let result;

    switch (action) {
      case 'search': {
        // Verify API key
        const userRes = await fetchWithRetry(`${RD_API}/user`, { headers: rdHeaders });
        if (!userRes.ok) {
          throw new Error('Invalid Real-Debrid API key');
        }

        // Parse query for track and artist/album info
        const queryParts = query.split(' - ');
        const artistName = queryParts.length > 1 ? queryParts[0].trim() : undefined;
        const trackName = queryParts.length > 1 ? queryParts.slice(1).join(' - ').trim() : query;
        
        console.log(`Searching - Artist: ${artistName}, Track: ${trackName}`);

        // Strategy 1: Search for album (artist name + optional album keywords)
        // Strategy 2: Search for track name directly
        const searchQueries = [
          query, // Original query
          artistName ? `${artistName} album discography` : undefined,
          artistName ? `${artistName} discography flac` : undefined,
        ].filter(Boolean) as string[];

        const streams: {id: string, title: string, streamUrl: string, quality: string, size: string, source: string, matchedTrack?: string}[] = [];
        const processedMagnets = new Set<string>();
        
        for (const searchQuery of searchQueries) {
          if (streams.length >= 5) break;
          
          console.log('Trying search query:', searchQuery);
          const torrents = await searchTorrents(searchQuery);
          
          for (const torrent of torrents.slice(0, 5)) {
            if (streams.length >= 8) break;
            if (processedMagnets.has(torrent.magnet)) continue;
            processedMagnets.add(torrent.magnet);
            
            try {
              console.log('Processing album/torrent:', torrent.title.slice(0, 50));
              const albumData = await getAlbumTracks(apiKey, torrent.magnet, torrent.source);
              
              if (albumData && albumData.files.length > 0 && albumData.links.length > 0) {
                // Find best matching track(s) in the album
                const matchedTracks = findBestTrackMatch(albumData.files, trackName, artistName);
                
                // If we have matches, prioritize them; otherwise show all tracks from album
                const tracksToProcess = matchedTracks.length > 0 
                  ? matchedTracks.slice(0, 3) 
                  : albumData.files.slice(0, 3).map(f => ({ ...f, score: 0 }));
                
                for (let i = 0; i < Math.min(tracksToProcess.length, albumData.links.length); i++) {
                  const track = tracksToProcess[i];
                  const rdLink = albumData.links[i];
                  
                  if (!rdLink) continue;
                  
                  const unrestrictForm = new FormData();
                  unrestrictForm.append('link', rdLink);
                  
                  const unrestrictRes = await fetchWithRetry(`${RD_API}/unrestrict/link`, {
                    method: 'POST',
                    headers: rdHeaders,
                    body: unrestrictForm,
                  });
                  
                  if (unrestrictRes.ok) {
                    const data = await unrestrictRes.json();
                    const filename = data.filename?.toLowerCase() || '';
                    
                    if (filename.endsWith('.mp3') || filename.endsWith('.flac') || 
                        filename.endsWith('.m4a') || filename.endsWith('.wav') ||
                        filename.endsWith('.aac') || filename.endsWith('.ogg') ||
                        data.mimeType?.includes('audio')) {
                      
                      const quality = filename.includes('flac') ? 'FLAC' : 
                                     filename.includes('320') ? '320kbps' : 
                                     filename.includes('256') ? '256kbps' : 'MP3';
                      
                      streams.push({
                        id: `${albumData.torrentId}-${i}-${streams.length}`,
                        title: data.filename || track.filename || torrent.title,
                        streamUrl: data.download,
                        quality,
                        size: data.filesize ? `${Math.round(data.filesize / 1024 / 1024)}MB` : torrent.size,
                        source: torrent.source,
                        matchedTrack: track.score > 0 ? track.filename : undefined,
                      });
                      
                      console.log(`Added track (score: ${track.score}):`, data.filename?.slice(0, 40));
                    }
                  }
                }
              }
            } catch (e) {
              console.error('Processing error:', e);
            }
          }
        }
        
        // Sort streams: matched tracks first, then by quality
        streams.sort((a, b) => {
          if (a.matchedTrack && !b.matchedTrack) return -1;
          if (!a.matchedTrack && b.matchedTrack) return 1;
          const qualityOrder = { 'FLAC': 4, '320kbps': 3, '256kbps': 2, 'MP3': 1 };
          return (qualityOrder[b.quality as keyof typeof qualityOrder] || 0) - 
                 (qualityOrder[a.quality as keyof typeof qualityOrder] || 0);
        });
        
        console.log(`Returning ${streams.length} streams`);
        result = { streams };
        break;
      }

      case 'unrestrict': {
        const formData = new FormData();
        formData.append('link', link);

        const response = await fetchWithRetry(`${RD_API}/unrestrict/link`, {
          method: 'POST',
          headers: rdHeaders,
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`Failed to unrestrict: ${await response.text()}`);
        }

        result = await response.json();
        break;
      }

      case 'verify': {
        const response = await fetchWithRetry(`${RD_API}/user`, { headers: rdHeaders });
        if (!response.ok) {
          throw new Error('Invalid API key');
        }
        const user = await response.json();
        result = {
          valid: true,
          username: user.username,
          premium: user.premium > 0,
          expiration: user.expiration,
        };
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Real-Debrid error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});