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

// Search using apibay.org (Pirate Bay API)
async function searchTorrents(query: string): Promise<{title: string, magnet: string, size: string, seeders: number}[]> {
  const results: {title: string, magnet: string, size: string, seeders: number}[] = [];
  
  try {
    // Search without category filter to get more results
    const searchUrl = `https://apibay.org/q.php?q=${encodeURIComponent(query)}`;
    console.log('Searching apibay:', searchUrl);
    
    const response = await fetch(searchUrl, {
      headers: { 'Accept': 'application/json' },
    });
    
    if (response.ok) {
      const text = await response.text();
      console.log('Apibay raw response length:', text.length);
      
      try {
        const data = JSON.parse(text);
        
        if (Array.isArray(data) && data.length > 0) {
          for (const item of data) {
            // Skip "no results" placeholder (id = "0" or id = 0)
            if (item.id === '0' || item.id === 0) {
              console.log('Skipping no-results placeholder');
              continue;
            }
            
            const magnet = `magnet:?xt=urn:btih:${item.info_hash}&dn=${encodeURIComponent(item.name)}`;
            const sizeNum = parseInt(item.size) || 0;
            const sizeMB = sizeNum > 0 ? `${Math.round(sizeNum / 1024 / 1024)}MB` : 'Unknown';
            
            results.push({
              title: item.name,
              magnet,
              size: sizeMB,
              seeders: parseInt(item.seeders) || 0,
            });
          }
        }
      } catch (parseError) {
        console.error('JSON parse error:', parseError);
      }
    }
  } catch (error) {
    console.error('Apibay search error:', error);
  }
  
  // Sort by seeders (more seeders = faster/more available)
  results.sort((a, b) => b.seeders - a.seeders);
  
  console.log(`Found ${results.length} valid torrents`);
  return results.slice(0, 10);
}

// Add magnet to Real-Debrid and get download links
async function processMagnet(apiKey: string, magnet: string): Promise<{id: string, links: string[], files: any[]} | null> {
  const rdHeaders = { 'Authorization': `Bearer ${apiKey}` };
  
  try {
    // Add magnet
    const formData = new FormData();
    formData.append('magnet', magnet);
    
    console.log('Adding magnet to RD...');
    const addRes = await fetchWithRetry(`${RD_API}/torrents/addMagnet`, {
      method: 'POST',
      headers: rdHeaders,
      body: formData,
    });
    
    if (!addRes.ok) {
      const errorText = await addRes.text();
      console.log('Failed to add magnet:', errorText);
      return null;
    }
    
    const addData = await addRes.json();
    const torrentId = addData.id;
    console.log('Torrent added with ID:', torrentId);
    
    // Get torrent info to see files
    const infoRes1 = await fetchWithRetry(`${RD_API}/torrents/info/${torrentId}`, {
      headers: rdHeaders,
    });
    
    if (!infoRes1.ok) {
      return null;
    }
    
    const info1 = await infoRes1.json();
    console.log('Torrent status:', info1.status, 'Files:', info1.files?.length);
    
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
    
    // If no audio files found, select all
    const filesToSelect = audioFileIds.length > 0 ? audioFileIds.join(',') : 'all';
    console.log('Selecting files:', filesToSelect);
    
    // Select files
    const selectForm = new FormData();
    selectForm.append('files', filesToSelect);
    
    await fetchWithRetry(`${RD_API}/torrents/selectFiles/${torrentId}`, {
      method: 'POST',
      headers: rdHeaders,
      body: selectForm,
    });
    
    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Get updated torrent info
    const infoRes2 = await fetchWithRetry(`${RD_API}/torrents/info/${torrentId}`, {
      headers: rdHeaders,
    });
    
    if (!infoRes2.ok) {
      return null;
    }
    
    const info2 = await infoRes2.json();
    console.log('Final status:', info2.status, 'Links:', info2.links?.length);
    
    return { 
      id: torrentId, 
      links: info2.links || [],
      files: info2.files || []
    };
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
        // Verify API key first with retry
        const userRes = await fetchWithRetry(`${RD_API}/user`, { headers: rdHeaders });
        if (!userRes.ok) {
          throw new Error('Invalid Real-Debrid API key');
        }

        console.log('Searching for:', query);
        
        const torrents = await searchTorrents(query);
        console.log(`Processing ${torrents.length} torrents`);
        
        const streams: {id: string, title: string, streamUrl: string, quality: string, size: string}[] = [];
        
        // Process magnets
        for (const torrent of torrents.slice(0, 5)) {
          if (streams.length >= 5) break;
          
          try {
            console.log('Processing:', torrent.title.slice(0, 50));
            const processed = await processMagnet(apiKey, torrent.magnet);
            
            if (processed && processed.links.length > 0) {
              for (const rdLink of processed.links.slice(0, 3)) {
                const unrestrictForm = new FormData();
                unrestrictForm.append('link', rdLink);
                
                const unrestrictRes = await fetchWithRetry(`${RD_API}/unrestrict/link`, {
                  method: 'POST',
                  headers: rdHeaders,
                  body: unrestrictForm,
                });
                
                if (unrestrictRes.ok) {
                  const unrestrictData = await unrestrictRes.json();
                  const filename = unrestrictData.filename?.toLowerCase() || '';
                  
                  // Only include audio files
                  if (filename.endsWith('.mp3') || filename.endsWith('.flac') || 
                      filename.endsWith('.m4a') || filename.endsWith('.wav') ||
                      filename.endsWith('.aac') || filename.endsWith('.ogg') ||
                      unrestrictData.mimeType?.includes('audio')) {
                    
                    streams.push({
                      id: `${processed.id}-${streams.length}`,
                      title: unrestrictData.filename || torrent.title,
                      streamUrl: unrestrictData.download,
                      quality: filename.includes('flac') ? 'FLAC' : 
                               filename.includes('320') ? '320kbps' : 
                               filename.includes('256') ? '256kbps' : 'MP3',
                      size: unrestrictData.filesize ? 
                            `${Math.round(unrestrictData.filesize / 1024 / 1024)}MB` : 
                            torrent.size,
                    });
                    
                    console.log('Added stream:', unrestrictData.filename?.slice(0, 50));
                  }
                }
              }
            }
          } catch (e) {
            console.error('Error processing torrent:', e);
          }
        }
        
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
          const error = await response.text();
          throw new Error(`Failed to unrestrict link: ${error}`);
        }

        result = await response.json();
        console.log('Unrestricted link:', result.download?.slice(0, 100));
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