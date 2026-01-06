import { useState, useCallback } from 'react';
import { Track } from '@/types/music';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { searchStreams, selectFilesAndPlay, TorrentInfo, AudioFile } from '@/lib/realdebrid';
import { 
  addSyncingTrack, 
  removeSyncingTrack, 
  addSyncedTrack,
  addDownloadingTrack,
  removeDownloadingTrack 
} from '@/hooks/useSyncedTracks';
import { toast } from 'sonner';

// Track sync status for album sync operation
interface TrackSyncStatus {
  trackId: string;
  status: 'pending' | 'syncing' | 'downloading' | 'synced' | 'failed';
  progress?: number;
}

// Helper to normalize string for matching
const normalizeForMatch = (str: string): string => {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[''`]/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const extractSignificantWords = (str: string): string[] => {
  const normalized = normalizeForMatch(str);
  const stopWords = ['a', 'e', 'i', 'o', 'u', 'il', 'la', 'lo', 'le', 'gli', 'un', 'una', 'uno', 'di', 'da', 'in', 'con', 'su', 'per', 'tra', 'fra', 'del', 'della', 'dei', 'degli', 'al', 'alla', 'the', 'a', 'an', 'of', 'to', 'and', 'or', 'for', 'mp3', 'flac', 'wav', 'm4a', 'aac', 'ogg'];
  return normalized
    .split(/\s+/)
    .filter(w => w.length > 1 && !stopWords.includes(w) && !/^\d+$/.test(w));
};

const flexibleMatch = (fileName: string, trackTitle: string): boolean => {
  const normalizedFile = normalizeForMatch(fileName);
  const normalizedTitle = normalizeForMatch(trackTitle);
  
  if (normalizedFile.includes(normalizedTitle)) return true;
  if (normalizedTitle.length > 3 && normalizedFile.includes(normalizedTitle)) return true;
  
  const titleWords = extractSignificantWords(trackTitle);
  if (titleWords.length === 0) return false;
  
  const matchingWords = titleWords.filter(word => normalizedFile.includes(word));
  
  if (matchingWords.length === titleWords.length) return true;
  if (titleWords.length >= 4 && matchingWords.length >= 3) return true;
  if (titleWords.length <= 3 && matchingWords.length === titleWords.length) return true;
  
  const fileWords = extractSignificantWords(fileName);
  if (fileWords.length >= 2) {
    const fileWordsInTitle = fileWords.filter(fw => titleWords.includes(fw));
    if (fileWordsInTitle.length >= fileWords.length * 0.8 && fileWordsInTitle.length >= 2) {
      return true;
    }
  }
  
  return false;
};

export const useSyncAlbum = () => {
  const { credentials } = useAuth();
  const [isSyncingAlbum, setIsSyncingAlbum] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ synced: number; total: number }>({ synced: 0, total: 0 });

  const syncAlbum = useCallback(async (tracks: Track[], albumTitle: string, artistName: string) => {
    if (!credentials?.realDebridApiKey || tracks.length === 0) {
      toast.error('API Key Real-Debrid mancante');
      return;
    }

    setIsSyncingAlbum(true);
    setSyncProgress({ synced: 0, total: tracks.length });

    // Mark all tracks as syncing
    tracks.forEach(track => addSyncingTrack(track.id));

    try {
      // First, check which tracks already have mappings
      const trackIds = tracks.map(t => t.id);
      const { data: existingMappings } = await supabase
        .from('track_file_mappings')
        .select('track_id, direct_link')
        .in('track_id', trackIds);

      const alreadySynced = new Set(existingMappings?.filter(m => m.direct_link).map(m => m.track_id) || []);
      
      // Mark already synced tracks
      let syncedCount = 0;
      alreadySynced.forEach(trackId => {
        removeSyncingTrack(trackId);
        addSyncedTrack(trackId);
        syncedCount++;
      });
      setSyncProgress({ synced: syncedCount, total: tracks.length });

      if (alreadySynced.size === tracks.length) {
        toast.success('Album già sincronizzato');
        setIsSyncingAlbum(false);
        return;
      }

      // Search for album torrent
      const searchQuery = `${albumTitle} ${artistName}`;
      console.log('Sync album search:', searchQuery);

      const result = await searchStreams(credentials.realDebridApiKey, searchQuery);

      if (result.torrents.length === 0) {
        toast.error('Nessun torrent trovato per questo album');
        tracks.forEach(track => {
          if (!alreadySynced.has(track.id)) {
            removeSyncingTrack(track.id);
          }
        });
        setIsSyncingAlbum(false);
        return;
      }

      // Find best torrent with files
      let bestTorrent: TorrentInfo | null = null;
      for (const torrent of result.torrents) {
        if (torrent.files && torrent.files.length >= tracks.length * 0.5) {
          bestTorrent = torrent;
          break;
        }
        if (torrent.files && torrent.files.length > 0 && !bestTorrent) {
          bestTorrent = torrent;
        }
      }

      if (!bestTorrent || !bestTorrent.files) {
        toast.error('Nessun torrent con file audio trovato');
        tracks.forEach(track => {
          if (!alreadySynced.has(track.id)) {
            removeSyncingTrack(track.id);
          }
        });
        setIsSyncingAlbum(false);
        return;
      }

      console.log('Selected torrent:', bestTorrent.title, 'with', bestTorrent.files.length, 'files');

      // Create or get album mapping
      let albumMappingId: string | null = null;
      const albumId = tracks[0].albumId;

      if (albumId) {
        const { data: existingMapping } = await supabase
          .from('album_torrent_mappings')
          .select('id')
          .eq('album_id', albumId)
          .maybeSingle();

        if (existingMapping) {
          albumMappingId = existingMapping.id;
        } else {
          const { data: newMapping } = await supabase
            .from('album_torrent_mappings')
            .insert({
              album_id: albumId,
              album_title: albumTitle,
              artist_name: artistName,
              torrent_id: bestTorrent.torrentId,
              torrent_title: bestTorrent.title,
            })
            .select('id')
            .single();

          if (newMapping) {
            albumMappingId = newMapping.id;
          }
        }
      }

      // Match and sync each track
      const tracksToSync = tracks.filter(t => !alreadySynced.has(t.id));
      const failedTracks: string[] = [];
      const downloadingTracks: Map<string, { track: Track; fileId: number; torrentId: string }> = new Map();

      for (const track of tracksToSync) {
        // Find matching file
        const matchingFile = bestTorrent.files!.find(file => {
          const matchesFileName = flexibleMatch(file.filename || '', track.title);
          const matchesPath = flexibleMatch(file.path || '', track.title);
          return matchesFileName || matchesPath;
        });

        if (!matchingFile) {
          console.log('No match for track:', track.title);
          failedTracks.push(track.title);
          removeSyncingTrack(track.id);
          continue;
        }

        console.log('Match found:', track.title, '->', matchingFile.filename);

        try {
          // Select file and get stream
          const selectResult = await selectFilesAndPlay(
            credentials.realDebridApiKey,
            bestTorrent.torrentId,
            [matchingFile.id]
          );

          if (selectResult.error || selectResult.status === 'error' || selectResult.status === 'dead') {
            console.log('Select error for track:', track.title, selectResult.error || selectResult.status);
            failedTracks.push(track.title);
            removeSyncingTrack(track.id);
            continue;
          }

          if (selectResult.streams.length > 0) {
            // Immediate sync - save with direct link
            if (albumMappingId) {
              await supabase
                .from('track_file_mappings')
                .upsert(
                  {
                    album_mapping_id: albumMappingId,
                    track_id: track.id,
                    track_title: track.title,
                    file_id: matchingFile.id,
                    file_path: matchingFile.path || '',
                    file_name: matchingFile.filename || track.title,
                    direct_link: selectResult.streams[0].streamUrl,
                  },
                  { onConflict: 'track_id' }
                );
            }

            removeSyncingTrack(track.id);
            addSyncedTrack(track.id);
            syncedCount++;
            setSyncProgress({ synced: syncedCount, total: tracks.length });
          } else if (selectResult.status === 'downloading' || selectResult.status === 'queued') {
            // Track is downloading - save mapping without link, will poll for completion
            removeSyncingTrack(track.id);
            addDownloadingTrack(track.id);
            
            if (albumMappingId) {
              await supabase
                .from('track_file_mappings')
                .upsert(
                  {
                    album_mapping_id: albumMappingId,
                    track_id: track.id,
                    track_title: track.title,
                    file_id: matchingFile.id,
                    file_path: matchingFile.path || '',
                    file_name: matchingFile.filename || track.title,
                    direct_link: null,
                  },
                  { onConflict: 'track_id' }
                );
            }
            
            downloadingTracks.set(track.id, {
              track,
              fileId: matchingFile.id,
              torrentId: bestTorrent.torrentId,
            });
          }
        } catch (error) {
          console.error('Error syncing track:', track.title, error);
          failedTracks.push(track.title);
          removeSyncingTrack(track.id);
        }
      }

      // Poll for downloading tracks (10 second timeout at 0%)
      if (downloadingTracks.size > 0) {
        console.log('Polling for', downloadingTracks.size, 'downloading tracks');
        
        const startTimes = new Map<string, number>();
        downloadingTracks.forEach((_, trackId) => {
          startTimes.set(trackId, Date.now());
        });

        const pollDownloads = async () => {
          const remaining = new Map(downloadingTracks);
          
          while (remaining.size > 0) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            for (const [trackId, info] of remaining) {
              try {
                const selectResult = await selectFilesAndPlay(
                  credentials.realDebridApiKey,
                  info.torrentId,
                  [info.fileId]
                );

                if (selectResult.streams.length > 0) {
                  // Download complete
                  if (albumMappingId) {
                    await supabase
                      .from('track_file_mappings')
                      .update({ direct_link: selectResult.streams[0].streamUrl })
                      .eq('track_id', trackId);
                  }

                  removeDownloadingTrack(trackId);
                  addSyncedTrack(trackId);
                  remaining.delete(trackId);
                  syncedCount++;
                  setSyncProgress({ synced: syncedCount, total: tracks.length });
                } else if (selectResult.status === 'downloading' || selectResult.status === 'queued') {
                  // Check 10 second timeout at 0%
                  const elapsed = (Date.now() - (startTimes.get(trackId) || Date.now())) / 1000;
                  if (selectResult.progress === 0 && elapsed >= 10) {
                    console.log('Track stuck at 0% for 10s:', info.track.title);
                    removeDownloadingTrack(trackId);
                    remaining.delete(trackId);
                    failedTracks.push(info.track.title);
                  }
                } else if (selectResult.status === 'error' || selectResult.status === 'dead') {
                  removeDownloadingTrack(trackId);
                  remaining.delete(trackId);
                  failedTracks.push(info.track.title);
                }
              } catch (error) {
                console.error('Poll error for track:', info.track.title, error);
              }
            }
          }
        };

        // Don't await - let it run in background
        pollDownloads();
      }

      // Show results
      if (failedTracks.length === 0) {
        toast.success(`Album sincronizzato`, {
          description: `${syncedCount} tracce pronte per la riproduzione istantanea`,
        });
      } else if (syncedCount > 0) {
        toast.warning(`Sincronizzazione parziale`, {
          description: `${syncedCount} tracce sincronizzate, ${failedTracks.length} non trovate`,
        });
      } else {
        toast.error(`Sincronizzazione fallita`, {
          description: `Nessuna traccia trovata nel torrent`,
        });
      }

    } catch (error) {
      console.error('Album sync error:', error);
      toast.error('Errore durante la sincronizzazione');
      tracks.forEach(track => removeSyncingTrack(track.id));
    } finally {
      setIsSyncingAlbum(false);
    }
  }, [credentials]);

  return {
    syncAlbum,
    isSyncingAlbum,
    syncProgress,
  };
};
