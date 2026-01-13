import { useState, useCallback } from 'react';
import { Track } from '@/types/music';
import { usePlayer } from '@/contexts/PlayerContext';
import { useOfflineStorage } from './useOfflineStorage';
import { toast } from 'sonner';

interface DownloadProgress {
  current: number;
  total: number;
  currentTrack: Track | null;
}

export const useDownloadAll = () => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState<DownloadProgress>({ current: 0, total: 0, currentTrack: null });
  const { alternativeStreams } = usePlayer();
  const { saveTrackOffline, isTrackOffline } = useOfflineStorage();

  const downloadTrack = useCallback(async (track: Track): Promise<boolean> => {
    try {
      // Get stream URL from Deezer priority source
      const baseUrl = import.meta.env.VITE_SUPABASE_URL;
      
      // Try Lucida first
      const lucidaResponse = await fetch(`${baseUrl}/functions/v1/lucida`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'get-stream',
          trackId: track.id,
        }),
      });

      if (lucidaResponse.ok) {
        const lucidaData = await lucidaResponse.json();
        if (lucidaData.streamUrl) {
          const audioResponse = await fetch(lucidaData.streamUrl);
          if (audioResponse.ok) {
            const blob = await audioResponse.blob();
            await saveTrackOffline(track, blob);
            return true;
          }
        }
      }

      // Fallback to squidwtf (Tidal)
      const squidResponse = await fetch(`${baseUrl}/functions/v1/squidwtf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'search-and-stream',
          title: track.title,
          artist: track.artist,
        }),
      });

      if (squidResponse.ok) {
        const squidData = await squidResponse.json();
        if (squidData.streamUrl) {
          const audioResponse = await fetch(squidData.streamUrl);
          if (audioResponse.ok) {
            const blob = await audioResponse.blob();
            await saveTrackOffline(track, blob);
            return true;
          }
        }
      }

      return false;
    } catch (error) {
      console.error(`Failed to download track ${track.title}:`, error);
      return false;
    }
  }, [saveTrackOffline]);

  const downloadAll = useCallback(async (tracks: Track[], title: string) => {
    // Filter out tracks that are already downloaded
    const tracksToDownload = tracks.filter(t => !isTrackOffline(t.id));
    
    if (tracksToDownload.length === 0) {
      toast.info('Tutti i brani sono già scaricati');
      return;
    }

    setIsDownloading(true);
    setProgress({ current: 0, total: tracksToDownload.length, currentTrack: null });

    const toastId = toast.loading(`Download di "${title}"...`, {
      description: `0/${tracksToDownload.length} brani`,
    });

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < tracksToDownload.length; i++) {
      const track = tracksToDownload[i];
      setProgress({ current: i + 1, total: tracksToDownload.length, currentTrack: track });
      
      toast.loading(`Download di "${title}"...`, {
        id: toastId,
        description: `${i + 1}/${tracksToDownload.length}: ${track.title}`,
      });

      const success = await downloadTrack(track);
      if (success) {
        successCount++;
      } else {
        failCount++;
      }

      // Small delay to prevent overwhelming the server
      await new Promise(r => setTimeout(r, 300));
    }

    setIsDownloading(false);
    setProgress({ current: 0, total: 0, currentTrack: null });

    if (failCount === 0) {
      toast.success(`Download completato!`, {
        id: toastId,
        description: `${successCount} brani scaricati da "${title}"`,
      });
    } else {
      toast.warning(`Download parziale`, {
        id: toastId,
        description: `${successCount} scaricati, ${failCount} falliti`,
      });
    }
  }, [downloadTrack, isTrackOffline]);

  return {
    downloadAll,
    isDownloading,
    progress,
  };
};
