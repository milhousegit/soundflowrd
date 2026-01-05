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

export interface AudioFile {
  id: number;
  path: string;
  filename: string;
  selected?: boolean;
}

export interface TorrentInfo {
  torrentId: string;
  title: string;
  size: string;
  source: string;
  seeders: number;
  status: string;
  progress: number;
  files: AudioFile[];
  hasLinks: boolean;
}

export interface SearchResult {
  torrents: TorrentInfo[];
  streams?: StreamResult[];
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
    return { torrents: [] };
  }

  console.log('Stream search result:', data);
  if (data?.debug && Array.isArray(data.debug)) {
    console.groupCollapsed('[real-debrid debug]');
    for (const line of data.debug) console.log(line);
    console.groupEnd();
  }

  const torrents: TorrentInfo[] = [];
  
  if (data?.torrents && Array.isArray(data.torrents)) {
    for (const t of data.torrents) {
      torrents.push({
        torrentId: t.torrentId,
        title: t.title,
        size: t.size || 'Unknown',
        source: t.source || 'Unknown',
        seeders: t.seeders || 0,
        status: t.status || 'unknown',
        progress: t.progress || 0,
        files: t.files || [],
        hasLinks: t.hasLinks || false,
      });
    }
  }
  
  return { torrents };
}

export async function selectFilesAndPlay(
  apiKey: string,
  torrentId: string,
  fileIds: number[]
): Promise<{ status: string; progress: number; streams: StreamResult[]; error?: string }> {
  console.log('Selecting files:', torrentId, fileIds);
  
  const { data, error } = await supabase.functions.invoke('real-debrid', {
    body: { action: 'selectFiles', apiKey, torrentId, fileIds },
  });

  if (error) {
    console.error('Select files error:', error);
    return { status: 'error', progress: 0, streams: [], error: error.message };
  }

  // Check if response contains an error field
  if (data?.error) {
    console.error('Select files error from API:', data.error);
    return { status: 'error', progress: 0, streams: [], error: data.error };
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
      source: s.source || 'Real-Debrid',
      status: 'ready' as const,
    })),
  };
}

export async function checkTorrentStatus(
  apiKey: string,
  torrentId: string
): Promise<{ status: string; progress: number; files: AudioFile[]; streams: StreamResult[] }> {
  const { data, error } = await supabase.functions.invoke('real-debrid', {
    body: { action: 'checkTorrent', apiKey, torrentId },
  });

  if (error) {
    console.error('Check torrent error:', error);
    return { status: 'error', progress: 0, files: [], streams: [] };
  }

  return {
    status: data?.status || 'unknown',
    progress: data?.progress || 0,
    files: data?.files || [],
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
