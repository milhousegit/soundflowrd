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

interface AudioFile {
  id: number;
  path: string;
  filename: string;
  selected?: boolean;
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
    const domain = 'ilcorsaronero.link';
    const searchUrl = `https://${domain}/search?q=${encodeURIComponent(query)}`;
    console.log('Searching Corsaro Nero:', searchUrl);
    
    const response = await fetch(searchUrl, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
      },
    });
    
    console.log('Corsaro Nero response status:', response.status);
    
    if (!response.ok) {
      console.log('Corsaro Nero response not ok:', response.status);
      return results;
    }
    
    const html = await response.text();
    console.log('Corsaro Nero HTML length:', html.length);
    console.log('Corsaro Nero HTML preview:', html.substring(0, 500));
    
    // Check if we got a valid search results page
    if (html.includes('Sono stati trovati')) {
      console.log('Found valid search results page');
    } else if (html.includes('404') || html.includes('Pagina non trovata')) {
      console.log('Got 404 page from Corsaro Nero');
      return results;
    } else if (html.includes('cloudflare') || html.includes('challenge')) {
      console.log('Got Cloudflare challenge page');
      return results;
    }
    
    const toAbsoluteUrl = (href: string) => {
      if (!href) return href;
      if (href.startsWith('http://') || href.startsWith('https://')) return href;
      return `https://${domain}${href.startsWith('/') ? '' : '/'}${href}`;
    };

    // Extract torrent links from search results table
    // Supports absolute and relative links
    const torrentLinkRegex = /href="((?:https:\/\/ilcorsaronero\.link)?\/torrent\/\d+\/[^"]+)"/g;
    const torrentLinks: string[] = [];
    let match;

    while ((match = torrentLinkRegex.exec(html)) !== null) {
      const url = toAbsoluteUrl(match[1]);
      if (!torrentLinks.includes(url)) {
        torrentLinks.push(url);
      }
    }

    console.log(`Found ${torrentLinks.length} torrent links on Corsaro Nero`);
    if (torrentLinks.length > 0) {
      console.log('First torrent link:', torrentLinks[0]);
    }

    // Extract seeders and size from search results
    // Parse the table rows to get metadata
    const rowRegex = /<tr[^>]*>[\s\S]*?<a[^>]*href="((?:https:\/\/ilcorsaronero\.link)?\/torrent\/\d+\/[^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<td[^>]*class="[^"]*text-green[^"]*"[^>]*>\s*(\d+)[\s\S]*?<td[^>]*class="[^"]*tabular-nums[^"]*"[^>]*>\s*([\d.,]+\s*[A-Za-z]+)/g;

    const torrentMetadata: Map<string, {title: string, seeders: number, size: string}> = new Map();
    let rowMatch;
    while ((rowMatch = rowRegex.exec(html)) !== null) {
      const url = toAbsoluteUrl(rowMatch[1]);
      const title = rowMatch[2].trim();
      const seeders = parseInt(rowMatch[3]) || 0;
      const size = rowMatch[4]?.trim() || 'Unknown';
      torrentMetadata.set(url, { title, seeders, size });
    }
    
    // Visit each torrent page to get magnet link (limit to first 5)
    for (const torrentUrl of torrentLinks.slice(0, 5)) {
      try {
        console.log('Fetching torrent page:', torrentUrl);
        
        const torrentRes = await fetch(torrentUrl, {
          headers: { 
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html',
          },
        });
        
        if (!torrentRes.ok) continue;
        
        const torrentHtml = await torrentRes.text();
        
        // Extract hash from page - it's in a <kbd> element
        const hashMatch = torrentHtml.match(/<kbd[^>]*>\s*([a-f0-9]{40})\s*<\/kbd>/i);
        
        // Also try to extract magnet directly
        const magnetMatch = torrentHtml.match(/href="(magnet:\?xt=urn:btih:[^"]+)"/);
        
        if (hashMatch || magnetMatch) {
          let magnet: string;
          let title: string;
          
          if (magnetMatch) {
            magnet = magnetMatch[1].replace(/&amp;/g, '&');
          } else {
            const hash = hashMatch![1];
            // Extract title from h1
            const titleMatch = torrentHtml.match(/<h1[^>]*class="[^"]*font-bold[^"]*"[^>]*>([^<]+)<\/h1>/);
            title = titleMatch ? titleMatch[1].trim() : torrentUrl.split('/').pop()?.replace(/-/g, ' ') || 'Unknown';
            magnet = `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(title)}`;
          }
          
          // Get title from magnet or metadata
          const dnMatch = magnet.match(/dn=([^&]+)/);
          title = dnMatch ? decodeURIComponent(dnMatch[1].replace(/\+/g, ' ')) : 'Unknown';
          
          // Get metadata from search page if available
          const meta = torrentMetadata.get(torrentUrl);
          
          results.push({
            title,
            magnet,
            size: meta?.size || 'Unknown',
            seeders: meta?.seeders || 0,
            source: 'CNero',
          });
          
          console.log('Added Corsaro Nero result:', title.slice(0, 50));
        }
      } catch (pageError) {
        console.log('Error fetching torrent page:', pageError);
        continue;
      }
    }
  } catch (error) {
    console.error('Corsaro Nero error:', error);
  }
  
  return results;
}

// Normalize query: split into words and filter results that contain all words
function normalizeQuery(query: string): string[] {
  // Split by spaces and common separators, filter out short words
  const words = query
    .toLowerCase()
    .split(/[\s\-_.]+/)
    .filter(w => w.length >= 2);
  return words;
}

// Generate query variants for fuzzy matching
function generateQueryVariants(query: string): string[] {
  const words = normalizeQuery(query);
  if (words.length <= 1) return [query];
  
  const variants = new Set<string>();
  
  // Original query
  variants.add(query);
  
  // Words joined with different separators
  variants.add(words.join(' '));      // "salmo hellvisback"
  variants.add(words.join('-'));      // "salmo-hellvisback"
  variants.add(words.join('.'));      // "salmo.hellvisback"
  variants.add(words.join('_'));      // "salmo_hellvisback"
  variants.add(words.join(''));       // "salmohellvisback" (no separator)
  
  // First word only (for broader search)
  if (words[0].length >= 3) {
    variants.add(words[0]);
  }
  
  return Array.from(variants);
}

// Check if a title contains all query words (ignoring separators)
function matchesAllWords(title: string, queryWords: string[]): boolean {
  const normalizedTitle = title
    .toLowerCase()
    .replace(/[\-_.]/g, ' ')
    .replace(/\s+/g, ' ');
  return queryWords.every(word => normalizedTitle.includes(word));
}

// Dedupe results by magnet hash
function dedupeResults(results: TorrentResult[]): TorrentResult[] {
  const seen = new Set<string>();
  return results.filter(r => {
    // Extract hash from magnet
    const hashMatch = r.magnet.match(/btih:([a-f0-9]+)/i);
    const key = hashMatch ? hashMatch[1].toLowerCase() : r.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Combined search from multiple sources with fuzzy matching
async function searchTorrents(query: string): Promise<TorrentResult[]> {
  console.log('Searching all sources for:', query);
  
  const queryWords = normalizeQuery(query);
  const queryVariants = generateQueryVariants(query);
  console.log('Query words:', queryWords);
  console.log('Query variants:', queryVariants);
  
  // Search with multiple query variants in parallel
  const searchPromises: Promise<TorrentResult[]>[] = [];
  
  for (const variant of queryVariants.slice(0, 3)) { // Limit to 3 variants to avoid too many requests
    searchPromises.push(searchApibay(variant).catch(() => []));
    searchPromises.push(searchCorsaroNero(variant).catch(() => []));
  }
  
  const results = await Promise.all(searchPromises);
  let allResults = results.flat();
  
  // Dedupe by magnet hash
  allResults = dedupeResults(allResults);
  console.log(`Total unique results after dedupe: ${allResults.length}`);
  
  // Filter results to only include those that contain ALL query words
  if (queryWords.length > 1) {
    const filteredResults = allResults.filter(r => matchesAllWords(r.title, queryWords));
    console.log(`Filtered from ${allResults.length} to ${filteredResults.length} results matching all words`);
    
    // If we have good filtered results, use them; otherwise fall back to all results
    if (filteredResults.length > 0) {
      allResults = filteredResults;
    }
  }
  
  // Sort by seeders (best first)
  allResults.sort((a, b) => b.seeders - a.seeders);
  
  console.log(`Returning ${Math.min(allResults.length, 10)} torrents`);
  return allResults.slice(0, 10);
}

// Add magnet to Real-Debrid and get file list
async function addTorrentAndGetFiles(apiKey: string, magnet: string, source: string): Promise<{
  torrentId: string;
  files: AudioFile[];
  status: string;
  progress?: number;
  links?: string[];
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
    const audioFiles: AudioFile[] = [];
    const audioFileIds: string[] = [];
    
    if (info1.files && Array.isArray(info1.files)) {
      for (const file of info1.files) {
        const filepath = file.path || '';
        const filename = filepath.split('/').pop() || filepath;
        const lowerFilename = filename.toLowerCase();
        
        if (lowerFilename.endsWith('.mp3') || lowerFilename.endsWith('.flac') || 
            lowerFilename.endsWith('.m4a') || lowerFilename.endsWith('.wav') ||
            lowerFilename.endsWith('.aac') || lowerFilename.endsWith('.ogg')) {
          audioFiles.push({ id: file.id, path: filepath, filename, selected: false });
          audioFileIds.push(file.id.toString());
        }
      }
    }
    
    console.log(`Found ${audioFiles.length} audio files in torrent`);
    
    // Even if no audio files found, return the torrent info
    // User might want to browse non-standard audio formats
    
    return {
      torrentId,
      files: audioFiles,
      status: info1.status || 'magnet_conversion',
      progress: info1.progress || 0,
      links: info1.links || [],
    };
  } catch (error) {
    console.error('Add torrent error:', error);
    return null;
  }
}

// Select specific files and start download
async function selectFilesAndDownload(apiKey: string, torrentId: string, fileIds: number[]): Promise<{
  status: string;
  progress: number;
  links: string[];
} | null> {
  const rdHeaders = { 'Authorization': `Bearer ${apiKey}` };
  
  try {
    // First check if torrent exists
    const checkRes = await fetchWithRetry(`${RD_API}/torrents/info/${torrentId}`, {
      headers: rdHeaders,
    });
    
    if (!checkRes.ok) {
      console.log('Torrent not found:', torrentId, checkRes.status);
      return null;
    }
    
    const checkInfo = await checkRes.json();
    console.log('Torrent exists, status:', checkInfo.status, 'files:', checkInfo.files?.length);
    
    // Select files
    const selectForm = new FormData();
    selectForm.append('files', fileIds.join(','));
    
    const selectRes = await fetchWithRetry(`${RD_API}/torrents/selectFiles/${torrentId}`, {
      method: 'POST',
      headers: rdHeaders,
      body: selectForm,
    });
    
    // selectFiles returns 204 No Content on success
    if (!selectRes.ok && selectRes.status !== 204) {
      console.log('Failed to select files:', selectRes.status, await selectRes.text());
      return null;
    }
    
    console.log('Files selected successfully');
    
    // Wait a bit for processing
    await new Promise((resolve) => setTimeout(resolve, 1500));
    
    // Get status
    const infoRes = await fetchWithRetry(`${RD_API}/torrents/info/${torrentId}`, {
      headers: rdHeaders,
    });
    
    if (!infoRes.ok) {
      console.log('Failed to get torrent info after selection:', infoRes.status);
      return null;
    }
    
    const info = await infoRes.json();
    console.log('After selection - Status:', info.status, 'Links:', info.links?.length);
    
    return {
      status: info.status || 'unknown',
      progress: info.progress || 0,
      links: info.links || [],
    };
  } catch (error) {
    console.error('Select files error:', error);
    return null;
  }
}

// Unrestrict a link and return stream URL
async function unrestrictAndGetStream(apiKey: string, link: string): Promise<{
  id: string;
  title: string;
  streamUrl: string;
  quality: string;
  size: string;
} | null> {
  const rdHeaders = { 'Authorization': `Bearer ${apiKey}` };
  
  try {
    const unrestrictForm = new FormData();
    unrestrictForm.append('link', link);
    
    const unrestrictRes = await fetchWithRetry(`${RD_API}/unrestrict/link`, {
      method: 'POST',
      headers: rdHeaders,
      body: unrestrictForm,
    });
    
    if (!unrestrictRes.ok) return null;
    
    const data = await unrestrictRes.json();
    const filename = data.filename?.toLowerCase() || '';
    
    // Check if audio file
    if (filename.endsWith('.mp3') || filename.endsWith('.flac') || 
        filename.endsWith('.m4a') || filename.endsWith('.wav') ||
        filename.endsWith('.aac') || filename.endsWith('.ogg') ||
        data.mimeType?.includes('audio')) {
      
      const quality = filename.includes('flac') ? 'FLAC' : 
                     filename.includes('320') ? '320kbps' : 
                     filename.includes('256') ? '256kbps' : 'MP3';
      
      return {
        id: data.id || `unrestrict-${Date.now()}`,
        title: data.filename || 'Unknown',
        streamUrl: data.download,
        quality,
        size: data.filesize ? `${Math.round(data.filesize / 1024 / 1024)}MB` : 'Unknown',
      };
    }
    
    return null;
  } catch (error) {
    console.error('Unrestrict error:', error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, apiKey, query, link, debug, torrentId, fileIds, magnet, source } = body;
    console.log(`Real-Debrid: action=${action}, query=${query?.slice?.(0, 50) || 'N/A'}`);

    const debugLogs: string[] = [];
    const dbg = (msg: string) => {
      if (debug) debugLogs.push(msg);
    };

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

        // Search for torrents
        const torrents = await searchTorrents(query);
        dbg(`Found ${torrents.length} torrents`);
        
        const torrentResults: {
          torrentId: string;
          title: string;
          size: string;
          source: string;
          seeders: number;
          status: string;
          progress: number;
          files: AudioFile[];
          hasLinks: boolean;
        }[] = [];
        
        const processedMagnets = new Set<string>();
        
        for (const torrent of torrents.slice(0, 8)) {
          if (processedMagnets.has(torrent.magnet)) continue;
          processedMagnets.add(torrent.magnet);
          
          try {
            console.log('Processing torrent:', torrent.title.slice(0, 50));
            
            // Add to RD and get file list
            const torrentData = await addTorrentAndGetFiles(apiKey, torrent.magnet, torrent.source);
            
            if (!torrentData) continue;
            
            dbg(`Torrent ${torrent.title.slice(0, 30)}: ${torrentData.files.length} audio files, status=${torrentData.status}`);
            
            torrentResults.push({
              torrentId: torrentData.torrentId,
              title: torrent.title,
              size: torrent.size,
              source: torrent.source,
              seeders: torrent.seeders,
              status: torrentData.status,
              progress: torrentData.progress || 0,
              files: torrentData.files,
              hasLinks: (torrentData.links?.length || 0) > 0,
            });
            
          } catch (e) {
            console.error('Processing error:', e);
          }
        }
        
        console.log(`Returning ${torrentResults.length} torrent results`);
        result = { 
          torrents: torrentResults,
          ...(debug ? { debug: debugLogs } : {})
        };
        break;
      }

      case 'selectFiles': {
        // Select specific files from a torrent and start download
        if (!torrentId || !fileIds || !Array.isArray(fileIds)) {
          console.log('Missing required params:', { torrentId, fileIds });
          return new Response(JSON.stringify({ 
            error: 'torrentId and fileIds are required',
            status: 'error',
            progress: 0,
            streams: []
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200, // Return 200 with error in body to avoid 500
          });
        }
        
        console.log('Selecting files for torrent:', torrentId, 'fileIds:', fileIds);
        
        const selectResult = await selectFilesAndDownload(apiKey, torrentId, fileIds);
        
        if (!selectResult) {
          console.log('selectFilesAndDownload returned null');
          // Return a graceful error instead of throwing
          return new Response(JSON.stringify({ 
            error: 'Failed to select files - torrent may no longer exist',
            status: 'error',
            progress: 0,
            streams: []
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200, // Return 200 with error in body to avoid 500
          });
        }
        
        // If links are available, unrestrict them
        const streams: any[] = [];
        
        if (selectResult.links.length > 0 && selectResult.status === 'downloaded') {
          for (const rdLink of selectResult.links) {
            const stream = await unrestrictAndGetStream(apiKey, rdLink);
            if (stream) {
              streams.push({
                ...stream,
                source: 'Real-Debrid',
              });
            }
          }
        }
        
        console.log('Select result:', selectResult.status, 'streams:', streams.length);
        
        result = {
          status: selectResult.status,
          progress: selectResult.progress,
          streams,
        };
        break;
      }

      case 'checkTorrent': {
        if (!torrentId) {
          throw new Error('torrentId is required');
        }
        
        const infoRes = await fetchWithRetry(`${RD_API}/torrents/info/${torrentId}`, {
          headers: rdHeaders,
        });
        
        if (!infoRes.ok) {
          throw new Error('Failed to get torrent info');
        }
        
        const info = await infoRes.json();
        console.log(`Check torrent ${torrentId}: status=${info.status}, links=${info.links?.length}`);
        
        // Get files
        const audioFiles: AudioFile[] = [];
        if (info.files && Array.isArray(info.files)) {
          for (const file of info.files) {
            const filepath = file.path || '';
            const filename = filepath.split('/').pop() || filepath;
            const lowerFilename = filename.toLowerCase();
            
            if (lowerFilename.endsWith('.mp3') || lowerFilename.endsWith('.flac') || 
                lowerFilename.endsWith('.m4a') || lowerFilename.endsWith('.wav') ||
                lowerFilename.endsWith('.aac') || lowerFilename.endsWith('.ogg')) {
              audioFiles.push({ 
                id: file.id, 
                path: filepath, 
                filename,
                selected: file.selected === 1,
              });
            }
          }
        }
        
        // If ready, unrestrict links and return streams
        const streams: any[] = [];
        
        if (info.status === 'downloaded' && Array.isArray(info.links) && info.links.length > 0) {
          for (let i = 0; i < Math.min(info.links.length, 20); i++) {
            const stream = await unrestrictAndGetStream(apiKey, info.links[i]);
            if (stream) {
              streams.push({
                ...stream,
                id: `${torrentId}-${i}`,
                source: 'Real-Debrid',
              });
            }
          }
        }
        
        result = {
          status: info.status || 'unknown',
          progress: info.progress || 0,
          files: audioFiles,
          streams,
        };
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
