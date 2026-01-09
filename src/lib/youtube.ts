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

export interface YouTubeAudioResult {
  audio: YouTubeAudio | null;
  useIframe?: boolean;
  videoId?: string;
  error?: string;
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

export async function getYouTubeAudio(videoId: string): Promise<YouTubeAudioResult> {
  console.log('Getting YouTube audio for:', videoId);
  
  const { data, error } = await supabase.functions.invoke('youtube-audio', {
    body: { action: 'getAudio', videoId },
  });

  if (error) {
    console.error('YouTube audio error:', error);
    // On error, fallback to iframe
    return { 
      audio: null, 
      useIframe: true, 
      videoId: videoId.replace('/watch?v=', '').replace('watch?v=', '').split('&')[0] 
    };
  }

  // Check if server returned useIframe flag
  if (data?.useIframe) {
    console.log('Server returned iframe fallback for:', data.videoId);
    return {
      audio: null,
      useIframe: true,
      videoId: data.videoId,
    };
  }

  return {
    audio: data?.audio || null,
    useIframe: !data?.audio, // Fallback to iframe if no audio
    videoId: videoId.replace('/watch?v=', '').replace('watch?v=', '').split('&')[0],
  };
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
