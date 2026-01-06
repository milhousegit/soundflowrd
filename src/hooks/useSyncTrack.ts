import { useCallback } from 'react';
import { Track } from '@/types/music';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { searchStreams, selectFilesAndPlay } from '@/lib/realdebrid';
import { 
  addSyncingTrack, 
  removeSyncingTrack, 
  addSyncedTrack,
  addDownloadingTrack,
  removeDownloadingTrack 
} from '@/hooks/useSyncedTracks';

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

// Standalone function to sync a single track in background
export const syncTrackInBackground = async (track: Track, apiKey: string): Promise<void> => {
  // Check if already synced
  const { data: existingMapping } = await supabase
    .from('track_file_mappings')
    .select('id, direct_link')
    .eq('track_id', track.id)
    .maybeSingle();

  if (existingMapping?.direct_link) {
    addSyncedTrack(track.id);
    return; // Already synced
  }

  addSyncingTrack(track.id);

  try {
    // Build search query - try album first, then track
    const searchQuery = track.album && track.artist
      ? `${track.album} ${track.artist}`
      : `${track.title} ${track.artist}`;

    console.log('[SyncTrack] Searching:', searchQuery);

    const result = await searchStreams(apiKey, searchQuery);

    if (result.torrents.length === 0) {
      console.log('[SyncTrack] No torrents found');
      removeSyncingTrack(track.id);
      return;
    }

    // Find best torrent with files
    let bestTorrent = result.torrents.find(t => t.files && t.files.length > 0);
    if (!bestTorrent?.files) {
      console.log('[SyncTrack] No torrent with files');
      removeSyncingTrack(track.id);
      return;
    }

    // Find matching file
    const matchingFile = bestTorrent.files.find(file => {
      const matchesFileName = flexibleMatch(file.filename || '', track.title);
      const matchesPath = flexibleMatch(file.path || '', track.title);
      return matchesFileName || matchesPath;
    });

    if (!matchingFile) {
      console.log('[SyncTrack] No matching file for:', track.title);
      removeSyncingTrack(track.id);
      return;
    }

    console.log('[SyncTrack] Match found:', track.title, '->', matchingFile.filename);

    // Create album mapping if needed
    let albumMappingId: string | null = null;
    if (track.albumId) {
      const { data: existingAlbumMapping } = await supabase
        .from('album_torrent_mappings')
        .select('id')
        .eq('album_id', track.albumId)
        .maybeSingle();

      if (existingAlbumMapping) {
        albumMappingId = existingAlbumMapping.id;
      } else {
        const { data: newMapping } = await supabase
          .from('album_torrent_mappings')
          .insert({
            album_id: track.albumId,
            album_title: track.album || track.title,
            artist_name: track.artist,
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

    // Select file and get stream
    const selectResult = await selectFilesAndPlay(apiKey, bestTorrent.torrentId, [matchingFile.id]);

    if (selectResult.error || selectResult.status === 'error' || selectResult.status === 'dead') {
      console.log('[SyncTrack] Select error:', selectResult.error || selectResult.status);
      removeSyncingTrack(track.id);
      return;
    }

    if (selectResult.streams.length > 0 && albumMappingId) {
      // Immediate sync - save with direct link
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

      removeSyncingTrack(track.id);
      addSyncedTrack(track.id);
      console.log('[SyncTrack] Synced:', track.title);
    } else if ((selectResult.status === 'downloading' || selectResult.status === 'queued') && albumMappingId) {
      // Save mapping without link, mark as downloading
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

      removeSyncingTrack(track.id);
      addDownloadingTrack(track.id);

      // Poll for completion (10s timeout at 0%)
      const startTime = Date.now();
      const pollInterval = setInterval(async () => {
        try {
          const pollResult = await selectFilesAndPlay(apiKey, bestTorrent!.torrentId, [matchingFile.id]);
          
          if (pollResult.streams.length > 0) {
            await supabase
              .from('track_file_mappings')
              .update({ direct_link: pollResult.streams[0].streamUrl })
              .eq('track_id', track.id);

            removeDownloadingTrack(track.id);
            addSyncedTrack(track.id);
            clearInterval(pollInterval);
            console.log('[SyncTrack] Download complete:', track.title);
          } else if (pollResult.progress === 0 && (Date.now() - startTime) > 10000) {
            removeDownloadingTrack(track.id);
            clearInterval(pollInterval);
            console.log('[SyncTrack] Timeout at 0%:', track.title);
          } else if (pollResult.status === 'error' || pollResult.status === 'dead') {
            removeDownloadingTrack(track.id);
            clearInterval(pollInterval);
          }
        } catch (e) {
          console.error('[SyncTrack] Poll error:', e);
        }
      }, 1000);

      // Max 2 minute poll
      setTimeout(() => clearInterval(pollInterval), 120000);
    } else {
      removeSyncingTrack(track.id);
    }
  } catch (error) {
    console.error('[SyncTrack] Error:', error);
    removeSyncingTrack(track.id);
  }
};

export const useSyncTrack = () => {
  const { credentials } = useAuth();

  const syncTrack = useCallback(async (track: Track) => {
    if (!credentials?.realDebridApiKey) return;
    
    // Run in background - don't await
    syncTrackInBackground(track, credentials.realDebridApiKey);
  }, [credentials]);

  return { syncTrack };
};
