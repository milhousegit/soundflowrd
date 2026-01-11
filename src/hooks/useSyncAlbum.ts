import { useState, useCallback } from 'react';
import { Track } from '@/types/music';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { searchStreams, selectFilesAndPlay, checkTorrentStatus, TorrentInfo, AudioFile } from '@/lib/realdebrid';
import {
  addSyncingTrack,
  removeSyncingTrack,
  addSyncedTrack,
  addDownloadingTrack,
  removeDownloadingTrack,
} from '@/hooks/useSyncedTracks';

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


// Poll for a single track download completion
const pollTrackDownload = async (
  apiKey: string,
  torrentId: string,
  fileId: number,
  trackId: string,
  albumMappingId: string | null,
  maxWaitMs: number = 30000
): Promise<{ success: boolean; directLink?: string }> => {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitMs) {
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    try {
      const selectResult = await selectFilesAndPlay(apiKey, torrentId, [fileId]);
      
      if (selectResult.streams.length > 0) {
        // Download complete - update mapping with direct link
        if (albumMappingId) {
          await supabase
            .from('track_file_mappings')
            .update({ direct_link: selectResult.streams[0].streamUrl })
            .eq('track_id', trackId);
        }
        return { success: true, directLink: selectResult.streams[0].streamUrl };
      }
      
      if (selectResult.status === 'error' || selectResult.status === 'dead' || selectResult.status === 'not_found') {
        return { success: false };
      }
      
      // Check if stuck at 0% for too long (10 seconds)
      if (selectResult.progress === 0 && Date.now() - startTime > 10000) {
        console.log('Track download stuck at 0% for 10s, aborting');
        return { success: false };
      }
      
    } catch (error) {
      console.error('Poll error:', error);
    }
  }
  
  console.log('Track download timeout after', maxWaitMs, 'ms');
  return { success: false };
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

    let syncedCount = 0;
    let failedCount = 0;

    try {
      // First, check which tracks already have RD mappings
      const trackIds = tracks.map(t => t.id);

      const rdMappingsResult = await supabase
        .from('track_file_mappings')
        .select('track_id, direct_link')
        .in('track_id', trackIds);

      const alreadySyncedRD = new Set(rdMappingsResult.data?.filter(m => m.direct_link).map(m => m.track_id) || []);

      // Mark already synced tracks
      alreadySyncedRD.forEach(trackId => {
        removeSyncingTrack(trackId);
        addSyncedTrack(trackId);
        syncedCount++;
      });

      setSyncProgress({ synced: syncedCount, total: tracks.length });

      if (alreadySyncedRD.size >= tracks.length) {
        toast.success('Album già sincronizzato');
        setIsSyncingAlbum(false);
        return;
      }

      // Search for album torrent
      const searchQuery = `${albumTitle} ${artistName}`;
      console.log('Sync album search:', searchQuery);

      const result = await searchStreams(credentials.realDebridApiKey, searchQuery);

      // Find best torrent with files (if any)
      let bestTorrent: TorrentInfo | null = null;
      if (result.torrents.length > 0) {
        for (const torrent of result.torrents) {
          if (torrent.files && torrent.files.length >= tracks.length * 0.5) {
            bestTorrent = torrent;
            break;
          }
          if (torrent.files && torrent.files.length > 0 && !bestTorrent) {
            bestTorrent = torrent;
          }
        }
      }

      // Create or get album mapping (if we have a torrent)
      let albumMappingId: string | null = null;
      const albumId = tracks[0].albumId;

      if (bestTorrent && albumId) {
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

      console.log('Best torrent:', bestTorrent?.title || 'NONE', 'with', bestTorrent?.files?.length || 0, 'files');

      // Process each track SEQUENTIALLY
      const tracksToSync = tracks.filter(t => !alreadySyncedRD.has(t.id));

      for (let i = 0; i < tracksToSync.length; i++) {
        const track = tracksToSync[i];
        
        // Add delay between requests (2 seconds) to avoid RD rate limiting
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

        let trackSynced = false;

        // Try RD torrent first (if we have one)
        if (bestTorrent?.files) {
          const matchingFile = bestTorrent.files.find(file => {
            const matchesFileName = flexibleMatch(file.filename || '', track.title);
            const matchesPath = flexibleMatch(file.path || '', track.title);
            return matchesFileName || matchesPath;
          });

          if (matchingFile) {
            console.log('Match found:', track.title, '->', matchingFile.filename);

            try {
              const selectResult = await selectFilesAndPlay(
                credentials.realDebridApiKey,
                bestTorrent.torrentId,
                [matchingFile.id]
              );

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
                trackSynced = true;
                console.log('Track synced via RD:', track.title);
              } else if (selectResult.status === 'downloading' || selectResult.status === 'queued') {
                // Start downloading - save mapping and poll
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

                // Poll and wait for this track to complete (max 30s)
                const pollResult = await pollTrackDownload(
                  credentials.realDebridApiKey,
                  bestTorrent.torrentId,
                  matchingFile.id,
                  track.id,
                  albumMappingId,
                  30000
                );

                removeDownloadingTrack(track.id);

                if (pollResult.success) {
                  addSyncedTrack(track.id);
                  syncedCount++;
                  trackSynced = true;
                  console.log('Track synced via RD (after download):', track.title);
                }
              }
            } catch (error) {
              console.error('Error syncing track via RD:', track.title, error);
            }
          } else {
            console.log('No RD file match for track:', track.title);
          }
        }


        if (!trackSynced) {
          failedCount++;
          console.log('Track sync completely failed:', track.title);
        }

        setSyncProgress({ synced: syncedCount, total: tracks.length });
      }

      // Show results
      if (failedCount === 0) {
        toast.success(`Album sincronizzato`, {
          description: `${syncedCount} tracce pronte per la riproduzione`,
        });
      } else if (syncedCount > 0) {
        toast.warning(`Sincronizzazione parziale`, {
          description: `${syncedCount} sincronizzate, ${failedCount} non trovate`,
        });
      } else {
        toast.error(`Sincronizzazione fallita`, {
          description: `Nessuna traccia sincronizzata`,
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
