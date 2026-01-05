import { supabase } from '@/integrations/supabase/client';

export interface StreamResult {
  id: string;
  title: string;
  streamUrl: string;
  quality: string;
  size?: number | string;
  source?: string;
  status?: 'ready' | 'downloading' | 'queued' | 'pending';
}

export interface PendingDownload {
  torrentId: string;
  title: string;
  status: string;
  progress: number;
  source: string;
}

export interface SearchResult {
  streams: StreamResult[];
  pendingDownloads: PendingDownload[];
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
  query: string
): Promise<SearchResult> {
  console.log('Searching streams for:', query);
  
  const { data, error } = await supabase.functions.invoke('real-debrid', {
    body: { action: 'search', apiKey, query, debug: true },
  });

  if (error) {
    console.error('Stream search error:', error);
    return { streams: [], pendingDownloads: [] };
  }

  console.log('Stream search result:', data);
  if (data?.debug && Array.isArray(data.debug)) {
    console.groupCollapsed('[real-debrid debug]');
    for (const line of data.debug) console.log(line);
    console.groupEnd();
  }

  const streams: StreamResult[] = [];
  const pendingDownloads: PendingDownload[] = [];
  
  // Process ready streams
  if (data?.streams && Array.isArray(data.streams)) {
    for (const s of data.streams) {
      streams.push({
        id: s.id,
        title: s.title,
        streamUrl: s.streamUrl,
        quality: s.quality || 'MP3',
        size: s.size,
        source: s.source || 'Real-Debrid',
        status: 'ready',
      });
    }
  }
  
  // Process pending downloads
  if (data?.pendingDownloads && Array.isArray(data.pendingDownloads)) {
    for (const p of data.pendingDownloads) {
      pendingDownloads.push({
        torrentId: p.torrentId,
        title: p.title,
        status: p.status,
        progress: p.progress || 0,
        source: p.source || 'Real-Debrid',
      });
    }
  }
  
  return { streams, pendingDownloads };
}

export async function checkTorrentStatus(
  apiKey: string,
  torrentId: string
): Promise<{ status: string; progress: number; streams: StreamResult[] }> {
  const { data, error } = await supabase.functions.invoke('real-debrid', {
    body: { action: 'checkTorrent', apiKey, torrentId },
  });

  if (error) {
    console.error('Check torrent error:', error);
    return { status: 'error', progress: 0, streams: [] };
  }

  return {
    status: data?.status || 'unknown',
    progress: data?.progress || 0,
    streams: (data?.streams || []).map((s: any) => ({
      id: s.id,
      title: s.title,
      streamUrl: s.streamUrl,
      quality: s.quality || 'MP3',
      size: s.size,
      source: 'Real-Debrid',
      status: 'ready' as const,
    })),
  };
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
