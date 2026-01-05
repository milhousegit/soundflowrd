import { supabase } from '@/integrations/supabase/client';

export interface StreamResult {
  id: string;
  title: string;
  streamUrl: string;
  quality: string;
  size?: number;
  source?: string;
}

export async function verifyApiKey(apiKey: string): Promise<{ valid: boolean; username?: string; premium?: boolean }> {
  const { data, error } = await supabase.functions.invoke('real-debrid', {
    body: { action: 'verify', apiKey },
  });

  if (error) return { valid: false };
  return data;
}

export async function searchStreams(
  apiKey: string, 
  trackTitle: string, 
  artistName: string
): Promise<StreamResult[]> {
  const query = `${artistName} ${trackTitle}`;
  
  console.log('Searching streams for:', query);
  
  const { data, error } = await supabase.functions.invoke('real-debrid', {
    body: { action: 'search', apiKey, query },
  });

  if (error) {
    console.error('Stream search error:', error);
    return [];
  }

  console.log('Stream search result:', data);
  
  // Return the streams from the API
  if (data?.streams && Array.isArray(data.streams)) {
    return data.streams.map((s: any) => ({
      id: s.id,
      title: s.title,
      streamUrl: s.streamUrl,
      quality: s.quality || 'MP3',
      size: s.size,
      source: 'Real-Debrid',
    }));
  }
  
  return [];
}

export async function unrestrictLink(apiKey: string, link: string): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke('real-debrid', {
    body: { action: 'unrestrict', apiKey, link },
  });

  if (error) {
    console.error('Unrestrict error:', error);
    return null;
  }

  return data?.download || null;
}
