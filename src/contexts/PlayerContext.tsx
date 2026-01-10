import React, { createContext, useContext, useState, useRef, useCallback, ReactNode, useEffect } from 'react';
import { Track, PlayerState } from '@/types/music';
import { StreamResult, TorrentInfo, AudioFile, searchStreams, selectFilesAndPlay, checkTorrentStatus } from '@/lib/realdebrid';
import { YouTubeVideo, YouTubeAudioResult, searchYouTube, getYouTubeAudio } from '@/lib/youtube';
import { invalidateYouTubeMappingCache } from '@/hooks/useYouTubeMappings';
import { useIOSAudioSession, isIOS, isPWA } from '@/hooks/useIOSAudioSession';
import { useAuth } from './AuthContext';
import { useSettings } from './SettingsContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { addSyncingTrack, removeSyncingTrack, addSyncedTrack } from '@/hooks/useSyncedTracks';

export interface DebugLogEntry {
  timestamp: Date;
  step: string;
  details?: string;
  status: 'info' | 'success' | 'error' | 'warning';
}

// Loading phases for visual feedback
export type LoadingPhase = 'idle' | 'searching' | 'downloading' | 'loading' | 'unavailable';

interface PlayerContextType extends PlayerState {
  play: (track?: Track) => void;
  pause: () => void;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  addToQueue: (tracks: Track[]) => void;
  playTrack: (track: Track, queue?: Track[]) => void;
  playQueueIndex: (index: number) => void;
  clearQueue: () => void;
  alternativeStreams: StreamResult[];
  availableTorrents: TorrentInfo[];
  selectStream: (stream: StreamResult) => void;
  selectTorrentFile: (torrentId: string, fileIds: number[]) => Promise<void>;
  refreshTorrent: (torrentId: string) => Promise<void>;
  currentStreamId?: string;
  isSearchingStreams: boolean;
  manualSearch: (query: string) => Promise<void>;
  debugLogs: DebugLogEntry[];
  clearDebugLogs: () => void;
  downloadProgress: number | null;
  downloadStatus: string | null;
  loadSavedMapping: () => Promise<void>;
  currentMappedFileId?: number;
  loadingPhase: LoadingPhase;
  // YouTube fallback
  youtubeResults: YouTubeVideo[];
  playYouTubeVideo: (video: YouTubeVideo) => void;
  currentYouTubeVideoId: string | null;
  isPlayingYouTube: boolean;
  useYouTubeIframe: boolean;
  setYouTubeProgress?: (currentTime: number, duration: number) => void;
  setYouTubePlaybackStarted?: () => void;
  setYouTubePaused?: () => void;
  setYouTubeNeedsGesture?: () => void;
  youtubeNeedsUserGesture: boolean;
  clearYouTubeNeedsGesture: () => void;
  // Search query tracking
  lastSearchQuery: string | null;
  searchYouTubeManually: () => Promise<void>;
  // Shuffle
  isShuffled: boolean;
  toggleShuffle: () => void;
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

// Helper function to update Media Session metadata
const updateMediaSessionMetadata = (track: Track | null, isPlaying: boolean) => {
  if (!('mediaSession' in navigator) || !track) return;

  const coverUrl = track.coverUrl;

  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: track.artist,
    album: track.album || '',
    artwork: coverUrl ? [
      { src: coverUrl, sizes: '96x96', type: 'image/jpeg' },
      { src: coverUrl, sizes: '128x128', type: 'image/jpeg' },
      { src: coverUrl, sizes: '192x192', type: 'image/jpeg' },
      { src: coverUrl, sizes: '256x256', type: 'image/jpeg' },
      { src: coverUrl, sizes: '384x384', type: 'image/jpeg' },
      { src: coverUrl, sizes: '512x512', type: 'image/jpeg' },
    ] : [],
  });

  navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
};

export const PlayerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { credentials } = useAuth();
  const { settings, audioSourceMode } = useSettings();
  const iosAudio = useIOSAudioSession();
  const [alternativeStreams, setAlternativeStreams] = useState<StreamResult[]>([]);
  const [availableTorrents, setAvailableTorrents] = useState<TorrentInfo[]>([]);
  const [currentStreamId, setCurrentStreamId] = useState<string>();
  const [isSearchingStreams, setIsSearchingStreams] = useState(false);
  const [debugLogs, setDebugLogs] = useState<DebugLogEntry[]>([]);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);
  const [currentMappedFileId, setCurrentMappedFileId] = useState<number | undefined>();
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>('idle');
  const [youtubeResults, setYoutubeResults] = useState<YouTubeVideo[]>([]);
  const [lastSearchQuery, setLastSearchQuery] = useState<string | null>(null);
  const [currentYouTubeVideoId, setCurrentYouTubeVideoId] = useState<string | null>(null);
  const [isPlayingYouTube, setIsPlayingYouTube] = useState(false);
  const [isShuffled, setIsShuffled] = useState(false);
  const [youtubeNeedsUserGesture, setYoutubeNeedsUserGesture] = useState(false);
  const originalQueueRef = useRef<Track[]>([]);
  
  // Track ID currently being searched - used to cancel stale searches
  const currentSearchTrackIdRef = useRef<string | null>(null);
  
  // Ref for YouTube iframe player
  const youtubePlayerRef = useRef<any>(null);
  const [useYouTubeIframe, setUseYouTubeIframe] = useState(false);
  
  // Helper function to stop YouTube playback
  const stopYouTubePlayback = useCallback(() => {
    if (currentYouTubeVideoId || isPlayingYouTube) {
      console.log('[PlayerContext] Stopping YouTube playback');
      setCurrentYouTubeVideoId(null);
      setIsPlayingYouTube(false);
      setUseYouTubeIframe(false);
    }
  }, [currentYouTubeVideoId, isPlayingYouTube]);
  
  // Helper function to play YouTube audio by video ID - uses iframe directly for reliability
  const playYouTubeAudioById = useCallback(async (videoId: string, videoTitle?: string): Promise<boolean> => {
    // Stop any existing regular audio first
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    
    // CRITICAL: On iOS, "warm up" the audio session before YouTube iframe
    // This helps iOS allow the iframe to autoplay since audio is already active
    try {
      console.log('[YouTube] Warming up audio session before iframe...');
      await iosAudio.quickUnlock();
      iosAudio.keepAlive(); // Start silent audio to keep session active
    } catch (e) {
      console.log('[YouTube] Audio warmup failed (expected if not iOS):', e);
    }
    
    setLoadingPhase('loading');
    setYoutubeNeedsUserGesture(false);
    const cleanVideoId = videoId.replace('/watch?v=', '').replace('watch?v=', '').split('&')[0];
    console.log('playYouTubeAudioById called with:', cleanVideoId);
    
    // Set state immediately - use iframe directly for fastest playback
    setCurrentYouTubeVideoId(cleanVideoId);
    setIsPlayingYouTube(true);
    setUseYouTubeIframe(true); // Use iframe immediately - no delay
    setState(prev => ({ ...prev, isPlaying: true }));
    
    // Set a shorter timeout (3s) - if no playback, assume autoplay blocked
    setTimeout(() => {
      // Only show gesture prompt if still in loading phase
      setLoadingPhase(prev => {
        if (prev === 'loading') {
          console.log('YouTube loading timeout - requesting user gesture');
          setYoutubeNeedsUserGesture(true);
          return 'idle';
        }
        return prev;
      });
    }, 3000);
    
    return true;
  }, [iosAudio]);
  
  // Cache for album torrent - reuse when playing multiple tracks from same album
  const albumCacheRef = useRef<{
    albumId: string;
    torrents: TorrentInfo[];
    searchedAt: number;
  } | null>(null);

  const addDebugLog = useCallback((step: string, details?: string, status: 'info' | 'success' | 'error' | 'warning' = 'info') => {
    const timestamp = new Date();
    const timeStr = timestamp.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const ms = timestamp.getMilliseconds().toString().padStart(3, '0');
    setDebugLogs(prev => [...prev, { timestamp, step, details, status }]);
    console.log(`[DEBUG ${timeStr}.${ms}] ${step}`, details || '');
  }, []);

  const clearDebugLogs = useCallback(() => {
    setDebugLogs([]);
  }, []);
  
  const [state, setState] = useState<PlayerState>({
    currentTrack: null,
    isPlaying: false,
    volume: 0.7,
    progress: 0,
    duration: 0,
    queue: [],
    queueIndex: 0,
  });

  // Update Media Session when track or playing state changes
  useEffect(() => {
    updateMediaSessionMetadata(state.currentTrack, state.isPlaying);
  }, [state.currentTrack, state.isPlaying]);

  useEffect(() => {
    audioRef.current = new Audio();
    audioRef.current.volume = state.volume;

    const audio = audioRef.current;

    const handleTimeUpdate = () => {
      setState(prev => ({ ...prev, progress: audio.currentTime }));
    };

    const handleLoadedMetadata = () => {
      setState(prev => ({ ...prev, duration: audio.duration }));
    };

    const handleEnded = () => {
      next();
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    // Setup Media Session action handlers
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => {
        audio.play();
        setState(prev => ({ ...prev, isPlaying: true }));
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        audio.pause();
        setState(prev => ({ ...prev, isPlaying: false }));
      });
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        // Will be overwritten with actual previous function
      });
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        // Will be overwritten with actual next function
      });
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined) {
          audio.currentTime = details.seekTime;
          setState(prev => ({ ...prev, progress: details.seekTime! }));
        }
      });
    }

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.pause();
      audio.src = '';
    };
  }, []);

  // Helper to normalize string for matching - keeps only alphanumeric and spaces
  const normalizeForMatch = (str: string): string => {
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // remove accents
      .replace(/[''`]/g, '') // remove apostrophes
      .replace(/\([^)]*\)/g, '') // remove content in parentheses (like subtitles)
      .replace(/\[[^\]]*\]/g, '') // remove content in brackets
      .replace(/[^a-z0-9\s]/g, ' ') // replace special chars with space
      .replace(/\s+/g, ' ') // collapse multiple spaces
      .trim();
  };

  // Extract significant words from a string (ignore short words and common terms)
  const extractSignificantWords = (str: string): string[] => {
    const normalized = normalizeForMatch(str);
    // Filter out very short words, numbers, and common filler words
    const stopWords = ['a', 'e', 'i', 'o', 'u', 'il', 'la', 'lo', 'le', 'gli', 'un', 'una', 'uno', 'di', 'da', 'in', 'con', 'su', 'per', 'tra', 'fra', 'del', 'della', 'dei', 'degli', 'al', 'alla', 'the', 'a', 'an', 'of', 'to', 'and', 'or', 'for', 'mp3', 'flac', 'wav', 'm4a', 'aac', 'ogg'];
    return normalized
      .split(/\s+/)
      .filter(w => w.length > 1 && !stopWords.includes(w) && !/^\d+$/.test(w));
  };

  // Helper to check if file name contains track title words (flexible matching)
  // e.g. "06 - L'EMOZIONE NON HA VOCE.mp3" should match "L'emozione non ha voce (Io non so parlar d'amore)"
  const flexibleMatch = (fileName: string, trackTitle: string): boolean => {
    const normalizedFile = normalizeForMatch(fileName);
    const normalizedTitle = normalizeForMatch(trackTitle);
    
    // For very short titles (single word), check if that word is in the file
    if (normalizedTitle.length <= 10 && normalizedTitle.length > 2) {
      if (normalizedFile.includes(normalizedTitle)) {
        return true;
      }
    }
    
    // First try exact substring match (after normalization)
    if (normalizedFile.includes(normalizedTitle)) {
      return true;
    }
    
    // Check if normalized title is contained in normalized file
    if (normalizedTitle.length > 3 && normalizedFile.includes(normalizedTitle)) {
      return true;
    }
    
    // Extract significant words from track title
    const titleWords = extractSignificantWords(trackTitle);
    if (titleWords.length === 0) return false;
    
    // Check how many title words are present in the filename
    const matchingWords = titleWords.filter(word => normalizedFile.includes(word));
    
    // If ALL significant words match, it's definitely a match
    if (matchingWords.length === titleWords.length) {
      return true;
    }
    
    // For single-word titles, be more lenient - check if the word appears anywhere
    if (titleWords.length === 1 && titleWords[0].length >= 3) {
      // Check if the main word is in the file (with some fuzzy matching for accents)
      const mainWord = titleWords[0];
      if (normalizedFile.includes(mainWord)) {
        return true;
      }
    }
    
    // For 2-word titles, require at least one word to match if the word is long enough
    if (titleWords.length === 2) {
      const longWords = titleWords.filter(w => w.length >= 4);
      const matchingLongWords = longWords.filter(word => normalizedFile.includes(word));
      if (longWords.length > 0 && matchingLongWords.length === longWords.length) {
        return true;
      }
      // If both words match, definitely a match
      if (matchingWords.length === 2) {
        return true;
      }
    }
    
    // For titles with 4+ words, require at least 3 matching words
    if (titleWords.length >= 4 && matchingWords.length >= 3) {
      return true;
    }
    
    // For 3-word titles, require at least 2 words to match
    if (titleWords.length === 3 && matchingWords.length >= 2) {
      return true;
    }
    
    // Special case: check if the filename words are a subset of the title words
    // This handles cases where the file has a shorter name than the track title
    const fileWords = extractSignificantWords(fileName);
    if (fileWords.length >= 2) {
      const fileWordsInTitle = fileWords.filter(fw => titleWords.includes(fw));
      // If most file words are in the title, it's likely a match
      if (fileWordsInTitle.length >= fileWords.length * 0.8 && fileWordsInTitle.length >= 2) {
        return true;
      }
    }
    
    // Last resort: check if any file word is exactly the normalized title
    if (fileWords.some(fw => fw === normalizedTitle || normalizedTitle.includes(fw))) {
      if (normalizedTitle.length >= 4) {
        return true;
      }
    }
    
    return false;
  };

  // Helper to save a **file** mapping (torrent + specific file id) to database
  const saveFileMapping = useCallback(async (params: {
    track: Track;
    torrentId: string;
    torrentTitle?: string;
    fileId: number;
    fileName?: string;
    filePath?: string;
    directLink?: string;
  }) => {
    const { track, torrentId, torrentTitle, fileId, fileName, filePath, directLink } = params;

    if (!track.albumId) return;

    try {
      let albumMappingId: string | null = null;

      const { data: existingMapping } = await supabase
        .from('album_torrent_mappings')
        .select('id')
        .eq('album_id', track.albumId)
        .maybeSingle();

      if (existingMapping) {
        albumMappingId = existingMapping.id;
      } else {
        const { data: newMapping, error: insertError } = await supabase
          .from('album_torrent_mappings')
          .insert({
            album_id: track.albumId,
            album_title: track.album || track.title,
            artist_name: track.artist,
            torrent_id: torrentId,
            torrent_title: torrentTitle || track.album || track.title,
          })
          .select('id')
          .single();

        if (!insertError && newMapping) {
          albumMappingId = newMapping.id;
        }
      }

      if (albumMappingId) {
        await supabase
          .from('track_file_mappings')
          .upsert(
            {
              album_mapping_id: albumMappingId,
              track_id: track.id,
              track_title: track.title,
              track_position: null,
              file_id: fileId,
              file_path: filePath || '',
              file_name: fileName || track.title,
              direct_link: directLink || null,
            },
            {
              onConflict: 'track_id',
            }
          );

        setCurrentMappedFileId(fileId);
        console.log('Saved file mapping for track:', track.title, { torrentId, fileId, hasDirectLink: !!directLink });
        // Only mark as synced if we have a direct link (i.e., stream is ready)
        // If no direct link, it's still downloading
        if (directLink) {
          addSyncedTrack(track.id);
        }
      }
    } catch (error) {
      console.error('Failed to save file mapping:', error);
      removeSyncingTrack(track.id);
    }
  }, []);

  // Try to match track from cached torrents (no network request needed)
  const matchTrackFromCache = useCallback(async (track: Track): Promise<boolean> => {
    if (!credentials?.realDebridApiKey || !track.albumId) return false;
    
    const cache = albumCacheRef.current;
    if (!cache || cache.albumId !== track.albumId || cache.torrents.length === 0) {
      return false;
    }
    
    // Cache is valid (same album) - try to find matching file
    addDebugLog('Cache album', `Uso cache esistente (${cache.torrents.length} torrent)`, 'info');
    
    for (const torrent of cache.torrents) {
      if (currentSearchTrackIdRef.current !== track.id) {
        return false;
      }
      
      if (torrent.files && torrent.files.length > 0) {
        const matchingFile = torrent.files.find((file) => {
          const matchesFileName = flexibleMatch(file.filename || '', track.title);
          const matchesPath = flexibleMatch(file.path || '', track.title);
          return matchesFileName || matchesPath;
        });
        
        if (matchingFile) {
          addDebugLog('Match da cache', `"${matchingFile.filename}" ≈ "${track.title}"`, 'success');
          
          const selectResult = await selectFilesAndPlay(
            credentials.realDebridApiKey,
            torrent.torrentId,
            [matchingFile.id]
          );
          
          if (currentSearchTrackIdRef.current !== track.id) {
            return false;
          }
          
          if (selectResult.error || selectResult.status === 'error') {
            addDebugLog('⚠️ Torrent non valido', `Errore: ${selectResult.error || 'torrent in stato error'}`, 'warning');
            // Continue to next torrent
            continue;
          }
          
          if (selectResult.streams.length > 0) {
            setAlternativeStreams(selectResult.streams);
            setCurrentStreamId(selectResult.streams[0].id);
            setDownloadProgress(null);
            setDownloadStatus(null);
            setLoadingPhase('idle');
            
            if (audioRef.current && selectResult.streams[0].streamUrl) {
              // Stop YouTube if it's playing before starting RD audio
              stopYouTubePlayback();
              audioRef.current.src = selectResult.streams[0].streamUrl;
              audioRef.current.play();
              setState((prev) => ({ ...prev, isPlaying: true }));
            }
            
            // Save with direct link
            await saveFileMapping({
              track,
              torrentId: torrent.torrentId,
              torrentTitle: torrent.title,
              fileId: matchingFile.id,
              fileName: matchingFile.filename,
              filePath: matchingFile.path,
              directLink: selectResult.streams[0].streamUrl,
            });
            
            addDebugLog('🔊 Riproduzione', 'Stream avviato da cache', 'success');
            return true;
          }
          
          if (selectResult.status === 'downloading' || selectResult.status === 'queued') {
            setLoadingPhase('downloading');
            setDownloadProgress(selectResult.progress);
            setDownloadStatus(selectResult.status);
            
            addDebugLog('📥 Download in corso', `Progresso: ${selectResult.progress}% - attesa completamento...`, 'info');
            
            // Save mapping without direct link
            await saveFileMapping({
              track,
              torrentId: torrent.torrentId,
              torrentTitle: torrent.title,
              fileId: matchingFile.id,
              fileName: matchingFile.filename,
              filePath: matchingFile.path,
            });
            
            // Set up torrent for polling so UI can track progress
            setAvailableTorrents([{
              ...torrent,
              status: selectResult.status,
              progress: selectResult.progress,
            }]);
            
            addDebugLog('💾 Mappatura salvata', 'In attesa del download RD...', 'success');
            // Don't return true yet - keep loadingPhase as downloading
            return true;
          }
          
          // If status is something unexpected, log it and try next
          if (selectResult.status && selectResult.status !== 'downloaded') {
            addDebugLog('⚠️ Stato inatteso', `Status: ${selectResult.status}`, 'warning');
            continue;
          }
        }
      }
    }
    
    return false;
  }, [credentials, saveFileMapping, addDebugLog]);

  // Search for album and try to match track within album files
  const searchAlbumAndMatch = useCallback(async (track: Track): Promise<boolean> => {
    if (!credentials?.realDebridApiKey || !track.album) return false;
    
    // Check if this search is still valid
    if (currentSearchTrackIdRef.current !== track.id) {
      console.log('Album search cancelled - track changed');
      return false;
    }
    
    addDebugLog('Ricerca album', `Cerco: "${track.album} ${track.artist}"`, 'info');
    
    try {
      const result = await searchStreams(
        credentials.realDebridApiKey,
        `${track.album} ${track.artist}`
      );
      
      // Check again after async operation
      if (currentSearchTrackIdRef.current !== track.id) {
        console.log('Album search cancelled after fetch - track changed');
        return false;
      }
      
      // Cache the results for this album
      if (track.albumId && result.torrents.length > 0) {
        albumCacheRef.current = {
          albumId: track.albumId,
          torrents: result.torrents,
          searchedAt: Date.now(),
        };
        addDebugLog('Cache salvata', `${result.torrents.length} torrent per album`, 'info');
      }
      
      setAvailableTorrents(result.torrents);
      addDebugLog('Risultati album', `Trovati ${result.torrents.length} torrent`, result.torrents.length > 0 ? 'success' : 'warning');
      
      let foundAnyMatchingFile = false;

      // Look for a torrent with files that match the track title
      for (const torrent of result.torrents) {
        // Check if search is still valid before processing each torrent
        if (currentSearchTrackIdRef.current !== track.id) {
          console.log('Album search cancelled during torrent loop - track changed');
          return false;
        }

        if (torrent.files && torrent.files.length > 0) {
          addDebugLog('Analisi torrent', `"${torrent.title}" - ${torrent.files.length} file audio`, 'info');

          // Log normalized track title for debugging
          const normalizedTrackTitle = normalizeForMatch(track.title);
          const trackWords = extractSignificantWords(track.title);
          console.log(
            `Looking for track "${track.title}" -> normalized: "${normalizedTrackTitle}", words: [${trackWords.join(', ')}]`
          );

          // Find a file that contains the track title (check both filename and path)
          const matchingFile = torrent.files.find((file) => {
            const normalizedFileName = normalizeForMatch(file.filename || '');
            const matchesFileName = flexibleMatch(file.filename || '', track.title);
            const matchesPath = flexibleMatch(file.path || '', track.title);
            const matches = matchesFileName || matchesPath;

            console.log(
              `  Checking file "${file.filename}" -> normalized: "${normalizedFileName}" -> match: ${matches}`
            );

            if (matches) {
              addDebugLog('Match trovato', `"${file.filename}" ≈ "${track.title}"`, 'success');
            }
            return matches;
          });

          if (matchingFile) {
            foundAnyMatchingFile = true;
            addDebugLog('File trovato', `Match: "${matchingFile.filename}"`, 'success');

            // Select this file and play it (or start cloud caching)
            const selectResult = await selectFilesAndPlay(
              credentials.realDebridApiKey,
              torrent.torrentId,
              [matchingFile.id]
            );

            // Check if search is still valid after async operation
            if (currentSearchTrackIdRef.current !== track.id) {
              console.log('Album search cancelled after file select - track changed');
              return false;
            }

            // Check for errors
            if (selectResult.error || selectResult.status === 'error') {
              addDebugLog('Errore selezione file', selectResult.error || 'Errore sconosciuto', 'error');
              continue; // Try next torrent
            }

            // IMPORTANT: save mapping as soon as we successfully selected a specific file
            // Even if the torrent is still downloading/queued, we want the mapping to be shared across devices.

            if (selectResult.streams.length > 0) {
              setAlternativeStreams(selectResult.streams);
              setCurrentStreamId(selectResult.streams[0].id);
              setDownloadProgress(null);
              setDownloadStatus(null);
              setLoadingPhase('idle');

              if (audioRef.current && selectResult.streams[0].streamUrl) {
                // Stop YouTube if it's playing before starting RD audio
                stopYouTubePlayback();
                audioRef.current.src = selectResult.streams[0].streamUrl;
                audioRef.current.play();
                setState((prev) => ({ ...prev, isPlaying: true }));
              }

              // Save with direct link for instant playback next time
              await saveFileMapping({
                track,
                torrentId: torrent.torrentId,
                torrentTitle: torrent.title,
                fileId: matchingFile.id,
                fileName: matchingFile.filename,
                filePath: matchingFile.path,
                directLink: selectResult.streams[0].streamUrl,
              });

              addDebugLog('Riproduzione', 'Stream avviato e mappatura salvata', 'success');
              return true;
            }

            if (selectResult.status === 'downloading' || selectResult.status === 'queued') {
              setLoadingPhase('downloading');
              setDownloadProgress(selectResult.progress);
              setDownloadStatus(selectResult.status);
              
              // Save mapping without direct link (will be updated when download completes)
              await saveFileMapping({
                track,
                torrentId: torrent.torrentId,
                torrentTitle: torrent.title,
                fileId: matchingFile.id,
                fileName: matchingFile.filename,
                filePath: matchingFile.path,
              });
              
              addDebugLog('☁️ RD Download', `Progresso: ${selectResult.progress}% - RD sta scaricando...`, 'info');
              
              // Set up torrent for polling
              setAvailableTorrents([{
                ...torrent,
                status: selectResult.status,
                progress: selectResult.progress,
              }]);
              addDebugLog('⏳ Attesa RD', 'Attendo completamento download Real-Debrid...', 'info');

              // We found the correct file and started caching: DO NOT show "Match manuale richiesto".
              // Returning true stops the loop and avoids misleading UI.
              return true;
            }

            addDebugLog('Stato torrent', `Stato: ${selectResult.status}, nessuno stream pronto`, 'warning');
          } else {
            // Log all file names for debugging
            const fileNames = torrent.files.map((f) => f.filename).join(', ');
            addDebugLog('Nessun match', `Cercavo "${track.title}" in: ${fileNames.substring(0, 200)}...`, 'warning');
          }
        }
      }

      // If we found a matching file but never got a valid select result, don't claim manual match
      if (foundAnyMatchingFile) {
        removeSyncingTrack(track.id);
        return false;
      }

      // If no file match found but we have torrents, just return false
      // Don't show toast here - let the calling code decide after all attempts
      if (result.torrents.length > 0) {
        addDebugLog('Match manuale richiesto', `Nessun file corrisponde a "${track.title}" (query usata: "${track.album} ${track.artist}")`, 'warning');
        removeSyncingTrack(track.id);
        return false;
      }
      
      removeSyncingTrack(track.id);
      return false;
    } catch (error) {
      addDebugLog('Errore ricerca album', error instanceof Error ? error.message : 'Errore sconosciuto', 'error');
      return false;
    }
  }, [credentials, saveFileMapping, addDebugLog]);

  const searchForStreams = useCallback(async (
    query: string,
    showNoResultsToast = false,
    track?: Track,
    clearLogs: boolean = true
  ) => {
    // If no Real-Debrid API key, go straight to YouTube fallback
    if (!credentials?.realDebridApiKey) {
      addDebugLog('⚠️ Real-Debrid non configurato', 'Uso YouTube come sorgente', 'warning');
      
      if (track) {
        const youtubeQuery = `${track.artist} ${track.title}`;
        setLastSearchQuery(youtubeQuery);
        setLoadingPhase('searching');
        addDebugLog('🔍 Ricerca YouTube', youtubeQuery, 'info');
        
        try {
          const videos = await searchYouTube(youtubeQuery);
          
          if (videos.length > 0) {
            setYoutubeResults(videos);
            const selectedVideo = videos[0];
            addDebugLog('▶️ Auto-play YouTube', selectedVideo.title, 'success');
            
            // Stop any existing audio
            if (audioRef.current) {
              audioRef.current.pause();
              audioRef.current.src = '';
            }
            
            // Play YouTube audio using direct extraction
            const success = await playYouTubeAudioById(selectedVideo.id, selectedVideo.title);
            if (!success) {
              addDebugLog('❌ YouTube fallback fallito', 'Impossibile riprodurre audio', 'error');
            }
            setIsSearchingStreams(false);
            
            // Save the YouTube mapping for future use
            try {
              await supabase
                .from('youtube_track_mappings')
                .upsert({
                  track_id: track.id,
                  video_id: selectedVideo.id,
                  video_title: selectedVideo.title,
                  video_duration: selectedVideo.duration,
                  uploader_name: selectedVideo.uploaderName,
                }, { onConflict: 'track_id' });
              invalidateYouTubeMappingCache(track.id);
              addDebugLog('💾 Salvato', 'Sorgente YouTube salvata', 'success');
            } catch (saveError) {
              console.error('Failed to save YouTube mapping:', saveError);
            }
          } else {
            setYoutubeResults([]);
            addDebugLog('❌ Nessun risultato', 'Nessun video YouTube trovato', 'error');
            setLoadingPhase('idle');
            setIsSearchingStreams(false);
            if (showNoResultsToast) {
              toast.error('Nessun contenuto trovato');
            }
          }
        } catch (error) {
          addDebugLog('❌ Errore YouTube', error instanceof Error ? error.message : 'Errore', 'error');
          setLoadingPhase('idle');
          setIsSearchingStreams(false);
        }
      }
      return;
    }
    
    // Store the track ID we're searching for
    const searchTrackId = track?.id || null;
    
    if (clearLogs) {
      clearDebugLogs();
    }
    setIsSearchingStreams(true);
    setLoadingPhase('searching');
    setAlternativeStreams([]);
    setAvailableTorrents([]);
    setDownloadProgress(null);
    setDownloadStatus(null);
    setYoutubeResults([]);
    setLastSearchQuery(query);
    
    addDebugLog('🔎 Ricerca torrent', `Query: "${query}"`, 'info');
    addDebugLog('⏳ Connessione', 'Contatto fonti torrent (TPB, 1337x, etc.)...', 'info');
    
    try {
      const result = await searchStreams(
        credentials.realDebridApiKey,
        query
      );
      
      // Check if this search is still valid
      if (searchTrackId && currentSearchTrackIdRef.current !== searchTrackId) {
        console.log('Search cancelled - track changed during search');
        return;
      }
      
      setAvailableTorrents(result.torrents);
      const streamCount = result.streams?.length || 0;
      const torrentCount = result.torrents.length;
      addDebugLog('📊 Risultati ricerca', `Stream pronti: ${streamCount}, Torrent trovati: ${torrentCount}`, 
        streamCount > 0 ? 'success' : (torrentCount > 0 ? 'info' : 'warning'));
      
      // If any torrent has ready streams (cached), get them
      if (result.streams && result.streams.length > 0) {
        setAlternativeStreams(result.streams);
        addDebugLog('✅ Stream già in cache RD', `${result.streams.length} stream pronti (già scaricati in precedenza)`, 'success');
        
        // Auto-select first stream if there's only 1 or few results
        if (result.streams.length >= 1) {
          const selectedStream = result.streams[0];
          setCurrentStreamId(selectedStream.id);
          
          // Final check before playing
          if (searchTrackId && currentSearchTrackIdRef.current !== searchTrackId) {
            console.log('Search cancelled before playback - track changed');
            return;
          }
          
          if (audioRef.current && selectedStream.streamUrl) {
            // Stop YouTube if it's playing before starting RD audio
            stopYouTubePlayback();
            audioRef.current.src = selectedStream.streamUrl;
            audioRef.current.play();
            setState(prev => ({ ...prev, isPlaying: true }));
            addDebugLog('🔊 Riproduzione da cache', `"${selectedStream.title}"`, 'success');
          }
          
          // Non auto-salvare qui: gli stream "cached" non includono fileId affidabile.
          // La mappatura viene salvata solo quando scegliamo un file specifico (selectTorrentFile / match su file).

        }
      } else if ((!result.streams || result.streams.length === 0) && result.torrents.length === 0) {
        // No results for track title, try searching for the album
        addDebugLog('⚠️ Nessun torrent trovato', 'La ricerca non ha prodotto risultati', 'warning');
        addDebugLog('🔄 Tentativo alternativo', 'Provo ricerca per nome album...', 'info');
        
        let foundInAlbum = false;
        if (track && track.album) {
          foundInAlbum = await searchAlbumAndMatch(track);
          
          // Check if search is still valid
          if (searchTrackId && currentSearchTrackIdRef.current !== searchTrackId) {
            console.log('Search cancelled after album search - track changed');
            return;
          }
        }
        
        // If album search also failed, try YouTube fallback
        if (!foundInAlbum && track) {
          const youtubeQuery = `${track.artist} ${track.title}`;
          setLastSearchQuery(youtubeQuery);
          addDebugLog('🔍 Fallback YouTube', `Cerco: ${youtubeQuery}`, 'info');
          
          const videos = await searchYouTube(youtubeQuery);
          
          if (videos.length > 0) {
            setYoutubeResults(videos);
            addDebugLog('📺 YouTube trovato', `${videos.length} video disponibili`, 'success');
            
            // Auto-play first YouTube result
            const selectedVideo = videos[0];
            addDebugLog('▶️ Auto-play YouTube', selectedVideo.title, 'info');
            
            // Stop any existing audio
            if (audioRef.current) {
              audioRef.current.pause();
              audioRef.current.src = '';
            }
            // Play YouTube audio using direct extraction
            await playYouTubeAudioById(selectedVideo.id, selectedVideo.title);
            
            // Save the YouTube mapping for future use
            try {
              await supabase
                .from('youtube_track_mappings')
                .upsert({
                  track_id: track.id,
                  video_id: selectedVideo.id,
                  video_title: selectedVideo.title,
                  video_duration: selectedVideo.duration,
                  uploader_name: selectedVideo.uploaderName,
                }, { onConflict: 'track_id' });
              invalidateYouTubeMappingCache(track.id);
              addDebugLog('💾 Salvato', 'Sorgente YouTube salvata per riutilizzo futuro', 'success');
            } catch (saveError) {
              console.error('Failed to save YouTube mapping:', saveError);
            }
            
            removeSyncingTrack(track.id);
          } else {
            setYoutubeResults([]);
            addDebugLog('Nessun risultato', 'Nessuna sorgente trovata (torrent e YouTube)', 'error');
            removeSyncingTrack(track.id);
            if (showNoResultsToast) {
              toast.error('Nessun contenuto trovato', {
                description: 'Non è stato trovato nessun risultato per questa traccia.',
              });
            }
          }
        } else if (!track && showNoResultsToast) {
          toast.error('Nessun contenuto trovato', {
            description: 'Non è stato trovato nessun risultato per questa traccia.',
          });
        }
      } else if (result.torrents.length > 0 && (!result.streams || result.streams.length === 0)) {
        addDebugLog('📦 Torrent trovati', `${result.torrents.length} torrent da analizzare (non ancora in cache RD)`, 'info');
        
        let playbackStarted = false;
        
        // Try to auto-select if there's a torrent with a matching file
        if (track) {
          for (const torrent of result.torrents) {
            // Check if search is still valid before processing each torrent
            if (searchTrackId && currentSearchTrackIdRef.current !== searchTrackId) {
              console.log('Search cancelled during torrent processing - track changed');
              return;
            }
            
            if (torrent.files && torrent.files.length > 0) {
              addDebugLog('📂 Analisi torrent', `"${torrent.title.substring(0, 50)}..." - ${torrent.files.length} file audio`, 'info');
              
              // Find a file that matches the track title using flexible matching
              const matchingFile = torrent.files.find(file => {
                const matchesFileName = flexibleMatch(file.filename || '', track.title);
                const matchesPath = flexibleMatch(file.path || '', track.title);
                const matches = matchesFileName || matchesPath;
                if (matches) {
                  addDebugLog('🎯 Match automatico', `"${file.filename}" ≈ "${track.title}"`, 'success');
                }
                return matches;
              });
              
              // Or if there's only one file, use it
              const fileToUse = matchingFile || (torrent.files.length === 1 ? torrent.files[0] : null);
              
              if (fileToUse) {
                addDebugLog('📄 File selezionato', `"${fileToUse.filename}" (ID: ${fileToUse.id})`, 'success');
                addDebugLog('☁️ Invio a Real-Debrid', 'Richiesta download/streaming...', 'info');
                
                const selectResult = await selectFilesAndPlay(
                  credentials!.realDebridApiKey,
                  torrent.torrentId,
                  [fileToUse.id]
                );
                
                // Check if search is still valid after async operation
                if (searchTrackId && currentSearchTrackIdRef.current !== searchTrackId) {
                  console.log('Search cancelled after file selection - track changed');
                  return;
                }
                
                if (selectResult.error || selectResult.status === 'error') {
                  addDebugLog('Errore selezione', selectResult.error || 'Errore sconosciuto', 'error');
                  continue;
                }
                
                if (selectResult.streams.length > 0) {
                  const streamUrl = selectResult.streams[0].streamUrl;
                  addDebugLog('⚡ Riproduzione istantanea', streamUrl.substring(0, 80) + '...', 'success');
                  setAlternativeStreams(selectResult.streams);
                  setCurrentStreamId(selectResult.streams[0].id);
                  
                  if (audioRef.current && streamUrl) {
                    audioRef.current.src = streamUrl;
                    audioRef.current.play();
                    setState(prev => ({ ...prev, isPlaying: true }));
                  }
                  
                  addDebugLog('💾 Salvataggio mappatura', 'Memorizzo associazione traccia-file per prossimi ascolti', 'info');
                  await saveFileMapping({
                    track,
                    torrentId: torrent.torrentId,
                    torrentTitle: torrent.title,
                    fileId: fileToUse.id,
                    fileName: fileToUse.filename,
                    filePath: fileToUse.path,
                    directLink: selectResult.streams[0].streamUrl,
                  });
                  addDebugLog('✅ Completato', 'Stream avviato, mappatura salvata (link valido 29 giorni)', 'success');
                  setLoadingPhase('idle');
                  playbackStarted = true;
                  break;
                } else if (selectResult.status === 'downloading' || selectResult.status === 'queued') {
                  addDebugLog('📥 RD: Download iniziato', `Il file non era in cache - Real-Debrid sta scaricando (${selectResult.progress}%)`, 'info');
                  addDebugLog('⏳ Tempo stimato', 'Il download può richiedere 4-20 secondi...', 'warning');
                  setLoadingPhase('downloading');
                  setDownloadProgress(selectResult.progress);
                  setDownloadStatus(selectResult.status);
                  playbackStarted = true; // Consider download as "started"
                  break;
                }
              }
            }
          }
          
          // If no file matched or playback didn't start, try album search
          if (!playbackStarted && track.album) {
            // Check if search is still valid
            if (searchTrackId && currentSearchTrackIdRef.current !== searchTrackId) {
              console.log('Search cancelled before album fallback - track changed');
              return;
            }
            
            addDebugLog('Nessun match nei torrent', 'Provo ricerca per album...', 'warning');
            const foundInAlbum = await searchAlbumAndMatch(track);
            
            // Check if search is still valid
            if (searchTrackId && currentSearchTrackIdRef.current !== searchTrackId) {
              console.log('Search cancelled after album fallback - track changed');
              return;
            }
            
            if (!foundInAlbum && showNoResultsToast) {
              // Check if we at least have torrents to show for manual selection
              if (availableTorrents.length > 0) {
                addDebugLog('Match manuale richiesto', 'Nessun match automatico trovato, selezione manuale disponibile', 'warning');
                toast.warning('Selezione manuale richiesta', {
                  description: 'Non ho trovato un match automatico. Apri il pannello sorgenti per selezionare il file manualmente.',
                  duration: 5000,
                });
              } else {
                // No torrent found - try YouTube fallback
                const youtubeQuery = track ? `${track.artist} ${track.title}` : query;
                setLastSearchQuery(youtubeQuery);
                addDebugLog('🔍 Fallback YouTube', `Cerco: ${youtubeQuery}`, 'info');
                
                const videos = await searchYouTube(youtubeQuery);
                
                if (videos.length > 0) {
                  setYoutubeResults(videos);
                  addDebugLog('📺 YouTube trovato', `${videos.length} video disponibili`, 'success');
                  
                  // Auto-play first YouTube result using hidden player
                  const selectedVideo = videos[0];
                  addDebugLog('▶️ Auto-play YouTube', selectedVideo.title, 'info');
                  
                  // Stop any existing audio
                  if (audioRef.current) {
                    audioRef.current.pause();
                    audioRef.current.src = '';
                  }
                  
                  // Play YouTube audio using direct extraction
                  await playYouTubeAudioById(selectedVideo.id, selectedVideo.title);
                  
                  // Save the YouTube mapping for future use
                  try {
                    await supabase
                      .from('youtube_track_mappings')
                      .upsert({
                        track_id: track.id,
                        video_id: selectedVideo.id,
                        video_title: selectedVideo.title,
                        video_duration: selectedVideo.duration,
                        uploader_name: selectedVideo.uploaderName,
                      }, { onConflict: 'track_id' });
                    invalidateYouTubeMappingCache(track.id);
                    addDebugLog('💾 Salvato', 'Sorgente YouTube salvata per riutilizzo futuro', 'success');
                  } catch (saveError) {
                    console.error('Failed to save YouTube mapping:', saveError);
                  }
                  
                  removeSyncingTrack(track.id);
                } else {
                  setYoutubeResults([]);
                  addDebugLog('Nessun risultato', 'Nessuna sorgente trovata (torrent e YouTube)', 'error');
                  removeSyncingTrack(track.id);
                  toast.error('Nessun contenuto trovato', {
                    description: 'Non è stato trovato nessun risultato per questa traccia.',
                  });
                }
              }
            }
          }
        }
      }
    } catch (error) {
      addDebugLog('Errore ricerca', error instanceof Error ? error.message : 'Errore sconosciuto', 'error');
      if (track) {
        removeSyncingTrack(track.id);
      }
      if (showNoResultsToast) {
        toast.error('Errore nella ricerca', {
          description: 'Si è verificato un errore durante la ricerca.',
        });
      }
    } finally {
      // Only update searching state if this is still the current search
      if (!searchTrackId || currentSearchTrackIdRef.current === searchTrackId) {
        setIsSearchingStreams(false);
        // DON'T reset loadingPhase here if we're downloading - let the polling handle it
        // Only reset if not in downloading phase
        if (loadingPhase !== 'downloading') {
          setLoadingPhase('idle');
        }
      }
    }
  }, [credentials, saveFileMapping, searchAlbumAndMatch, addDebugLog, clearDebugLogs, loadingPhase]);

  const selectTorrentFile = useCallback(async (torrentId: string, fileIds: number[]) => {
    if (!credentials?.realDebridApiKey) return;

    const fileId = fileIds[0];

    // Optimistic UI: immediately mark the chosen file as the current mapping
    if (Number.isFinite(fileId)) {
      setCurrentMappedFileId(fileId);
      setAvailableTorrents(prev => prev.map(t => {
        if (t.torrentId !== torrentId) return t;
        return {
          ...t,
          files: (t.files || []).map(f => ({ ...f, selected: f.id === fileId })),
        };
      }));
    }

    // Stop current playback and clear previous streams so we don't keep playing the old file
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    setAlternativeStreams([]);
    setCurrentStreamId(undefined);

    addDebugLog('Selezione file', `Torrent: ${torrentId}, File ID: ${fileId}`, 'info');

    try {
      const result = await selectFilesAndPlay(credentials.realDebridApiKey, torrentId, fileIds);

      if (result.streams.length > 0) {
        // Replace streams and auto-play first one
        setAlternativeStreams(result.streams);
        setCurrentStreamId(result.streams[0].id);
        setDownloadProgress(null);
        setDownloadStatus(null);
        setLoadingPhase('idle');

        if (audioRef.current && result.streams[0].streamUrl) {
          audioRef.current.src = result.streams[0].streamUrl;
          audioRef.current.play();
          setState(prev => ({ ...prev, isPlaying: true }));
        }

        // Persist mapping using the **fileId** (not stream.id) - include direct link
        const currentTrack = state.currentTrack;
        const torrent = availableTorrents.find(t => t.torrentId === torrentId);
        const file = torrent?.files?.find(f => f.id === fileId);

        if (currentTrack && fileId !== undefined) {
          await saveFileMapping({
            track: currentTrack,
            torrentId,
            torrentTitle: torrent?.title,
            fileId,
            fileName: file?.filename,
            filePath: file?.path,
            directLink: result.streams[0].streamUrl,
          });
        }

        addDebugLog('Riproduzione', `Stream pronto: ${result.streams[0].title}`, 'success');
      } else if (result.status === 'downloading' || result.status === 'queued' || result.status === 'magnet_conversion') {
        // Update torrent status in the list
        setLoadingPhase('downloading');
        setAvailableTorrents(prev => prev.map(t =>
          t.torrentId === torrentId
            ? { ...t, status: result.status, progress: result.progress }
            : t
        ));
        setDownloadProgress(result.progress);
        setDownloadStatus(result.status);
        addDebugLog('Salvataggio', 'Salvataggio in cloud', 'success');
      }
    } catch (error) {
      addDebugLog('Errore selezione', error instanceof Error ? error.message : 'Errore sconosciuto', 'error');
    }
  }, [credentials, addDebugLog, state.currentTrack, availableTorrents, saveFileMapping]);

  const refreshTorrent = useCallback(async (torrentId: string) => {
    if (!credentials?.realDebridApiKey) return;
    
    try {
      const result = await checkTorrentStatus(credentials.realDebridApiKey, torrentId);
      
      // Handle error state
      if (result.status === 'error' || result.status === 'dead' || result.status === 'magnet_error') {
        addDebugLog('❌ Torrent non valido', `Stato: ${result.status} - il torrent non è disponibile`, 'error');
        setAvailableTorrents(prev => prev.map(t => 
          t.torrentId === torrentId 
            ? { ...t, status: result.status, progress: 0 }
            : t
        ));
        // Clear downloading state for this torrent
        if (downloadStatus && availableTorrents.find(t => t.torrentId === torrentId)) {
          setDownloadProgress(null);
          setDownloadStatus(null);
          setLoadingPhase('idle');
        }
        return;
      }
      
      // Update torrent in list
      setAvailableTorrents(prev => prev.map(t => 
        t.torrentId === torrentId 
          ? { ...t, status: result.status, progress: result.progress, files: result.files.length > 0 ? result.files : t.files }
          : t
      ));
      
      // Update global download progress
      if (result.status === 'downloading' || result.status === 'queued') {
        setDownloadProgress(result.progress);
        setDownloadStatus(result.status);
        addDebugLog('📥 Download', `Progresso: ${result.progress}%`, 'info');
      }
      
      if (result.streams.length > 0) {
        // Replace streams completely to avoid duplicates - use Set to dedupe by stream URL
        setAlternativeStreams(prev => {
          const allStreams = [...result.streams, ...prev];
          const seen = new Map<string, StreamResult>();
          allStreams.forEach(s => {
            if (!seen.has(s.streamUrl)) {
              seen.set(s.streamUrl, s);
            }
          });
          return Array.from(seen.values());
        });
        
        setDownloadProgress(null);
        setDownloadStatus(null);
        setLoadingPhase('idle');
        
        // Auto-play if nothing is playing
        if (!currentStreamId && result.streams.length > 0) {
          const streamUrl = result.streams[0].streamUrl;
          setCurrentStreamId(result.streams[0].id);
          if (audioRef.current && streamUrl) {
            audioRef.current.src = streamUrl;
            audioRef.current.play();
            setState(prev => ({ ...prev, isPlaying: true }));
            addDebugLog('⚡ Riproduzione istantanea', streamUrl.substring(0, 80) + '...', 'success');
          }
        } else {
          addDebugLog('✅ Download completato', 'Stream pronti per la riproduzione', 'success');
        }
      }
    } catch (error) {
      addDebugLog('Errore refresh', error instanceof Error ? error.message : 'Errore sconosciuto', 'error');
    }
  }, [credentials, currentStreamId, addDebugLog, downloadStatus, availableTorrents]);

  const manualSearch = useCallback(async (query: string) => {
    setYoutubeResults([]); // Clear YouTube results on new search
    await searchForStreams(query, true, undefined, true);
  }, [searchForStreams]);

  // Save YouTube mapping to database
  const saveYouTubeMapping = useCallback(async (trackId: string, video: YouTubeVideo) => {
    try {
      await supabase
        .from('youtube_track_mappings')
        .upsert({
          track_id: trackId,
          video_id: video.id,
          video_title: video.title,
          video_duration: video.duration,
          uploader_name: video.uploaderName,
        }, { onConflict: 'track_id' });
      
      // Invalidate cache so UI updates
      invalidateYouTubeMappingCache(trackId);
      
      console.log('Saved YouTube mapping:', trackId, video.id);
    } catch (error) {
      console.error('Failed to save YouTube mapping:', error);
    }
  }, []);

  // Play audio from YouTube video using direct audio stream
  const playYouTubeVideo = useCallback(async (video: YouTubeVideo) => {
    const track = state.currentTrack;
    
    addDebugLog('🎬 YouTube selezionato', video.title, 'info');
    
    // Use the helper function for actual playback
    const success = await playYouTubeAudioById(video.id, video.title);
    
    if (success) {
      addDebugLog('▶️ Riproduzione YouTube', video.title, 'success');
      
      // Save the YouTube mapping for this track
      if (track) {
        saveYouTubeMapping(track.id, video);
        addDebugLog('💾 Salvato', 'Sorgente YouTube salvata', 'success');
      }
      
      // Clear YouTube results after selection
      setYoutubeResults([]);
    } else {
      addDebugLog('❌ Errore YouTube', 'Impossibile riprodurre audio', 'error');
      toast.error('Audio YouTube non disponibile');
    }
  }, [addDebugLog, state.currentTrack, saveYouTubeMapping, playYouTubeAudioById]);

  // Search YouTube manually with current query
  const searchYouTubeManually = useCallback(async () => {
    if (!lastSearchQuery) {
      toast.error('Nessuna ricerca attiva');
      return;
    }
    
    addDebugLog('🔍 Ricerca YouTube manuale', lastSearchQuery, 'info');
    
    try {
      const videos = await searchYouTube(lastSearchQuery);
      
      if (videos.length > 0) {
        setYoutubeResults(videos);
        addDebugLog('📺 YouTube trovato', `${videos.length} video disponibili`, 'success');
      } else {
        addDebugLog('❌ Nessun risultato YouTube', 'Nessun video trovato', 'warning');
        toast.warning('Nessun risultato YouTube');
      }
    } catch (error) {
      addDebugLog('❌ Errore YouTube', error instanceof Error ? error.message : 'Errore', 'error');
    }
  }, [lastSearchQuery, addDebugLog]);

  // Load saved mapping to show in BugsModal for editing
  const loadSavedMapping = useCallback(async () => {
    const track = state.currentTrack;
    if (!track) {
      addDebugLog('⚠️ Nessuna traccia', 'Nessuna traccia in riproduzione', 'warning');
      return;
    }
    
    // First, show what source is currently being used
    if (isPlayingYouTube) {
      addDebugLog('📺 Sorgente attuale', `YouTube: ${currentYouTubeVideoId}`, 'info');
    } else if (currentStreamId) {
      addDebugLog('📀 Sorgente attuale', 'Real-Debrid stream', 'info');
    }
    
    // Check for YouTube mapping
    try {
      const { data: youtubeMapping } = await supabase
        .from('youtube_track_mappings')
        .select('video_title, video_id')
        .eq('track_id', track.id)
        .maybeSingle();
      
      if (youtubeMapping) {
        addDebugLog('🎬 YouTube salvato', youtubeMapping.video_title, 'success');
      }
    } catch (e) {
      console.error('Error checking YouTube mapping:', e);
    }
    
    // Check for RD mapping
    if (!credentials?.realDebridApiKey) {
      addDebugLog('⚠️ Real-Debrid', 'API key non configurata', 'warning');
      return;
    }
    
    if (!track.albumId) {
      addDebugLog('⚠️ Album ID mancante', 'Impossibile cercare mappature RD', 'warning');
      return;
    }
    
    try {
      const { data: trackMapping } = await supabase
        .from('track_file_mappings')
        .select('*, album_torrent_mappings!inner(*)')
        .eq('track_id', track.id)
        .maybeSingle();
      
      if (trackMapping) {
        console.log('Loading saved mapping for editing:', trackMapping);
        
        const torrentId = trackMapping.album_torrent_mappings.torrent_id;
        const fileId = trackMapping.file_id;
        
        setCurrentMappedFileId(fileId);
        addDebugLog('📀 RD salvato', `File: ${trackMapping.file_name}`, 'success');
        
        // Get torrent info with all files
        const result = await checkTorrentStatus(credentials.realDebridApiKey, torrentId);
        
        if (result.files.length > 0 || result.streams.length > 0) {
          // Mark the currently mapped file as selected
          const filesWithSelection = result.files.map(f => ({
            ...f,
            selected: f.id === fileId
          }));
          
          setAvailableTorrents([{
            torrentId,
            title: trackMapping.album_torrent_mappings.torrent_title,
            size: 'Unknown',
            source: 'Salvato',
            seeders: 0,
            status: result.status,
            progress: result.progress,
            files: filesWithSelection,
            hasLinks: result.streams.length > 0,
          }]);
          
          if (result.streams.length > 0) {
            setAlternativeStreams(result.streams);
            addDebugLog('✅ Stream RD pronto', `${result.streams.length} stream disponibili`, 'success');
          } else if (result.status === 'downloading') {
            addDebugLog('📥 RD in download', `Progresso: ${result.progress}%`, 'info');
          }
        }
      } else {
        setCurrentMappedFileId(undefined);
        addDebugLog('ℹ️ Nessuna mappatura RD', 'Questa traccia non ha ancora una sorgente RD salvata', 'info');
        
        // Check if there's an album mapping we could use
        const { data: albumMapping } = await supabase
          .from('album_torrent_mappings')
          .select('torrent_title')
          .eq('album_id', track.albumId)
          .maybeSingle();
        
        if (albumMapping) {
          addDebugLog('📦 Album RD trovato', `Torrent: ${albumMapping.torrent_title}`, 'info');
          addDebugLog('💡 Suggerimento', 'Cerca manualmente per trovare il file corrispondente', 'info');
        }
      }
    } catch (error) {
      console.error('Failed to load saved mapping:', error);
      addDebugLog('❌ Errore caricamento', error instanceof Error ? error.message : 'Errore sconosciuto', 'error');
    }
  }, [state.currentTrack, credentials, addDebugLog, isPlayingYouTube, currentYouTubeVideoId, currentStreamId]);

  // Try to unlock iOS/Safari audio *during the user's tap* that starts playback.
  // This makes the first YouTube play far more reliable because the later async load happens
  // after the session is already unlocked.
  const tryUnlockAudioFromUserGesture = useCallback(() => {
    // Use the robust iOS audio session unlock
    iosAudio.quickUnlock();
    iosAudio.keepAlive();
    iosAudio.addLog('info', 'playTrack: quickUnlock called');
  }, [iosAudio]);

  const playTrack = useCallback(async (track: Track, queue?: Track[]) => {
    // IMPORTANT: call this synchronously at the beginning of the tap-triggered flow
    // to maximize iOS autoplay success.
    tryUnlockAudioFromUserGesture();

    // Stop any existing audio and cancel pending searches
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }

    // Set the new track ID for search cancellation
    currentSearchTrackIdRef.current = track.id;

    setState(prev => ({
      ...prev,
      currentTrack: track,
      isPlaying: true,
      queue: queue || [track],
      queueIndex: queue ? queue.findIndex(t => t.id === track.id) : 0,
      duration: track.duration,
      progress: 0,
    }));

    // Clear previous state
    clearDebugLogs();
    setAlternativeStreams([]);
    setAvailableTorrents([]);
    setCurrentStreamId(undefined);
    setDownloadProgress(null);
    setDownloadStatus(null);
    setLoadingPhase('idle');
    setCurrentYouTubeVideoId(null);
    setIsPlayingYouTube(false);
    setUseYouTubeIframe(false);

    const isYouTubeOnlyMode = audioSourceMode === 'youtube_only';
    const hasRdKey = !!credentials?.realDebridApiKey;

    // Fast path: if we already have a cached YouTube mapping AND we're in YouTube-only mode,
    // start YouTube immediately. This avoids losing the "user gesture" to async database reads on iOS.
    // For RD mode, we first check if RD is available before falling back to YouTube.
    let usedYouTubeCache = false;
    if (isYouTubeOnlyMode) {
      try {
        const cached = localStorage.getItem(`youtube_mapping_${track.id}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed?.video_id) {
            addDebugLog('⚡ YouTube cache', parsed.video_title || parsed.video_id, 'info');
            // Do not await: keep it as immediate as possible.
            playYouTubeAudioById(parsed.video_id, parsed.video_title);
            usedYouTubeCache = true;
          }
        }
      } catch {
        // ignore cache errors
      }
    }

    addDebugLog('🎵 Inizio riproduzione', `"${track.title}" di ${track.artist}`, 'info');
    addDebugLog('⚙️ Modalità', isYouTubeOnlyMode ? 'Solo YouTube' : 'Real-Debrid + YouTube', 'info');

    // Save to recently played
    const saveRecentlyPlayed = () => {
      const recent = JSON.parse(localStorage.getItem('recentlyPlayed') || '[]');
      const filtered = recent.filter((t: Track) => t.id !== track.id);
      const updated = [track, ...filtered].slice(0, 20);
      localStorage.setItem('recentlyPlayed', JSON.stringify(updated));
    };

    // Helper: Play YouTube and save mapping
    const playAndSaveYouTube = async (video: YouTubeVideo) => {
      addDebugLog('▶️ Riproduzione YouTube', video.title, 'success');
      await playYouTubeAudioById(video.id, video.title);

      // Cache mapping locally for instant next-time playback (iOS gesture-safe)
      try {
        localStorage.setItem(
          `youtube_mapping_${track.id}`,
          JSON.stringify({
            video_id: video.id,
            video_title: video.title,
            video_duration: video.duration,
            uploader_name: video.uploaderName,
          })
        );
      } catch {
        // ignore
      }
      // Save the YouTube mapping for future use
      try {
        await supabase
          .from('youtube_track_mappings')
          .upsert({
            track_id: track.id,
            video_id: video.id,
            video_title: video.title,
            video_duration: video.duration,
            uploader_name: video.uploaderName,
          }, { onConflict: 'track_id' });
        invalidateYouTubeMappingCache(track.id);
        addDebugLog('💾 YouTube salvato', 'Sorgente memorizzata per riutilizzo', 'success');
      } catch (saveError) {
        console.error('Failed to save YouTube mapping:', saveError);
      }
    };

    // Helper: Search torrent in background and save for next time
    const syncTorrentInBackground = async () => {
      if (!hasRdKey || !track.album) return;
      
      addDebugLog('🔍 Ricerca torrent', `Background sync per "${track.album}"`, 'info');
      addSyncingTrack(track.id);
      
      try {
        // First try cache
        const cache = albumCacheRef.current;
        if (cache && cache.albumId === track.albumId && cache.torrents.length > 0) {
          for (const torrent of cache.torrents) {
            if (torrent.files && torrent.files.length > 0) {
              const matchingFile = torrent.files.find(file => 
                flexibleMatch(file.filename || '', track.title) || 
                flexibleMatch(file.path || '', track.title)
              );
              
              if (matchingFile) {
                addDebugLog('🎯 Match in cache', matchingFile.filename || '', 'success');
                const result = await selectFilesAndPlay(credentials!.realDebridApiKey, torrent.torrentId, [matchingFile.id]);
                
                if (!result.error && result.status !== 'error') {
                  const directLink = result.streams.length > 0 ? result.streams[0].streamUrl : undefined;
                  await saveFileMapping({
                    track,
                    torrentId: torrent.torrentId,
                    torrentTitle: torrent.title,
                    fileId: matchingFile.id,
                    fileName: matchingFile.filename,
                    filePath: matchingFile.path,
                    directLink,
                  });
                  addDebugLog('✅ Torrent sincronizzato', 'Pronto per la prossima riproduzione', 'success');
                  removeSyncingTrack(track.id);
                  addSyncedTrack(track.id);
                  return;
                }
              }
            }
          }
        }
        
        // Search for album torrents
        const result = await searchStreams(credentials!.realDebridApiKey, `${track.album} ${track.artist}`);
        
        if (result.torrents.length > 0) {
          // Update cache
          if (track.albumId) {
            albumCacheRef.current = {
              albumId: track.albumId,
              torrents: result.torrents,
              searchedAt: Date.now(),
            };
          }
          
          addDebugLog('📦 Torrent trovati', `${result.torrents.length} risultati`, 'info');
          
          for (const torrent of result.torrents) {
            if (torrent.files && torrent.files.length > 0) {
              const matchingFile = torrent.files.find(file => 
                flexibleMatch(file.filename || '', track.title) || 
                flexibleMatch(file.path || '', track.title)
              );
              
              if (matchingFile) {
                addDebugLog('🎯 Match trovato', matchingFile.filename || '', 'success');
                const selectResult = await selectFilesAndPlay(credentials!.realDebridApiKey, torrent.torrentId, [matchingFile.id]);
                
                if (!selectResult.error && selectResult.status !== 'error') {
                  const directLink = selectResult.streams.length > 0 ? selectResult.streams[0].streamUrl : undefined;
                  await saveFileMapping({
                    track,
                    torrentId: torrent.torrentId,
                    torrentTitle: torrent.title,
                    fileId: matchingFile.id,
                    fileName: matchingFile.filename,
                    filePath: matchingFile.path,
                    directLink,
                  });
                  
                  if (selectResult.status === 'downloading' || selectResult.status === 'queued') {
                    addDebugLog('📥 Download RD avviato', `${selectResult.progress}% - verrà usato la prossima volta`, 'info');
                  } else {
                    addDebugLog('✅ Torrent sincronizzato', 'Pronto per la prossima riproduzione', 'success');
                  }
                  removeSyncingTrack(track.id);
                  addSyncedTrack(track.id);
                  return;
                }
              }
            }
          }
          
          addDebugLog('⚠️ Nessun match file', 'Torrent trovati ma nessun file corrisponde', 'warning');
        } else {
          addDebugLog('⚠️ Nessun torrent', 'Nessun torrent trovato per questo album', 'warning');
        }
        
        removeSyncingTrack(track.id);
      } catch (error) {
        addDebugLog('❌ Errore sync', error instanceof Error ? error.message : 'Errore', 'error');
        removeSyncingTrack(track.id);
      }
    };

    // =============== MAIN LOGIC ===============

    // STEP 1: Check for existing RD mapping (only if RD mode and has key)
    // IMPORTANT: YouTube-only users should NEVER use RD mappings even if they exist
    if (!isYouTubeOnlyMode && hasRdKey && track.albumId) {
      try {
        const { data: trackMapping } = await supabase
          .from('track_file_mappings')
          .select('*, album_torrent_mappings!inner(*)')
          .eq('track_id', track.id)
          .maybeSingle();

        if (currentSearchTrackIdRef.current !== track.id) return;

        if (trackMapping) {
          const torrentId = trackMapping.album_torrent_mappings.torrent_id;
          const fileId = trackMapping.file_id;
          const directLink = trackMapping.direct_link;

          if (Number.isFinite(fileId) && fileId > 0) {
            setCurrentMappedFileId(fileId);
            addDebugLog('🎯 Mappatura RD trovata', `File ID: ${fileId}`, 'success');

            // Try direct link first
            if (directLink) {
              addDebugLog('⚡ Link diretto RD', 'Riproduzione istantanea', 'success');
              setLoadingPhase('loading');
              
              if (audioRef.current) {
                // Stop YouTube if it was started from cache or previously playing
                stopYouTubePlayback();
                audioRef.current.src = directLink;
                audioRef.current.play();
                setState(prev => ({ ...prev, isPlaying: true }));
              }
              
              setLoadingPhase('idle');
              saveRecentlyPlayed();
              return;
            }

            // Fetch from RD
            setLoadingPhase('loading');
            const result = await selectFilesAndPlay(credentials!.realDebridApiKey, torrentId, [fileId]);

            if (currentSearchTrackIdRef.current !== track.id) return;

            if (result.error || result.status === 'error' || result.status === 'dead' || result.status === 'magnet_error' || result.status === 'not_found') {
              addDebugLog('⚠️ Torrent non valido', `Stato: ${result.status || result.error}`, 'warning');
              // Clear invalid mapping
              await supabase.from('track_file_mappings').delete().eq('track_id', track.id);
              // Fall through to YouTube
            } else if (result.streams.length > 0) {
              const streamUrl = result.streams[0].streamUrl;
              addDebugLog('⚡ Stream RD pronto', result.streams[0].title, 'success');
              
              setAlternativeStreams(result.streams);
              setCurrentStreamId(result.streams[0].id);

              if (audioRef.current && streamUrl) {
                // Stop YouTube if it was started from cache or previously playing
                stopYouTubePlayback();
                audioRef.current.src = streamUrl;
                audioRef.current.play();
                setState(prev => ({ ...prev, isPlaying: true }));
                
                // Update direct link
                await saveFileMapping({
                  track,
                  torrentId,
                  torrentTitle: trackMapping.album_torrent_mappings.torrent_title,
                  fileId,
                  fileName: trackMapping.file_name,
                  filePath: trackMapping.file_path,
                  directLink: streamUrl,
                });
              }
              
              setLoadingPhase('idle');
              saveRecentlyPlayed();
              return;
            } else if (result.status === 'downloading' || result.status === 'queued') {
              addDebugLog('📥 RD in download', `${result.progress}% - uso YouTube nel frattempo`, 'info');
              // Fall through to YouTube but don't sync in background (already synced)
            }
          }
        }
      } catch (error) {
        console.error('Failed to check RD mapping:', error);
      }
    }

    // STEP 2: Check for saved YouTube mapping
    // Skip if we already started YouTube from local cache (YouTube-only mode)
    if (usedYouTubeCache) {
      addDebugLog('⏭️ Skip DB check', 'Already using YouTube cache', 'info');
      // If RD mode, sync torrent in background for next time
      if (!isYouTubeOnlyMode && hasRdKey) {
        syncTorrentInBackground();
      }
      saveRecentlyPlayed();
      return;
    }
    
    try {
      const { data: youtubeMapping } = await supabase
        .from('youtube_track_mappings')
        .select('*')
        .eq('track_id', track.id)
        .maybeSingle();

      if (currentSearchTrackIdRef.current !== track.id) return;

      if (youtubeMapping) {
        addDebugLog('🎬 YouTube salvato', youtubeMapping.video_title, 'success');
        await playYouTubeAudioById(youtubeMapping.video_id, youtubeMapping.video_title);
        
        // Cache locally for instant next-time playback (iOS gesture-safe)
        try {
          localStorage.setItem(
            `youtube_mapping_${track.id}`,
            JSON.stringify({
              video_id: youtubeMapping.video_id,
              video_title: youtubeMapping.video_title,
              video_duration: youtubeMapping.video_duration,
              uploader_name: youtubeMapping.uploader_name,
            })
          );
        } catch {
          // ignore
        }
        
        // If RD mode, sync torrent in background for next time
        if (!isYouTubeOnlyMode && hasRdKey) {
          syncTorrentInBackground();
        }
        
        saveRecentlyPlayed();
        return;
      }
    } catch (error) {
      console.error('Failed to check YouTube mapping:', error);
    }

    // STEP 3: Search YouTube and play immediately
    const youtubeQuery = `${track.artist} ${track.title}`;
    setLastSearchQuery(youtubeQuery);
    setLoadingPhase('searching');
    addDebugLog('🔍 Ricerca YouTube', youtubeQuery, 'info');
    
    try {
      const videos = await searchYouTube(youtubeQuery);
      
      if (currentSearchTrackIdRef.current !== track.id) return;
      
      if (videos.length > 0) {
        setYoutubeResults(videos);
        await playAndSaveYouTube(videos[0]);
        
        // If RD mode, sync torrent in background for next time
        if (!isYouTubeOnlyMode && hasRdKey) {
          syncTorrentInBackground();
        }
      } else {
        addDebugLog('❌ Nessun risultato', 'Nessun video YouTube trovato', 'error');
        setLoadingPhase('idle');
        toast.error('Nessun contenuto trovato');
      }
    } catch (error) {
      addDebugLog('❌ Errore YouTube', error instanceof Error ? error.message : 'Errore', 'error');
      setLoadingPhase('idle');
    }
    
    saveRecentlyPlayed();
  }, [credentials, audioSourceMode, saveFileMapping, addDebugLog, clearDebugLogs, playYouTubeAudioById, tryUnlockAudioFromUserGesture]);

  const selectStream = useCallback(async (stream: StreamResult) => {
    // Switch stream for current playback immediately - no download needed since stream is already ready
    setCurrentStreamId(stream.id);
    
    // Clear any download progress since we're switching to a ready stream
    setDownloadProgress(null);
    setDownloadStatus(null);
    
    // Stop YouTube if it's playing before starting RD audio
    stopYouTubePlayback();
    
    if (audioRef.current && stream.streamUrl) {
      audioRef.current.src = stream.streamUrl;
      audioRef.current.currentTime = 0;
      audioRef.current.play();
      setState(prev => ({ ...prev, isPlaying: true }));
    }
    
    addDebugLog('Stream selezionato', `Riproduco: ${stream.title}`, 'success');
  }, [addDebugLog, stopYouTubePlayback]);

  const play = useCallback((track?: Track) => {
    if (track) {
      playTrack(track);
    } else if (audioRef.current) {
      audioRef.current.play();
      setState(prev => ({ ...prev, isPlaying: true }));
    } else {
      setState(prev => ({ ...prev, isPlaying: true }));
    }
  }, [playTrack]);

  const pause = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setState(prev => ({ ...prev, isPlaying: false }));
  }, []);

  const toggle = useCallback(() => {
    if (state.isPlaying) {
      pause();
    } else {
      play();
    }
  }, [state.isPlaying, pause, play]);

  const next = useCallback(() => {
    const nextIndex = state.queueIndex + 1;
    if (nextIndex < state.queue.length) {
      playTrack(state.queue[nextIndex], state.queue);
      setState(prev => ({ ...prev, queueIndex: nextIndex }));
    }
  }, [state.queue, state.queueIndex, playTrack]);

  const previous = useCallback(() => {
    // If we're more than 3 seconds into the song, restart it
    if (state.progress > 3) {
      seek(0);
      return;
    }
    
    const prevIndex = state.queueIndex - 1;
    if (prevIndex >= 0) {
      playTrack(state.queue[prevIndex], state.queue);
      setState(prev => ({ ...prev, queueIndex: prevIndex }));
    }
  }, [state.queue, state.queueIndex, state.progress, playTrack]);

  const seek = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
    setState(prev => ({ ...prev, progress: time }));
  }, []);

  const setVolume = useCallback((volume: number) => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
    setState(prev => ({ ...prev, volume }));
  }, []);

  const addToQueue = useCallback((tracks: Track[]) => {
    setState(prev => ({ ...prev, queue: [...prev.queue, ...tracks] }));
  }, []);

  const clearQueue = useCallback(() => {
    setState(prev => ({ ...prev, queue: [], queueIndex: 0 }));
    originalQueueRef.current = [];
    setIsShuffled(false);
  }, []);

  // Fisher-Yates shuffle algorithm
  const shuffleArray = <T,>(array: T[]): T[] => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  const toggleShuffle = useCallback(() => {
    setState(prev => {
      if (isShuffled) {
        // Restore original order
        const currentTrack = prev.queue[prev.queueIndex];
        const originalQueue = originalQueueRef.current;
        const newIndex = originalQueue.findIndex(t => t.id === currentTrack?.id);
        return {
          ...prev,
          queue: originalQueue,
          queueIndex: newIndex >= 0 ? newIndex : 0,
        };
      } else {
        // Shuffle the queue, keeping current track at position 0
        const currentTrack = prev.queue[prev.queueIndex];
        const otherTracks = prev.queue.filter((_, i) => i !== prev.queueIndex);
        const shuffledOthers = shuffleArray(otherTracks);
        const newQueue = currentTrack ? [currentTrack, ...shuffledOthers] : shuffledOthers;
        
        // Save original order before shuffling
        originalQueueRef.current = prev.queue;
        
        return {
          ...prev,
          queue: newQueue,
          queueIndex: 0,
        };
      }
    });
    setIsShuffled(prev => !prev);
  }, [isShuffled]);

  const playQueueIndex = useCallback((index: number) => {
    if (index >= 0 && index < state.queue.length) {
      const track = state.queue[index];
      setState(prev => ({
        ...prev,
        queueIndex: index,
      }));
      playTrack(track, state.queue);
    }
  }, [state.queue, playTrack]);

  // Update Media Session action handlers when next/previous change
  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        previous();
      });
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        next();
      });
    }
  }, [next, previous]);

  // Auto-poll downloading torrents until they're ready - with timeout for unavailable files
  useEffect(() => {
    if (loadingPhase !== 'downloading' || availableTorrents.length === 0) return;
    if (!credentials?.realDebridApiKey) return;
    
    const downloadingTorrents = availableTorrents.filter(t => 
      t.status === 'downloading' || t.status === 'queued' || t.status === 'magnet_conversion'
    );
    
    if (downloadingTorrents.length === 0) return;
    
    console.log('Setting up auto-poll for downloading torrents:', downloadingTorrents.map(t => t.torrentId));
    
    const startTime = Date.now();
    let lastProgress = 0;
    
    const pollInterval = setInterval(async () => {
      for (const torrent of downloadingTorrents) {
        try {
          const result = await checkTorrentStatus(credentials.realDebridApiKey, torrent.torrentId);
          
          // Handle error state
          if (result.status === 'error' || result.status === 'dead' || result.status === 'magnet_error') {
            addDebugLog('❌ Download fallito', `Torrent in stato: ${result.status}`, 'error');
            setLoadingPhase('unavailable');
            setDownloadProgress(null);
            setDownloadStatus(null);
            toast.error('File non disponibile', {
              description: 'Il torrent non è accessibile. Riprova più tardi.',
            });
            clearInterval(pollInterval);
            return;
          }
          
          // Update progress
          if (result.status === 'downloading' || result.status === 'queued') {
            setDownloadProgress(result.progress);
            addDebugLog('📥 Download', `Progresso: ${result.progress}%`, 'info');
            
            // Check if stuck at 0% for more than 10 seconds
            const elapsedSeconds = (Date.now() - startTime) / 1000;
            if (result.progress === 0 && elapsedSeconds >= 10) {
              addDebugLog('⏱️ Timeout', `Download fermo a 0% per ${Math.round(elapsedSeconds)}s - file non disponibile`, 'error');
              setLoadingPhase('unavailable');
              setDownloadProgress(null);
              setDownloadStatus(null);
              toast.error('File al momento non disponibile', {
                description: 'Il download non è partito. Pochi seeders o torrent non valido.',
              });
              clearInterval(pollInterval);
              return;
            }
            
            lastProgress = result.progress;
          }
          
          // If we have streams, play immediately!
          if (result.streams.length > 0) {
            console.log('Download complete, streams available:', result.streams.length);
            
            const streamUrl = result.streams[0].streamUrl;
            setAlternativeStreams(result.streams);
            setCurrentStreamId(result.streams[0].id);
            setDownloadProgress(null);
            setDownloadStatus(null);
            setLoadingPhase('idle');
            
            addDebugLog('⚡ Riproduzione istantanea', streamUrl.substring(0, 80) + '...', 'success');
            
            if (audioRef.current && streamUrl) {
              audioRef.current.src = streamUrl;
              audioRef.current.play();
              setState(prev => ({ ...prev, isPlaying: true }));
              
              // Update direct link in database and mark as synced
              const currentTrack = state.currentTrack;
              if (currentTrack) {
                await saveFileMapping({
                  track: currentTrack,
                  torrentId: torrent.torrentId,
                  torrentTitle: torrent.title,
                  fileId: torrent.files?.[0]?.id || 0,
                  fileName: torrent.files?.[0]?.filename,
                  filePath: torrent.files?.[0]?.path,
                  directLink: result.streams[0].streamUrl,
                });
                // Now that we have a direct link, mark as synced
                addSyncedTrack(currentTrack.id);
              }
            }
            
            clearInterval(pollInterval);
            return;
          }
        } catch (error) {
          console.error('Poll error:', error);
        }
      }
    }, 1000); // Poll every 1 second for fast audio downloads
    
    return () => clearInterval(pollInterval);
  }, [loadingPhase, availableTorrents, credentials, state.currentTrack, addDebugLog, saveFileMapping]);

  // Pre-sync next track in queue when current track starts playing
  useEffect(() => {
    // Skip if conditions aren't met
    if (!credentials?.realDebridApiKey) return;
    if (!state.currentTrack || !state.isPlaying) return;
    
    const currentTrackId = state.currentTrack.id;
    const currentAlbumId = state.currentTrack.albumId;
    const nextIndex = state.queueIndex + 1;
    if (nextIndex >= state.queue.length) return;
    
    const nextTrack = state.queue[nextIndex];
    if (!nextTrack) return;

    const preSyncNextTrack = async () => {
      // Check if next track already has a mapping (already synced)
      const { data: existingMapping } = await supabase
        .from('track_file_mappings')
        .select('id')
        .eq('track_id', nextTrack.id)
        .maybeSingle();
      
      if (existingMapping) {
        console.log('Next track already synced:', nextTrack.title);
        return;
      }
      
      console.log('Pre-syncing next track:', nextTrack.title);
      
      // Show syncing indicator on the next track
      addSyncingTrack(nextTrack.id);
      
      try {
        // If same album, try to use the cache first
        if (nextTrack.albumId === currentAlbumId && albumCacheRef.current?.albumId === currentAlbumId) {
          const cache = albumCacheRef.current;
          
          for (const torrent of cache.torrents) {
            if (torrent.files && torrent.files.length > 0) {
              const matchingFile = torrent.files.find(file => {
                const matchesFileName = flexibleMatch(file.filename || '', nextTrack.title);
                const matchesPath = flexibleMatch(file.path || '', nextTrack.title);
                return matchesFileName || matchesPath;
              });
              
              if (matchingFile) {
                console.log('Pre-sync from cache:', matchingFile.filename);
                
                // Select file to start caching (don't play)
                const result = await selectFilesAndPlay(
                  credentials.realDebridApiKey,
                  torrent.torrentId,
                  [matchingFile.id]
                );
                
                if (!result.error && result.status !== 'error') {
                  // Save the mapping with direct link if available
                  const directLink = result.streams.length > 0 ? result.streams[0].streamUrl : undefined;
                  await saveFileMapping({
                    track: nextTrack,
                    torrentId: torrent.torrentId,
                    torrentTitle: torrent.title,
                    fileId: matchingFile.id,
                    fileName: matchingFile.filename,
                    filePath: matchingFile.path,
                    directLink,
                  });
                  
                  console.log('Pre-synced next track from cache:', nextTrack.title);
                  removeSyncingTrack(nextTrack.id);
                  addSyncedTrack(nextTrack.id);
                  return;
                }
              }
            }
          }
        }
        
        // Different album or no cache - search for album
        if (nextTrack.album?.trim() && nextTrack.artist?.trim()) {
          const result = await searchStreams(
            credentials.realDebridApiKey,
            `${nextTrack.album} ${nextTrack.artist}`
          );
          
          if (result.torrents.length > 0) {
            // Cache for this album if different from current
            if (nextTrack.albumId && nextTrack.albumId !== currentAlbumId) {
              albumCacheRef.current = {
                albumId: nextTrack.albumId,
                torrents: result.torrents,
                searchedAt: Date.now(),
              };
            }
            
            for (const torrent of result.torrents) {
              if (torrent.files && torrent.files.length > 0) {
                const matchingFile = torrent.files.find(file => {
                  const matchesFileName = flexibleMatch(file.filename || '', nextTrack.title);
                  const matchesPath = flexibleMatch(file.path || '', nextTrack.title);
                  return matchesFileName || matchesPath;
                });
                
                if (matchingFile) {
                  // Select file to start caching
                  const selectResult = await selectFilesAndPlay(
                    credentials.realDebridApiKey,
                    torrent.torrentId,
                    [matchingFile.id]
                  );
                  
                  if (!selectResult.error && selectResult.status !== 'error') {
                    const directLink = selectResult.streams.length > 0 ? selectResult.streams[0].streamUrl : undefined;
                    await saveFileMapping({
                      track: nextTrack,
                      torrentId: torrent.torrentId,
                      torrentTitle: torrent.title,
                      fileId: matchingFile.id,
                      fileName: matchingFile.filename,
                      filePath: matchingFile.path,
                      directLink,
                    });
                    
                    console.log('Pre-synced next track:', nextTrack.title);
                    removeSyncingTrack(nextTrack.id);
                    addSyncedTrack(nextTrack.id);
                    return;
                  }
                }
              }
            }
          }
        }
        
        // Failed to pre-sync
        console.log('Could not pre-sync next track:', nextTrack.title);
        removeSyncingTrack(nextTrack.id);
      } catch (error) {
        console.log('Pre-sync failed for next track:', error);
        removeSyncingTrack(nextTrack.id);
      }
    };
    
    // Delay pre-sync to not interfere with current track loading
    const timeout = setTimeout(preSyncNextTrack, 3000);
    return () => clearTimeout(timeout);
  }, [state.currentTrack, state.isPlaying, state.queueIndex, state.queue, credentials, saveFileMapping]);

  return (
    <PlayerContext.Provider
      value={{
        ...state,
        play,
        pause,
        toggle,
        next,
        previous,
        seek,
        setVolume,
        addToQueue,
        playTrack,
        playQueueIndex,
        clearQueue,
        alternativeStreams,
        availableTorrents,
        selectStream,
        selectTorrentFile,
        refreshTorrent,
        currentStreamId,
        isSearchingStreams,
        manualSearch,
        debugLogs,
        clearDebugLogs,
        downloadProgress,
        downloadStatus,
        loadSavedMapping,
        currentMappedFileId,
        loadingPhase,
        youtubeResults,
        playYouTubeVideo,
        currentYouTubeVideoId,
        isPlayingYouTube,
        useYouTubeIframe,
        setYouTubeProgress: (currentTime: number, dur: number) => {
          setState(prev => ({ ...prev, progress: currentTime, duration: dur }));
          // If we're receiving progress updates, playback has started
          if (loadingPhase === 'loading') {
            setLoadingPhase('idle');
          }
          // Clear gesture requirement if we're receiving updates
          if (youtubeNeedsUserGesture) {
            setYoutubeNeedsUserGesture(false);
          }
        },
        setYouTubePlaybackStarted: () => {
          console.log('setYouTubePlaybackStarted called, setting loadingPhase to idle');
          setState(prev => ({ ...prev, isPlaying: true }));
          setLoadingPhase('idle');
          setYoutubeNeedsUserGesture(false);
        },
        setYouTubePaused: () => {
          console.log('setYouTubePaused called');
          setState(prev => ({ ...prev, isPlaying: false }));
        },
        setYouTubeNeedsGesture: () => {
          console.log('setYouTubeNeedsGesture called');
          setYoutubeNeedsUserGesture(true);
          setLoadingPhase('idle');
        },
        youtubeNeedsUserGesture,
        clearYouTubeNeedsGesture: () => {
          setYoutubeNeedsUserGesture(false);
        },
        lastSearchQuery,
        searchYouTubeManually,
        isShuffled,
        toggleShuffle,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
};

export const usePlayer = () => {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error('usePlayer must be used within a PlayerProvider');
  }
  return context;
};
