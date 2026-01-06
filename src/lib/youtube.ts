import { supabase } from '@/integrations/supabase/client';

export interface YouTubeVideo {
  id: string;
  title: string;
  duration: number;
  uploaderName: string;
  thumbnail: string;
}

export interface YouTubeAudio {
  url: string;
  quality: string;
  mimeType: string;
  bitrate: number;
}

export async function searchYouTube(query: string): Promise<YouTubeVideo[]> {
  console.log('Searching YouTube for:', query);
  
  const { data, error } = await supabase.functions.invoke('youtube-audio', {
    body: { action: 'search', query },
  });

  if (error) {
    console.error('YouTube search error:', error);
    return [];
  }

  return data?.videos || [];
}

export async function getYouTubeAudio(videoId: string): Promise<YouTubeAudio | null> {
  console.log('Getting YouTube audio for:', videoId);
  
  const { data, error } = await supabase.functions.invoke('youtube-audio', {
    body: { action: 'getAudio', videoId },
  });

  if (error) {
    console.error('YouTube audio error:', error);
    return null;
  }

  return data?.audio || null;
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
