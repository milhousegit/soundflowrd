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
  
  const { data, error } = await supabase.functions.invoke('real-debrid', {
    body: { action: 'search', apiKey, query },
  });

  if (error) {
    console.error('Stream search error:', error);
    return [];
  }

  // In a real implementation, this would return actual stream results
  // For now, we return mock data structure
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
