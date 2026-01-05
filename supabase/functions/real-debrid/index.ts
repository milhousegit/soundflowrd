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

// Search 1337x.to
async function search1337x(query: string): Promise<TorrentResult[]> {
  const results: TorrentResult[] = [];
  
  try {
    const domain = '1337x.to';
    const searchUrl = `https://${domain}/search/${encodeURIComponent(query)}/1/`;
    console.log('Searching 1337x:', query);
    
    const response = await fetch(searchUrl, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    
    if (!response.ok) {
      console.log('1337x response not ok:', response.status);
      return results;
    }
    
    const html = await response.text();
    
    // Extract torrent links from search results
    // Format: /torrent/123456/torrent-name/
    const torrentLinkRegex = /href="(\/torrent\/\d+\/[^"]+)"/g;
    const torrentLinks: string[] = [];
    let match;
    
    while ((match = torrentLinkRegex.exec(html)) !== null) {
      const url = `https://${domain}${match[1]}`;
      if (!torrentLinks.includes(url)) {
        torrentLinks.push(url);
      }
    }
    
    console.log(`Found ${torrentLinks.length} torrent links on 1337x`);
    
    // Extract seeders and size from search results table
    const rowRegex = /<a\s+href="(\/torrent\/\d+\/[^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<td\s+class="coll-2[^"]*"[^>]*>([^<]+)<\/td>[\s\S]*?<td\s+class="coll-4[^"]*"[^>]*>(\d+)<\/td>/g;
    const torrentMetadata: Map<string, {title: string, seeders: number, size: string}> = new Map();
    
    let rowMatch;
    while ((rowMatch = rowRegex.exec(html)) !== null) {
      const url = `https://${domain}${rowMatch[1]}`;
      const title = rowMatch[2].trim();
      const size = rowMatch[3]?.trim() || 'Unknown';
      const seeders = parseInt(rowMatch[4]) || 0;
      torrentMetadata.set(url, { title, seeders, size });
    }
    
    // Visit each torrent page to get magnet link (limit to first 5)
    for (const torrentUrl of torrentLinks.slice(0, 5)) {
      try {
        const torrentRes = await fetch(torrentUrl, {
          headers: { 
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html',
          },
        });
        
        if (!torrentRes.ok) continue;
        
        const torrentHtml = await torrentRes.text();
        
        // Extract magnet link
        const magnetMatch = torrentHtml.match(/href="(magnet:\?xt=urn:btih:[^"]+)"/);
        
        if (magnetMatch) {
          const magnet = magnetMatch[1].replace(/&amp;/g, '&');
          const dnMatch = magnet.match(/dn=([^&]+)/);
          const title = dnMatch ? decodeURIComponent(dnMatch[1].replace(/\+/g, ' ')) : 'Unknown';
          
          const meta = torrentMetadata.get(torrentUrl);
          
          results.push({
            title: meta?.title || title,
            magnet,
            size: meta?.size || 'Unknown',
            seeders: meta?.seeders || 0,
            source: '1337x',
          });
          
          console.log('Added 1337x result:', (meta?.title || title).slice(0, 50));
        }
      } catch (pageError) {
        console.log('Error fetching 1337x torrent page:', pageError);
        continue;
      }
    }
  } catch (error) {
    console.error('1337x error:', error);
  }
  
  return results;
}

// Search ext.to using Firecrawl for anti-bot bypass
async function searchExtTo(query: string): Promise<TorrentResult[]> {
  const results: TorrentResult[] = [];
  
  const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
  
  if (!firecrawlApiKey) {
    console.log('FIRECRAWL_API_KEY not configured, falling back to direct fetch');
    return searchExtToDirectFetch(query);
  }
  
  try {
    const searchUrl = `https://ext.to/search/?q=${encodeURIComponent(query)}`;
    console.log('Searching ext.to via Firecrawl:', searchUrl);
    
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: searchUrl,
        formats: ['html'],
        waitFor: 2000, // Wait for dynamic content
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Firecrawl error:', response.status, errorText);
      return searchExtToDirectFetch(query);
    }
    
    const data = await response.json();
    const html = data.data?.html || data.html || '';
    
    console.log('Firecrawl returned HTML length:', html.length);
    
    if (!html || html.length < 1000) {
      console.log('Firecrawl returned insufficient HTML, trying direct fetch');
      return searchExtToDirectFetch(query);
    }
    
    // Extract magnet links from HTML
    const magnetRegex = /href="(magnet:\?xt=urn:btih:[^"]+)"/gi;
    let match;
    const magnets: string[] = [];
    
    while ((match = magnetRegex.exec(html)) !== null) {
      const magnet = match[1].replace(/&amp;/g, '&');
      if (!magnets.includes(magnet)) {
        magnets.push(magnet);
      }
    }
    
    // Also try to find info_hash patterns
    const hashRegex = /btih[=:\/]([a-f0-9]{40})/gi;
    while ((match = hashRegex.exec(html)) !== null) {
      const hash = match[1].toUpperCase();
      const magnet = `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(query)}`;
      if (!magnets.some(m => m.toLowerCase().includes(hash.toLowerCase()))) {
        magnets.push(magnet);
      }
    }
    
    console.log(`Found ${magnets.length} magnets via Firecrawl`);
    
    // Extract torrent info from page
    for (const magnet of magnets.slice(0, 20)) {
      const hashMatch = magnet.match(/btih:([a-f0-9]+)/i);
      const dnMatch = magnet.match(/dn=([^&]+)/);
      
      let title = dnMatch ? decodeURIComponent(dnMatch[1].replace(/\+/g, ' ')) : 'Unknown';
      let seeders = 0;
      let size = 'Unknown';
      
      // Try to find context around magnet
      let magnetIndex = html.indexOf(magnet.slice(0, 50).replace(/&/g, '&amp;'));
      if (magnetIndex < 0) {
        magnetIndex = html.indexOf(magnet.slice(0, 50));
      }
      if (magnetIndex > 0) {
        const contextStart = Math.max(0, magnetIndex - 3000);
        const contextHtml = html.slice(contextStart, magnetIndex + 500);
        
        // Look for title - various patterns
        const titlePatterns = [
          /<a[^>]*class="[^"]*torrent[^"]*"[^>]*>([^<]{10,})<\/a>/i,
          /<a[^>]*href="\/torrent\/[^"]*"[^>]*title="([^"]+)"/i,
          /<a[^>]*href="\/torrent\/[^"]*"[^>]*>([^<]{10,})<\/a>/i,
          /<h\d[^>]*>([^<]{10,})<\/h\d>/i,
          /class="[^"]*title[^"]*"[^>]*>([^<]{10,})</i,
        ];
        
        for (const pattern of titlePatterns) {
          const titleMatch = contextHtml.match(pattern);
          if (titleMatch && titleMatch[1].trim().length > title.length) {
            title = titleMatch[1].trim();
            break;
          }
        }
        
        // Extract seeders
        const seedersPatterns = [
          /(?:seed|SE|seeder)[s]?[:\s]*(\d+)/i,
          /<td[^>]*class="[^"]*seed[^"]*"[^>]*>(\d+)/i,
          /class="[^"]*text-success[^"]*"[^>]*>(\d+)/i,
          />(\d+)<\/td>\s*<td[^>]*>\d+<\/td>/i,
        ];
        
        for (const pattern of seedersPatterns) {
          const seedersMatch = contextHtml.match(pattern);
          if (seedersMatch) {
            seeders = parseInt(seedersMatch[1]) || 0;
            break;
          }
        }
        
        // Extract size
        const sizeMatch = contextHtml.match(/([\d.,]+)\s*(GB|MB|KB|TB)/i);
        if (sizeMatch) {
          size = `${sizeMatch[1]} ${sizeMatch[2]}`;
        }
      }
      
      results.push({
        title,
        magnet,
        size,
        seeders,
        source: 'Ext',
      });
    }
    
    console.log(`ext.to via Firecrawl returned ${results.length} results`);
    return results;
    
  } catch (error) {
    console.error('Firecrawl ext.to error:', error);
    return searchExtToDirectFetch(query);
  }
}

// Fallback direct fetch for ext.to (when Firecrawl not available)
async function searchExtToDirectFetch(query: string): Promise<TorrentResult[]> {
  const results: TorrentResult[] = [];
  
  const browserHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  };
  
  const domains = ['ext.to', 'extratorrent.st'];
  
  for (const domain of domains) {
    try {
      const searchUrl = `https://${domain}/search/?q=${encodeURIComponent(query)}`;
      console.log(`Direct fetch ${domain}:`, searchUrl);
      
      const response = await fetch(searchUrl, { headers: browserHeaders });
      
      if (!response.ok) {
        console.log(`${domain} returned ${response.status}`);
        continue;
      }
      
      const html = await response.text();
      
      if (html.includes('challenge-platform') || html.includes('Just a moment')) {
        console.log(`${domain} has Cloudflare challenge`);
        continue;
      }
      
      const magnetRegex = /href="(magnet:\?xt=urn:btih:[^"]+)"/gi;
      let match;
      
      while ((match = magnetRegex.exec(html)) !== null) {
        const magnet = match[1].replace(/&amp;/g, '&');
        const dnMatch = magnet.match(/dn=([^&]+)/);
        const title = dnMatch ? decodeURIComponent(dnMatch[1].replace(/\+/g, ' ')) : 'Unknown';
        
        results.push({
          title,
          magnet,
          size: 'Unknown',
          seeders: 0,
          source: 'Ext',
        });
      }
      
      if (results.length > 0) {
        return results;
      }
    } catch (error) {
      console.error(`${domain} error:`, error);
    }
  }
  
  return results;
}

// Search TorrentGalaxy
async function searchTorrentGalaxy(query: string): Promise<TorrentResult[]> {
  const results: TorrentResult[] = [];
  
  try {
    const domain = 'torrentgalaxy.to';
    const searchUrl = `https://${domain}/torrents.php?search=${encodeURIComponent(query)}`;
    console.log('Searching TorrentGalaxy:', query);
    
    const response = await fetch(searchUrl, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    
    if (!response.ok) {
      console.log('TorrentGalaxy response not ok:', response.status);
      return results;
    }
    
    const html = await response.text();
    
    // TorrentGalaxy has magnet links directly in search results
    // Format: magnet:?xt=urn:btih:HASH...
    const magnetRegex = /href="(magnet:\?xt=urn:btih:[^"]+)"/g;
    const magnets: string[] = [];
    let match;
    
    while ((match = magnetRegex.exec(html)) !== null) {
      const magnet = match[1].replace(/&amp;/g, '&');
      if (!magnets.includes(magnet)) {
        magnets.push(magnet);
      }
    }
    
    console.log(`Found ${magnets.length} magnets on TorrentGalaxy`);
    
    // Extract metadata from the page
    // Look for title, size, seeders near each magnet
    for (const magnet of magnets.slice(0, 8)) {
      const dnMatch = magnet.match(/dn=([^&]+)/);
      const title = dnMatch ? decodeURIComponent(dnMatch[1].replace(/\+/g, ' ')) : 'Unknown';
      
      // Try to extract seeders from nearby HTML (simplified)
      const magnetIndex = html.indexOf(magnet.slice(0, 50));
      let seeders = 0;
      let size = 'Unknown';
      
      if (magnetIndex > 0) {
        // Look for seeders in the row (green font-weight span)
        const rowHtml = html.slice(Math.max(0, magnetIndex - 1000), magnetIndex + 500);
        const seedersMatch = rowHtml.match(/<span[^>]*font-weight[^>]*>(\d+)<\/span>/);
        if (seedersMatch) {
          seeders = parseInt(seedersMatch[1]) || 0;
        }
        
        // Look for size
        const sizeMatch = rowHtml.match(/([\d.,]+)\s*(GB|MB|KB)/i);
        if (sizeMatch) {
          size = `${sizeMatch[1]}${sizeMatch[2]}`;
        }
      }
      
      results.push({
        title,
        magnet,
        size,
        seeders,
        source: 'TGx',
      });
    }
  } catch (error) {
    console.error('TorrentGalaxy error:', error);
  }
  
  return results;
}


// Search Bitsearch.to (reliable torrent search engine)
async function searchBitsearch(query: string): Promise<TorrentResult[]> {
  const results: TorrentResult[] = [];
  
  try {
    const searchUrl = `https://bitsearch.to/search?q=${encodeURIComponent(query)}&category=6`; // category 6 = music
    console.log('Searching Bitsearch:', searchUrl);
    
    const response = await fetch(searchUrl, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    
    if (!response.ok) {
      console.log('Bitsearch response not ok:', response.status);
      return results;
    }
    
    const html = await response.text();
    console.log('Bitsearch HTML length:', html.length);
    
    // Bitsearch has magnet links directly in the page
    // Format: <a href="magnet:?xt=urn:btih:HASH...">
    const magnetRegex = /href="(magnet:\?xt=urn:btih:[^"]+)"/gi;
    const magnets: string[] = [];
    let match;
    
    while ((match = magnetRegex.exec(html)) !== null) {
      const magnet = match[1].replace(/&amp;/g, '&');
      if (!magnets.includes(magnet)) {
        magnets.push(magnet);
      }
    }
    
    console.log(`Found ${magnets.length} magnets on Bitsearch`);
    
    // Extract title, size, seeders from search-result divs
    for (const magnet of magnets.slice(0, 10)) {
      const dnMatch = magnet.match(/dn=([^&]+)/);
      const title = dnMatch ? decodeURIComponent(dnMatch[1].replace(/\+/g, ' ')) : 'Unknown';
      
      // Find metadata near this magnet
      const magnetIndex = html.indexOf(magnet.slice(0, 60));
      let seeders = 0;
      let size = 'Unknown';
      
      if (magnetIndex > 0) {
        const contextHtml = html.slice(Math.max(0, magnetIndex - 2000), magnetIndex + 500);
        
        // Look for seeders (usually in green text or stats div)
        const seedersMatch = contextHtml.match(/(?:seeders?|SE)[:\s]*(\d+)/i) ||
                             contextHtml.match(/<span[^>]*text-success[^>]*>(\d+)<\/span>/i);
        if (seedersMatch) {
          seeders = parseInt(seedersMatch[1]) || 0;
        }
        
        // Look for size
        const sizeMatch = contextHtml.match(/([\d.,]+)\s*(GB|MB|KB|TB)/i);
        if (sizeMatch) {
          size = `${sizeMatch[1]} ${sizeMatch[2]}`;
        }
      }
      
      results.push({
        title,
        magnet,
        size,
        seeders,
        source: 'Bit',
      });
    }
  } catch (error) {
    console.error('Bitsearch error:', error);
  }
  
  return results;
}

// Search Solid Torrents
async function searchSolidTorrents(query: string): Promise<TorrentResult[]> {
  const results: TorrentResult[] = [];
  
  try {
    const searchUrl = `https://solidtorrents.to/search?q=${encodeURIComponent(query)}&category=audio`;
    console.log('Searching SolidTorrents:', searchUrl);
    
    const response = await fetch(searchUrl, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    
    if (!response.ok) {
      console.log('SolidTorrents response not ok:', response.status);
      return results;
    }
    
    const html = await response.text();
    console.log('SolidTorrents HTML length:', html.length);
    
    // SolidTorrents provides an API-like JSON in the page or direct magnets
    const magnetRegex = /href="(magnet:\?xt=urn:btih:[^"]+)"/gi;
    const magnets: string[] = [];
    let match;
    
    while ((match = magnetRegex.exec(html)) !== null) {
      const magnet = match[1].replace(/&amp;/g, '&');
      if (!magnets.includes(magnet)) {
        magnets.push(magnet);
      }
    }
    
    console.log(`Found ${magnets.length} magnets on SolidTorrents`);
    
    for (const magnet of magnets.slice(0, 10)) {
      const dnMatch = magnet.match(/dn=([^&]+)/);
      const title = dnMatch ? decodeURIComponent(dnMatch[1].replace(/\+/g, ' ')) : 'Unknown';
      
      const magnetIndex = html.indexOf(magnet.slice(0, 60));
      let seeders = 0;
      let size = 'Unknown';
      
      if (magnetIndex > 0) {
        const contextHtml = html.slice(Math.max(0, magnetIndex - 2000), magnetIndex + 500);
        
        const seedersMatch = contextHtml.match(/(?:seed|SE)[:\s]*(\d+)/i);
        if (seedersMatch) {
          seeders = parseInt(seedersMatch[1]) || 0;
        }
        
        const sizeMatch = contextHtml.match(/([\d.,]+)\s*(GB|MB|KB|TB)/i);
        if (sizeMatch) {
          size = `${sizeMatch[1]} ${sizeMatch[2]}`;
        }
      }
      
      results.push({
        title,
        magnet,
        size,
        seeders,
        source: 'Solid',
      });
    }
  } catch (error) {
    console.error('SolidTorrents error:', error);
  }
  
  return results;
}

// Search Il Corsaro Nero (Italian torrent site) - updated parsing
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
      },
    });
    
    console.log('Corsaro Nero response status:', response.status);
    
    if (!response.ok) {
      console.log('Corsaro Nero response not ok:', response.status);
      return results;
    }
    
    const html = await response.text();
    console.log('Corsaro Nero HTML length:', html.length);
    
    // Check for Cloudflare or empty results
    if (html.includes('cloudflare') || html.includes('challenge-form')) {
      console.log('Got Cloudflare challenge page');
      return results;
    }
    
    // Try to find magnet links directly in the page (newer site versions)
    const magnetRegex = /href="(magnet:\?xt=urn:btih:[^"]+)"/gi;
    let match;
    const magnets: string[] = [];
    
    while ((match = magnetRegex.exec(html)) !== null) {
      const magnet = match[1].replace(/&amp;/g, '&');
      if (!magnets.includes(magnet)) {
        magnets.push(magnet);
      }
    }
    
    if (magnets.length > 0) {
      console.log(`Found ${magnets.length} direct magnets on Corsaro Nero`);
      
      for (const magnet of magnets.slice(0, 10)) {
        const dnMatch = magnet.match(/dn=([^&]+)/);
        const title = dnMatch ? decodeURIComponent(dnMatch[1].replace(/\+/g, ' ')) : 'Unknown';
        
        results.push({
          title,
          magnet,
          size: 'Unknown',
          seeders: 0,
          source: 'CNero',
        });
      }
      return results;
    }
    
    // Try to extract hash from the page (legacy method)
    const hashRegex = /(?:btih:|hash[=:]\s*)([a-f0-9]{40})/gi;
    const hashes: string[] = [];
    
    while ((match = hashRegex.exec(html)) !== null) {
      const hash = match[1].toUpperCase();
      if (!hashes.includes(hash)) {
        hashes.push(hash);
      }
    }
    
    if (hashes.length > 0) {
      console.log(`Found ${hashes.length} hashes on Corsaro Nero`);
      
      for (const hash of hashes.slice(0, 10)) {
        const magnet = `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(query)}`;
        results.push({
          title: query,
          magnet,
          size: 'Unknown',
          seeders: 0,
          source: 'CNero',
        });
      }
    }
    
    console.log(`Returning ${results.length} torrents from Corsaro Nero`);
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
// ext.to is the primary engine (best fuzzy matching), others are fallbacks
async function searchTorrents(query: string): Promise<TorrentResult[]> {
  console.log('Searching all sources for:', query);
  
  const queryWords = normalizeQuery(query);
  const queryVariants = generateQueryVariants(query);
  console.log('Query words:', queryWords);
  console.log('Query variants:', queryVariants);
  
  // PHASE 1: Try ext.to first (best fuzzy matching)
  console.log('Phase 1: Searching ext.to (primary engine)...');
  let allResults: TorrentResult[] = [];
  
  try {
    // Search ext.to with original query first
    const extResults = await searchExtTo(query);
    console.log(`ext.to returned ${extResults.length} results for original query`);
    
    // If not enough results, try variants
    if (extResults.length < 3) {
      for (const variant of queryVariants.slice(1, 3)) {
        const variantResults = await searchExtTo(variant);
        console.log(`ext.to returned ${variantResults.length} results for variant: ${variant}`);
        extResults.push(...variantResults);
      }
    }
    
    allResults = extResults;
  } catch (error) {
    console.error('ext.to primary search failed:', error);
  }
  
  // PHASE 2: If ext.to found good results, use them; otherwise use fallback sources
  if (allResults.length >= 3) {
    console.log(`ext.to found ${allResults.length} results, skipping fallback sources`);
  } else {
    console.log('Phase 2: ext.to insufficient results, trying fallback sources...');
    
    // Fallback to other sources in parallel
    const fallbackPromises: Promise<TorrentResult[]>[] = [];
    
    for (const variant of queryVariants.slice(0, 2)) {
      fallbackPromises.push(searchBitsearch(variant).catch(() => []));
      fallbackPromises.push(searchSolidTorrents(variant).catch(() => []));
      fallbackPromises.push(searchApibay(variant).catch(() => []));
      fallbackPromises.push(searchCorsaroNero(variant).catch(() => []));
      fallbackPromises.push(search1337x(variant).catch(() => []));
      fallbackPromises.push(searchTorrentGalaxy(variant).catch(() => []));
    }
    
    const fallbackResults = await Promise.all(fallbackPromises);
    allResults.push(...fallbackResults.flat());
  }
  
  // Log results per source
  const sources = ['Ext', 'Bit', 'Solid', 'TPB', 'CNero', '1337x', 'TGx'];
  for (const src of sources) {
    const count = allResults.filter(r => r.source === src).length;
    if (count > 0) console.log(`${src}: ${count} results`);
  }
  
  // Dedupe by magnet hash
  allResults = dedupeResults(allResults);
  console.log(`Total unique results after dedupe: ${allResults.length}`);
  
  // For ext.to results, skip strict word matching (it already does fuzzy matching)
  // For other sources, apply word filtering
  const extResults = allResults.filter(r => r.source === 'Ext');
  const otherResults = allResults.filter(r => r.source !== 'Ext');
  
  let filteredOtherResults = otherResults;
  if (queryWords.length > 1 && otherResults.length > 0) {
    const filtered = otherResults.filter(r => matchesAllWords(r.title, queryWords));
    if (filtered.length > 0) {
      filteredOtherResults = filtered;
    }
  }
  
  // Combine: ext.to results first (they're already fuzzy matched), then filtered others
  allResults = [...extResults, ...filteredOtherResults];
  
  // Sort by seeders (best first), but keep ext.to results prioritized
  allResults.sort((a, b) => {
    // Prioritize ext.to results slightly
    if (a.source === 'Ext' && b.source !== 'Ext') return -1;
    if (a.source !== 'Ext' && b.source === 'Ext') return 1;
    return b.seeders - a.seeders;
  });
  
  console.log(`Returning ${Math.min(allResults.length, 20)} torrents`);
  return allResults.slice(0, 20);
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
