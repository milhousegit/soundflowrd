import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RD_API = 'https://api.real-debrid.com/rest/1.0';

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
        // Search for torrents/links for a song
        // We'll use a combination approach: search torrent sites and unrestrict
        const searchQuery = encodeURIComponent(query + ' mp3 320kbps');
        
        // First check if user has valid account
        const userRes = await fetch(`${RD_API}/user`, { headers: rdHeaders });
        if (!userRes.ok) {
          throw new Error('Invalid Real-Debrid API key');
        }

        // Search for available hosters
        const hostersRes = await fetch(`${RD_API}/hosts/status`, { headers: rdHeaders });
        const hosters = await hostersRes.json();
        
        // For demo, return structure with placeholder
        // In real implementation, you'd integrate with torrent indexers
        result = {
          success: true,
          message: 'Search initiated',
          hosters: Object.keys(hosters || {}).slice(0, 10),
        };
        break;
      }

      case 'unrestrict': {
        // Unrestrict a link to get direct download URL
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

      case 'get-torrents': {
        const response = await fetch(`${RD_API}/torrents`, { headers: rdHeaders });
        if (!response.ok) {
          throw new Error('Failed to get torrents');
        }
        result = await response.json();
        break;
      }

      case 'add-magnet': {
        const formData = new FormData();
        formData.append('magnet', link);

        const response = await fetch(`${RD_API}/torrents/addMagnet`, {
          method: 'POST',
          headers: rdHeaders,
          body: formData,
        });

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Failed to add magnet: ${error}`);
        }

        result = await response.json();
        break;
      }

      case 'select-files': {
        const { torrentId, fileIds } = await req.json();
        const formData = new FormData();
        formData.append('files', fileIds || 'all');

        const response = await fetch(`${RD_API}/torrents/selectFiles/${torrentId}`, {
          method: 'POST',
          headers: rdHeaders,
          body: formData,
        });

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Failed to select files: ${error}`);
        }

        result = { success: true };
        break;
      }

      case 'get-torrent-info': {
        const { torrentId } = await req.json();
        const response = await fetch(`${RD_API}/torrents/info/${torrentId}`, { 
          headers: rdHeaders 
        });

        if (!response.ok) {
          throw new Error('Failed to get torrent info');
        }

        result = await response.json();
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
