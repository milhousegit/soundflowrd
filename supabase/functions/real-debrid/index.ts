import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RD_API = 'https://api.real-debrid.com/rest/1.0';

// Parse HTML to extract magnet links from torrent sites
function extractMagnets(html: string): string[] {
  const magnetRegex = /magnet:\?xt=urn:btih:[a-zA-Z0-9]+[^"'\s<>]*/gi;
  const matches = html.match(magnetRegex) || [];
  return [...new Set(matches)];
}

// Search for audio files using a public torrent indexer
async function searchTorrents(query: string): Promise<{title: string, magnet: string, size: string}[]> {
  const results: {title: string, magnet: string, size: string}[] = [];
  
  try {
    // Use btdig.com as a torrent search engine (public DHT search)
    const searchUrl = `https://btdig.com/search?q=${encodeURIComponent(query)}`;
    
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    
    if (response.ok) {
      const html = await response.text();
      
      // Extract torrent info from btdig results
      const itemRegex = /<div class="one_result">([\s\S]*?)<\/div>\s*<\/div>/g;
      const nameRegex = /<div class="torrent_name"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/;
      const magnetRegex = /magnet:\?xt=urn:btih:[a-zA-Z0-9]+[^"'\s<>]*/i;
      const sizeRegex = /<span class="torrent_size"[^>]*>([^<]+)<\/span>/;
      
      let match;
      while ((match = itemRegex.exec(html)) !== null) {
        const item = match[1];
        const nameMatch = item.match(nameRegex);
        const magnetMatch = item.match(magnetRegex);
        const sizeMatch = item.match(sizeRegex);
        
        if (nameMatch && magnetMatch) {
          results.push({
            title: nameMatch[1].trim(),
            magnet: magnetMatch[0],
            size: sizeMatch ? sizeMatch[1].trim() : 'Unknown',
          });
        }
      }
    }
  } catch (error) {
    console.error('Torrent search error:', error);
  }
  
  // Also try solidtorrents
  try {
    const solidUrl = `https://solidtorrents.to/search?q=${encodeURIComponent(query)}`;
    
    const response = await fetch(solidUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    
    if (response.ok) {
      const html = await response.text();
      const magnets = extractMagnets(html);
      
      // Simple extraction - in real implementation, parse properly
      magnets.slice(0, 5).forEach((magnet, index) => {
        const dnMatch = magnet.match(/dn=([^&]+)/);
        const title = dnMatch ? decodeURIComponent(dnMatch[1].replace(/\+/g, ' ')) : `Result ${index + 1}`;
        
        if (!results.find(r => r.magnet === magnet)) {
          results.push({
            title,
            magnet,
            size: 'Unknown',
          });
        }
      });
    }
  } catch (error) {
    console.error('SolidTorrents search error:', error);
  }
  
  return results.slice(0, 10);
}

// Add magnet to Real-Debrid and wait for it to be ready
async function addAndProcessMagnet(apiKey: string, magnet: string): Promise<{id: string, links: string[]} | null> {
  const rdHeaders = { 'Authorization': `Bearer ${apiKey}` };
  
  try {
    // Add magnet
    const formData = new FormData();
    formData.append('magnet', magnet);
    
    const addRes = await fetch(`${RD_API}/torrents/addMagnet`, {
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
    
    // Select all files
    const selectForm = new FormData();
    selectForm.append('files', 'all');
    
    await fetch(`${RD_API}/torrents/selectFiles/${torrentId}`, {
      method: 'POST',
      headers: rdHeaders,
      body: selectForm,
    });
    
    // Wait a moment for processing
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Get torrent info
    const infoRes = await fetch(`${RD_API}/torrents/info/${torrentId}`, {
      headers: rdHeaders,
    });
    
    if (!infoRes.ok) {
      return null;
    }
    
    const info = await infoRes.json();
    
    // Return links if available
    if (info.links && info.links.length > 0) {
      return { id: torrentId, links: info.links };
    }
    
    // If status is downloading/queued, we need to wait or skip
    if (info.status === 'downloaded') {
      return { id: torrentId, links: info.links || [] };
    }
    
    return null;
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
    console.log(`Real-Debrid request: action=${action}, query=${query?.slice(0, 50)}`);

    if (!apiKey) {
      throw new Error('Real-Debrid API key is required');
    }

    const rdHeaders = {
      'Authorization': `Bearer ${apiKey}`,
    };

    let result;

    switch (action) {
      case 'search': {
        // Verify API key first
        const userRes = await fetch(`${RD_API}/user`, { headers: rdHeaders });
        if (!userRes.ok) {
          throw new Error('Invalid Real-Debrid API key');
        }

        // Search for torrents
        const searchQuery = `${query} mp3`;
        console.log('Searching for:', searchQuery);
        
        const torrents = await searchTorrents(searchQuery);
        console.log(`Found ${torrents.length} torrents`);
        
        const streams: {id: string, title: string, streamUrl: string, quality: string, size: string}[] = [];
        
        // Process first few magnets to get streaming links
        for (const torrent of torrents.slice(0, 3)) {
          try {
            const processed = await addAndProcessMagnet(apiKey, torrent.magnet);
            
            if (processed && processed.links.length > 0) {
              // Unrestrict the first audio link
              for (const rdLink of processed.links.slice(0, 2)) {
                const unrestrictForm = new FormData();
                unrestrictForm.append('link', rdLink);
                
                const unrestrictRes = await fetch(`${RD_API}/unrestrict/link`, {
                  method: 'POST',
                  headers: rdHeaders,
                  body: unrestrictForm,
                });
                
                if (unrestrictRes.ok) {
                  const unrestrictData = await unrestrictRes.json();
                  
                  // Check if it's an audio file
                  const filename = unrestrictData.filename?.toLowerCase() || '';
                  if (filename.endsWith('.mp3') || filename.endsWith('.flac') || 
                      filename.endsWith('.m4a') || filename.endsWith('.wav') ||
                      unrestrictData.mimeType?.includes('audio')) {
                    streams.push({
                      id: `${processed.id}-${streams.length}`,
                      title: unrestrictData.filename || torrent.title,
                      streamUrl: unrestrictData.download,
                      quality: filename.includes('flac') ? 'FLAC' : 
                               filename.includes('320') ? '320kbps' : 'MP3',
                      size: unrestrictData.filesize ? 
                            `${Math.round(unrestrictData.filesize / 1024 / 1024)}MB` : 
                            torrent.size,
                    });
                  }
                }
              }
            }
          } catch (e) {
            console.error('Error processing torrent:', e);
          }
        }
        
        result = { streams };
        break;
      }

      case 'unrestrict': {
        const formData = new FormData();
        formData.append('link', link);

        const response = await fetch(`${RD_API}/unrestrict/link`, {
          method: 'POST',
          headers: rdHeaders,
          body: formData,
        });

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Failed to unrestrict link: ${error}`);
        }

        result = await response.json();
        console.log('Unrestricted link:', result.download?.slice(0, 100));
        break;
      }

      case 'verify': {
        const response = await fetch(`${RD_API}/user`, { headers: rdHeaders });
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
