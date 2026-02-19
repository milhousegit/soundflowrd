// PlayerContext - Audio playback state management (v3.0 - Clean queue logic)
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { toast } from 'sonner';

import { supabase } from '@/integrations/supabase/client';
import { Track, type PlayerState } from '@/types/music';
import { useAuth } from './AuthContext';
import { useSettings } from './SettingsContext';

import {
  type AudioFile,
  type StreamResult,
  type TorrentInfo,
  checkTorrentStatus,
  searchStreams,
  selectFilesAndPlay,
} from '@/lib/realdebrid';

import { getTidalStream, mapQualityToTidal, type TidalStreamResult, type TidalStreamError } from '@/lib/tidal';
import { getMonochromeStream } from '@/lib/monochrome';
import { SCRAPING_SOURCES, type FallbackSourceId } from '@/types/settings';
import { searchTracks, getArtistTopTracks } from '@/lib/deezer';
import { saveRecentlyPlayedTrack } from '@/hooks/useRecentlyPlayed';
import { updateListeningStats } from '@/hooks/useListeningStats';
import { addSyncedTrack, addSyncingTrack, removeSyncingTrack } from '@/hooks/useSyncedTracks';

// IndexedDB helper for offline playback
const getOfflineTrackUrl = async (trackId: string): Promise<string | null> => {
  try {
    const DB_NAME = 'soundflow-offline';
    const STORE_NAME = 'tracks';
    
    return new Promise((resolve) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onerror = () => resolve(null);
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          resolve(null);
          return;
        }
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const getRequest = store.get(trackId);
        getRequest.onsuccess = () => {
          const result = getRequest.result;
          if (result?.blob) {
            resolve(URL.createObjectURL(result.blob));
          } else {
            resolve(null);
          }
        };
        getRequest.onerror = () => resolve(null);
      };
    });
  } catch {
    return null;
  }
};

export interface DebugLogEntry {
  timestamp: Date;
  step: string;
  details?: string;
  status: 'info' | 'success' | 'error' | 'warning';
}

export type LoadingPhase = 'idle' | 'searching' | 'downloading' | 'loading' | 'unavailable';
export type AudioSource = 'squidwtf' | 'monochrome' | 'real-debrid' | 'offline' | null;

export interface PlaybackSource {
  type: 'playlist' | 'album' | 'artist' | 'radio' | 'search' | 'queue' | null;
  name: string | null;
  path: string | null; // e.g. /playlist/123, /album/456, /artist/789
}

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
  reorderQueue: (fromIndex: number, toIndex: number) => void;

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

  lastSearchQuery: string | null;

  isShuffled: boolean;
  toggleShuffle: () => void;
  
  currentAudioSource: AudioSource;
  
  playbackSource: PlaybackSource;
  setPlaybackSource: (source: PlaybackSource) => void;
  
  updateTrackMetadata: (oldTrackId: string, newData: { id: string; title: string; artist: string; album?: string; coverUrl?: string; duration?: number }) => void;
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

const updateMediaSessionMetadata = (track: Track | null, isPlaying: boolean) => {
  if (!('mediaSession' in navigator) || !track) return;

  const coverUrl = track.coverUrl;

  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: track.artist,
    album: track.album || '',
    artwork: coverUrl
      ? [
          { src: coverUrl, sizes: '96x96', type: 'image/jpeg' },
          { src: coverUrl, sizes: '128x128', type: 'image/jpeg' },
          { src: coverUrl, sizes: '192x192', type: 'image/jpeg' },
          { src: coverUrl, sizes: '256x256', type: 'image/jpeg' },
          { src: coverUrl, sizes: '384x384', type: 'image/jpeg' },
          { src: coverUrl, sizes: '512x512', type: 'image/jpeg' },
        ]
      : [],
  });

  navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
};

// Helper string matching copied from existing implementation (kept behavior)
const normalizeForMatch = (str: string): string =>
  str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[''`]/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const extractSignificantWords = (str: string): string[] => {
  const normalized = normalizeForMatch(str);
  const stopWords = [
    'a',
    'e',
    'i',
    'o',
    'u',
    'il',
    'la',
    'lo',
    'le',
    'gli',
    'un',
    'una',
    'uno',
    'di',
    'da',
    'in',
    'con',
    'su',
    'per',
    'tra',
    'fra',
    'del',
    'della',
    'dei',
    'degli',
    'al',
    'alla',
    'the',
    'an',
    'of',
    'to',
    'and',
    'or',
    'for',
    'mp3',
    'flac',
    'wav',
    'm4a',
    'aac',
    'ogg',
  ];
  return normalized
    .split(/\s+/)
    .filter((w) => w.length > 1 && !stopWords.includes(w) && !/^\d+$/.test(w));
};

const flexibleMatch = (fileName: string, trackTitle: string): boolean => {
  const normalizedFile = normalizeForMatch(fileName);
  const normalizedTitle = normalizeForMatch(trackTitle);

  if (normalizedTitle.length <= 10 && normalizedTitle.length > 2) {
    if (normalizedFile.includes(normalizedTitle)) return true;
  }

  if (normalizedFile.includes(normalizedTitle)) return true;

  const titleWords = extractSignificantWords(trackTitle);
  if (titleWords.length === 0) return false;

  const matchingWords = titleWords.filter((word) => normalizedFile.includes(word));
  if (matchingWords.length === titleWords.length) return true;

  if (titleWords.length === 1 && titleWords[0].length >= 3) {
    if (normalizedFile.includes(titleWords[0])) return true;
  }

  if (titleWords.length === 2) {
    if (matchingWords.length === 2) return true;
    const longWords = titleWords.filter((w) => w.length >= 4);
    const matchingLongWords = longWords.filter((w) => normalizedFile.includes(w));
    if (longWords.length > 0 && matchingLongWords.length === longWords.length) return true;
  }

  if (titleWords.length >= 4 && matchingWords.length >= 3) return true;
  if (titleWords.length === 3 && matchingWords.length >= 2) return true;

  const fileWords = extractSignificantWords(fileName);
  if (fileWords.length >= 2) {
    const fileWordsInTitle = fileWords.filter((fw) => titleWords.includes(fw));
    if (fileWordsInTitle.length >= fileWords.length * 0.8 && fileWordsInTitle.length >= 2) return true;
  }

  if (fileWords.some((fw) => fw === normalizedTitle || normalizedTitle.includes(fw))) {
    if (normalizedTitle.length >= 4) return true;
  }

  return false;
};

// Helper to clean track title by removing parentheses content
const cleanTrackTitle = (title: string): string => {
  return title.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s*\[[^\]]*\]\s*/g, ' ').trim();
};

// Helper to clean artist name - remove "E" prefix badge and get first artist only
const cleanArtistName = (artist: string): string => {
  // Get first artist only (comma separated)
  let cleaned = artist.split(',')[0].trim();
  
  // Remove "E" prefix if followed by uppercase letter (not another E)
  if (cleaned.length > 1 && cleaned.startsWith('E') && /[A-Z]/.test(cleaned[1]) && cleaned[1] !== 'E') {
    cleaned = cleaned.substring(1);
  }
  
  return cleaned;
};

// Fetch metadata from Deezer for tracks missing cover/duration
const fetchTrackMetadata = async (track: Track): Promise<Track> => {
  // Check if track needs metadata (missing cover or has spotify- prefix ID)
  const needsMetadata = !track.coverUrl || track.id.startsWith('spotify-') || track.duration === 0;
  
  if (!needsMetadata) {
    return track;
  }
  
  try {
    const cleanedTitle = cleanTrackTitle(track.title);
    const cleanedArtist = cleanArtistName(track.artist);
    
    console.log(`[Metadata] Searching Deezer for "${cleanedTitle}" by "${cleanedArtist}"`);
    
    // Search on Deezer with cleaned title and artist
    const results = await searchTracks(`${cleanedTitle} ${cleanedArtist}`);
    
    if (results.length === 0) {
      console.log('[Metadata] No results found');
      return track;
    }
    
    // Find best match
    const normalizedTitle = cleanedTitle.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const normalizedArtist = cleanedArtist.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    
    let bestMatch = results[0];
    let bestScore = 0;
    
    for (const result of results) {
      const resultTitle = (result.title || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const resultArtist = (result.artist || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      
      let score = 0;
      
      // Title similarity
      if (resultTitle === normalizedTitle) {
        score += 50;
      } else if (resultTitle.includes(normalizedTitle) || normalizedTitle.includes(resultTitle)) {
        score += 30;
      }
      
      // Artist similarity
      if (resultArtist === normalizedArtist) {
        score += 50;
      } else if (resultArtist.includes(normalizedArtist) || normalizedArtist.includes(resultArtist)) {
        score += 30;
      }
      
      if (score > bestScore) {
        bestScore = score;
        bestMatch = result;
      }
    }
    
    // Accept if score is good enough
    if (bestScore >= 40) {
      console.log(`[Metadata] Found match: "${bestMatch.title}" by "${bestMatch.artist}" (score: ${bestScore})`);
      
      return {
        ...track,
        id: bestMatch.id || track.id, // Use Deezer ID if available
        title: bestMatch.title || track.title,
        artist: bestMatch.artist || track.artist,
        album: bestMatch.album || track.album,
        albumId: bestMatch.albumId || track.albumId,
        coverUrl: bestMatch.coverUrl || track.coverUrl,
        duration: bestMatch.duration || track.duration,
        artistId: bestMatch.artistId || track.artistId,
      };
    }
    
    console.log(`[Metadata] No good match (best score: ${bestScore})`);
    return track;
  } catch (error) {
    console.error('[Metadata] Error fetching metadata:', error);
    return track;
  }
};

export const PlayerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Audio element reference
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { credentials, user } = useAuth();
  const { audioSourceMode, settings, selectedScrapingSource, hybridFallbackChain } = useSettings();

  const [alternativeStreams, setAlternativeStreams] = useState<StreamResult[]>([]);
  const [availableTorrents, setAvailableTorrents] = useState<TorrentInfo[]>([]);
  const [currentStreamId, setCurrentStreamId] = useState<string>();
  const [isSearchingStreams, setIsSearchingStreams] = useState(false);

  const [debugLogs, setDebugLogs] = useState<DebugLogEntry[]>([]);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);
  const [currentMappedFileId, setCurrentMappedFileId] = useState<number | undefined>();
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>('idle');
  const [lastSearchQuery, setLastSearchQuery] = useState<string | null>(null);
  const [currentAudioSource, setCurrentAudioSource] = useState<AudioSource>(null);
  const [playbackSource, setPlaybackSourceInternal] = useState<PlaybackSource>({ type: null, name: null, path: null });
  const manualSourceRef = useRef(false);
  
  const setPlaybackSource = useCallback((source: PlaybackSource) => {
    manualSourceRef.current = true;
    setPlaybackSourceInternal(source);
  }, []);

  const [isShuffled, setIsShuffled] = useState(false);
  const originalQueueRef = useRef<Track[]>([]);

  const currentSearchTrackIdRef = useRef<string | null>(null);
  const nextRef = useRef<() => void>(() => {});
  const previousRef = useRef<() => void>(() => {});
  const autoSkipTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Pre-fetching system for seamless background playback on iOS
  const prefetchedNextUrlRef = useRef<{ trackId: string; url: string; source: AudioSource } | null>(null);
  const isPrefetchingRef = useRef(false);
  const prefetchedTrackIdRef = useRef<string | null>(null);
  
  // Track actual listening time
  const playbackStartTimeRef = useRef<number | null>(null);
  const lastSavedTrackRef = useRef<{ track: Track; startTime: number } | null>(null);

  // Auto-skip to next track when current track is unavailable
  const autoSkipToNext = useCallback(() => {
    // Clear any existing timeout
    if (autoSkipTimeoutRef.current) {
      clearTimeout(autoSkipTimeoutRef.current);
    }
    
    // Wait 2 seconds then skip to next track
    autoSkipTimeoutRef.current = setTimeout(() => {
      console.log('[PlayerContext] Auto-skipping to next track after error');
      nextRef.current();
    }, 2000);
  }, []);

  // Safe play helper that handles interrupted play errors gracefully
  const safePlay = useCallback(async (audio: HTMLAudioElement): Promise<boolean> => {
    try {
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        await playPromise;
      }
      return true;
    } catch (error) {
      if (error instanceof Error) {
        // AbortError: play() was interrupted (user switched tracks) - this is normal
        if (error.name === 'AbortError') {
          console.log('[PlayerContext] Play aborted (track switch)');
          return false;
        }
        // NotAllowedError: Autoplay blocked - user needs to interact first
        if (error.name === 'NotAllowedError') {
          console.log('[PlayerContext] Autoplay blocked');
          return false;
        }
      }
      console.error('[PlayerContext] Play error:', error);
      return false;
    }
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

  const addDebugLog = useCallback(
    (step: string, details?: string, status: DebugLogEntry['status'] = 'info') => {
      const timestamp = new Date();
      setDebugLogs((prev) => [...prev, { timestamp, step, details, status }]);
    },
    []
  );

  const clearDebugLogs = useCallback(() => setDebugLogs([]), []);

  // Update track metadata (used when user manually corrects metadata)
  const updateTrackMetadata = useCallback((oldTrackId: string, newData: { id: string; title: string; artist: string; album?: string; coverUrl?: string; duration?: number }) => {
    setState((prev) => {
      const updateTrack = (track: Track): Track => {
        if (track.id !== oldTrackId) return track;
        return {
          ...track,
          id: newData.id,
          title: newData.title,
          artist: newData.artist,
          album: newData.album || track.album,
          coverUrl: newData.coverUrl || track.coverUrl,
          duration: newData.duration || track.duration,
        };
      };

      const updatedQueue = prev.queue.map(updateTrack);
      const updatedCurrentTrack = prev.currentTrack ? updateTrack(prev.currentTrack) : null;

      // Also update original queue ref for shuffle
      if (originalQueueRef.current.length > 0) {
        originalQueueRef.current = originalQueueRef.current.map(updateTrack);
      }

      return {
        ...prev,
        queue: updatedQueue,
        currentTrack: updatedCurrentTrack,
      };
    });

    // Update media session if current track was updated
    if (state.currentTrack?.id === oldTrackId) {
      const updatedTrack = {
        ...state.currentTrack,
        id: newData.id,
        title: newData.title,
        artist: newData.artist,
        album: newData.album || state.currentTrack.album,
        coverUrl: newData.coverUrl || state.currentTrack.coverUrl,
        duration: newData.duration || state.currentTrack.duration,
      };
      updateMediaSessionMetadata(updatedTrack, state.isPlaying);
    }
  }, [state.currentTrack, state.isPlaying]);

  // Update Media Session metadata when track changes
  useEffect(() => {
    updateMediaSessionMetadata(state.currentTrack, state.isPlaying);
  }, [state.currentTrack, state.isPlaying]);

  // Update position state for Media Session scrubbing
  useEffect(() => {
    if (!('mediaSession' in navigator) || !state.currentTrack) return;
    
    try {
      navigator.mediaSession.setPositionState({
        duration: state.duration || 0,
        playbackRate: 1,
        position: Math.min(state.progress, state.duration || 0),
      });
    } catch (e) {
      // Ignore errors on browsers that don't support setPositionState
    }
  }, [state.progress, state.duration, state.currentTrack]);

  // (iOS audio session ref removed - not needed for desktop/Android)

  useEffect(() => {
    audioRef.current = new Audio();
    audioRef.current.volume = state.volume;
    // iOS Safari requires these attributes for better background playback
    audioRef.current.setAttribute('playsinline', '');
    audioRef.current.setAttribute('webkit-playsinline', '');

    const audio = audioRef.current;

    // Simple time update handler
    const handleTimeUpdate = () => {
      setState((prev) => ({ ...prev, progress: audio.currentTime }));
    };
    
    const handleLoadedMetadata = () => setState((prev) => ({ ...prev, duration: audio.duration }));
    
    // Track ended handler - simply advance to next track
    const handleEnded = () => {
      console.log('[PlayerContext] Track ended');
      
      // Save actual listening time for the track that just ended
      if (lastSavedTrackRef.current) {
        const { track: prevTrack, startTime } = lastSavedTrackRef.current;
        const actualSecondsListened = Math.round((Date.now() - startTime) / 1000);
        saveRecentlyPlayedTrack(prevTrack, user?.id, actualSecondsListened);
        if (user?.id) {
          updateListeningStats(prevTrack, user.id, actualSecondsListened);
        }
        lastSavedTrackRef.current = null;
      }
      
      // Simply advance to next track
      nextRef.current();
    };

    // Handle pause events - save actual listening time
    const handlePause = () => {
      if (!audio.ended) {
        setState((prev) => ({ ...prev, isPlaying: false }));
        
        // Save actual listening time when paused
        if (lastSavedTrackRef.current) {
          const { track: prevTrack, startTime } = lastSavedTrackRef.current;
          const actualSecondsListened = Math.round((Date.now() - startTime) / 1000);
          if (actualSecondsListened >= 10) {
            saveRecentlyPlayedTrack(prevTrack, user?.id, actualSecondsListened);
            // Update aggregated stats for Wrapped
            if (user?.id) {
              updateListeningStats(prevTrack, user.id, actualSecondsListened);
            }
          }
          lastSavedTrackRef.current = null;
        }
      }
    };

    const handlePlay = () => {
      setState((prev) => ({ ...prev, isPlaying: true }));
      
      // Resume tracking playback time when play resumes
      if (state.currentTrack && !lastSavedTrackRef.current) {
        lastSavedTrackRef.current = {
          track: state.currentTrack,
          startTime: Date.now(),
        };
      }
    };

    // Simplified error handler
    const handleError = (e: Event) => {
      console.error('[PlayerContext] Audio error:', e);
    };

    // Simplified stalled handler
    const handleStalled = () => {
      console.log('[PlayerContext] Audio stalled');
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('error', handleError);
    audio.addEventListener('stalled', handleStalled);

    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => {
        audio.play();
        setState((prev) => ({ ...prev, isPlaying: true }));
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        audio.pause();
        setState((prev) => ({ ...prev, isPlaying: false }));
      });
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        previousRef.current();
      });
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        nextRef.current();
      });
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined && audio.duration) {
          audio.currentTime = details.seekTime;
          setState((prev) => ({ ...prev, progress: details.seekTime! }));
        }
      });
      
      // CRITICAL: On iOS, setting to null doesn't work - we must set explicit handlers
      // that do the same as prev/next to force iOS to show track buttons instead of seek
      try {
        // First try setting to null (works on some browsers)
        navigator.mediaSession.setActionHandler('seekbackward', null);
        navigator.mediaSession.setActionHandler('seekforward', null);
      } catch (e) {
        // If null doesn't work, set explicit handlers that act as prev/next
        try {
          navigator.mediaSession.setActionHandler('seekbackward', () => {
            previousRef.current();
          });
          navigator.mediaSession.setActionHandler('seekforward', () => {
            nextRef.current();
          });
        } catch (e2) {
          // Fallback: just ignore
        }
      }
    }

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('stalled', handleStalled);
      audio.pause();
      audio.src = '';
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Simplified unlock - no-op without iOS audio session
  const tryUnlockAudioFromUserGesture = useCallback(() => {
    // No-op: iOS workarounds removed
  }, []);

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

        if (!insertError && newMapping) albumMappingId = newMapping.id;
      }

      if (!albumMappingId) return;

      await supabase.from('track_file_mappings').upsert(
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
        { onConflict: 'track_id' }
      );

      setCurrentMappedFileId(fileId);

      if (directLink) addSyncedTrack(track.id);
    } catch (error) {
      console.error('Failed to save file mapping:', error);
      removeSyncingTrack(track.id);
    }
  }, []);

  const loadSavedMapping = useCallback(async () => {
    const track = state.currentTrack;
    if (!track?.albumId || !credentials?.realDebridApiKey) return;

    try {
      const { data: trackMapping } = await supabase
        .from('track_file_mappings')
        .select('*, album_torrent_mappings!inner(*)')
        .eq('track_id', track.id)
        .maybeSingle();

      if (trackMapping?.file_id) {
        setCurrentMappedFileId(trackMapping.file_id);
        addDebugLog('🎯 Mappatura RD trovata', `File ID: ${trackMapping.file_id}`, 'success');
      } else {
        setCurrentMappedFileId(undefined);
        addDebugLog('ℹ️ Nessuna mappatura RD', 'Questa traccia non ha ancora una sorgente RD salvata', 'info');
      }
    } catch (error) {
      console.error('Failed to load saved mapping:', error);
      addDebugLog('❌ Errore caricamento', error instanceof Error ? error.message : 'Errore sconosciuto', 'error');
    }
  }, [addDebugLog, credentials, state.currentTrack]);

  const playTrack = useCallback(
    async (track: Track, queue?: Track[], startIndex?: number) => {
      tryUnlockAudioFromUserGesture();

      // Save actual listening time for the previous track before switching
      if (lastSavedTrackRef.current && audioRef.current) {
        const { track: prevTrack, startTime } = lastSavedTrackRef.current;
        const actualSecondsListened = Math.round((Date.now() - startTime) / 1000);
        if (actualSecondsListened >= 10) {
          saveRecentlyPlayedTrack(prevTrack, user?.id, actualSecondsListened);
          if (user?.id) {
            updateListeningStats(prevTrack, user.id, actualSecondsListened);
          }
        }
        lastSavedTrackRef.current = null;
      }

      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }

      currentSearchTrackIdRef.current = track.id;

      // Initialize queue with original track
      const initialQueue = queue ? [...queue] : [track];
      const calculatedIndex = startIndex !== undefined ? startIndex : initialQueue.findIndex((t) => t.id === track.id);

      setState((prev) => ({
        ...prev,
        currentTrack: track,
        isPlaying: true,
        queue: initialQueue,
        queueIndex: calculatedIndex >= 0 ? calculatedIndex : 0,
        duration: track.duration,
        progress: 0,
      }));

      // Update media session metadata immediately
      updateMediaSessionMetadata(track, true);

      // Clear prefetch state
      prefetchedNextUrlRef.current = null;
      prefetchedTrackIdRef.current = null;

      const enrichedTrack = track;

      clearDebugLogs();
      setAlternativeStreams([]);
      setAvailableTorrents([]);
      setCurrentStreamId(undefined);
      setDownloadProgress(null);
      setDownloadStatus(null);
      setLoadingPhase('idle');
      setCurrentAudioSource(null);

      // PRIORITY 1: Check for offline availability first (works without network)
      const offlineUrl = await getOfflineTrackUrl(enrichedTrack.id);
      if (offlineUrl && audioRef.current) {
        addDebugLog('📱 Brano offline', `Riproduzione da storage locale`, 'info');
        audioRef.current.src = offlineUrl;
        
        if (await safePlay(audioRef.current)) {
          setState((prev) => ({ ...prev, isPlaying: true }));
          setLoadingPhase('idle');
          setCurrentAudioSource('offline');
          lastSavedTrackRef.current = { track: enrichedTrack, startTime: Date.now() };
          addDebugLog('✅ Riproduzione offline', `"${enrichedTrack.title}" avviato`, 'success');
          updateMediaSessionMetadata(enrichedTrack, true);
          return;
        }
      }

      const isDeezerPriorityMode = audioSourceMode === 'deezer_priority';
      const isHybridMode = audioSourceMode === 'hybrid_priority';
      const hasRdKey = !!credentials?.realDebridApiKey;

      // Helper to start tracking playback time (called when playback actually starts)
      const startTrackingPlayback = () => {
        lastSavedTrackRef.current = {
          track: enrichedTrack,
          startTime: Date.now(),
        };
        
        // Update currently playing status in database (for admin visibility)
        if (user?.id) {
          supabase
            .from('profiles')
            .update({
              currently_playing_track_id: enrichedTrack.id,
              currently_playing_at: new Date().toISOString(),
              last_seen_at: new Date().toISOString(),
            })
            .eq('id', user.id)
            .then(() => {});
        }
      };

      // Helper function for scraping source fallback
      const playWithScrapingSource = async (sourceId: string): Promise<boolean> => {
        const tidalQuality = mapQualityToTidal(settings.audioQuality);
        const sourceName = sourceId === 'monochrome' ? 'Monochrome' : 'SquidWTF';
        addDebugLog(`🎵 ${sourceName}`, `Ricerca "${enrichedTrack.title}" di ${enrichedTrack.artist} (${tidalQuality})`, 'info');
        try {
          const streamFn = sourceId === 'monochrome' ? getMonochromeStream : getTidalStream;
          const result = await streamFn(enrichedTrack.title, enrichedTrack.artist, tidalQuality);
          if (currentSearchTrackIdRef.current !== enrichedTrack.id) return false;

          if ('streamUrl' in result && result.streamUrl && audioRef.current) {
            audioRef.current.src = result.streamUrl;
            
            try {
              if (currentSearchTrackIdRef.current !== enrichedTrack.id) return false;
              
              const playPromise = audioRef.current.play();
              if (playPromise !== undefined) {
                await playPromise;
              }
              
              if (currentSearchTrackIdRef.current !== enrichedTrack.id) return false;
              
              setState((prev) => ({ ...prev, isPlaying: true }));
              setLoadingPhase('idle');
              setCurrentAudioSource(sourceId === 'monochrome' ? 'monochrome' : 'squidwtf');
              startTrackingPlayback();
              
              const qualityInfo = result.bitDepth && result.sampleRate 
                ? `${result.bitDepth}bit/${result.sampleRate/1000}kHz` 
                : result.quality || 'LOSSLESS';
              addDebugLog(`✅ ${sourceName} avviato`, `Stream ${qualityInfo}`, 'success');
              return true;
            } catch (playError) {
              if (playError instanceof Error && (playError.name === 'AbortError' || playError.name === 'NotAllowedError')) {
                return false;
              }
              throw playError;
            }
          }
          return false;
        } catch (error) {
          addDebugLog(`❌ ${sourceName} fallito`, error instanceof Error ? error.message : 'Errore', 'error');
          return false;
        }
      };

      // Helper to start background RD download in hybrid mode
      const startBackgroundRdDownload = async (trackToDownload: Track) => {
        if (!hasRdKey || !trackToDownload.albumId) return;
        
        addDebugLog('📥 Download RD in background', `Avvio ricerca per "${trackToDownload.title}"`, 'info');
        
        try {
          const query = trackToDownload.album?.trim() 
            ? `${trackToDownload.album} ${trackToDownload.artist}` 
            : `${trackToDownload.title} ${trackToDownload.artist}`;
          
          const result = await searchStreams(credentials!.realDebridApiKey, query);
          
          // Try to find matching file in torrents
          for (const torrent of result.torrents) {
            if (!torrent.files?.length) continue;
            const matchingFile = torrent.files.find((file) =>
              flexibleMatch(file.filename || '', trackToDownload.title) || flexibleMatch(file.path || '', trackToDownload.title)
            );
            if (!matchingFile) continue;

            addDebugLog('🎯 Match RD trovato', `${matchingFile.filename} - download avviato`, 'success');
            
            // Start download (don't play, just cache for later)
            const selectResult = await selectFilesAndPlay(credentials!.realDebridApiKey, torrent.torrentId, [matchingFile.id]);
            
            if (!selectResult.error && selectResult.streams.length > 0) {
              // Save mapping for future use
              await saveFileMapping({
                track: trackToDownload,
                torrentId: torrent.torrentId,
                torrentTitle: torrent.title,
                fileId: matchingFile.id,
                fileName: matchingFile.filename,
                filePath: matchingFile.path,
                directLink: selectResult.streams[0].streamUrl,
              });
              addDebugLog('✅ Mappatura RD salvata', 'Disponibile per riproduzioni future', 'success');
            }
            break;
          }
        } catch (error) {
          console.error('Background RD download failed:', error);
          addDebugLog('⚠️ Download RD fallito', error instanceof Error ? error.message : 'Errore', 'warning');
        }
      };

      // =============== SCRAPING PONTE MODE ===============
      if (isDeezerPriorityMode) {
        setLoadingPhase('searching');
        const success = await playWithScrapingSource(selectedScrapingSource);
        if (success) return;

        setLoadingPhase('unavailable');
        const sourceName = selectedScrapingSource === 'monochrome' ? 'Monochrome' : 'SquidWTF';
        toast.error(`Traccia non trovata su ${sourceName}`, { description: 'Passo alla prossima...' });
        autoSkipToNext();
        return;
      }

      // =============== HYBRID MODE: RD first, Tidal fallback ===============
      if (isHybridMode) {
        addDebugLog('👑 Modalità Ibrida', `RD prima, fallback Tidal`, 'info');
        
        // First, check if we have RD key and try RD
        if (hasRdKey) {
          // Check for saved RD mapping first
          if (enrichedTrack.albumId) {
            try {
              const { data: trackMapping } = await supabase
                .from('track_file_mappings')
                .select('*, album_torrent_mappings!inner(*)')
                .eq('track_id', enrichedTrack.id)
                .maybeSingle();

              if (currentSearchTrackIdRef.current !== enrichedTrack.id) return;

              if (trackMapping?.direct_link && audioRef.current) {
                setLoadingPhase('loading');
                audioRef.current.src = trackMapping.direct_link;
                if (await safePlay(audioRef.current)) {
                  setState((prev) => ({ ...prev, isPlaying: true }));
                }
                setLoadingPhase('idle');
                setCurrentAudioSource('real-debrid');
                setCurrentMappedFileId(trackMapping.file_id);
                addDebugLog('✅ Riproduzione RD (cache)', 'Stream da mappatura salvata', 'success');
                startTrackingPlayback();
                return;
              }
            } catch (error) {
              console.error('Failed to check RD mapping in hybrid mode:', error);
            }
          }

          // Try quick RD search
          setLoadingPhase('searching');
          addDebugLog('🔎 Ricerca RD', `Query: "${enrichedTrack.album || enrichedTrack.title} ${enrichedTrack.artist}"`, 'info');
          
          try {
            const query = enrichedTrack.album?.trim() 
              ? `${enrichedTrack.album} ${enrichedTrack.artist}` 
              : `${enrichedTrack.title} ${enrichedTrack.artist}`;
            
            const result = await searchStreams(credentials!.realDebridApiKey, query);
            if (currentSearchTrackIdRef.current !== enrichedTrack.id) return;

            // Check if we have immediate streams
            if (result.streams?.length) {
              setAlternativeStreams(result.streams);
              const selected = result.streams[0];
              setCurrentStreamId(selected.id);
              if (audioRef.current && selected.streamUrl) {
                setLoadingPhase('loading');
                audioRef.current.src = selected.streamUrl;
                if (await safePlay(audioRef.current)) {
                  setState((prev) => ({ ...prev, isPlaying: true }));
                }
                setLoadingPhase('idle');
                setCurrentAudioSource('real-debrid');
                addDebugLog('✅ Riproduzione RD', selected.title, 'success');
                startTrackingPlayback();
                return;
              }
            }

            // Try to find matching file in torrents
            for (const torrent of result.torrents) {
              if (!torrent.files?.length) continue;
              const matchingFile = torrent.files.find((file) =>
                flexibleMatch(file.filename || '', enrichedTrack.title) || flexibleMatch(file.path || '', enrichedTrack.title)
              );
              if (!matchingFile) continue;

              addDebugLog('🎯 Match RD trovato', matchingFile.filename || '', 'success');
              setLoadingPhase('loading');

              const selectResult = await selectFilesAndPlay(credentials!.realDebridApiKey, torrent.torrentId, [matchingFile.id]);
              if (currentSearchTrackIdRef.current !== enrichedTrack.id) return;

              if (!selectResult.error && selectResult.streams.length > 0) {
                const streamUrl = selectResult.streams[0].streamUrl;
                setAlternativeStreams(selectResult.streams);
                setCurrentStreamId(selectResult.streams[0].id);

                await saveFileMapping({
                  track: enrichedTrack,
                  torrentId: torrent.torrentId,
                  torrentTitle: torrent.title,
                  fileId: matchingFile.id,
                  fileName: matchingFile.filename,
                  filePath: matchingFile.path,
                  directLink: streamUrl,
                });

                if (audioRef.current && streamUrl) {
                  audioRef.current.src = streamUrl;
                  if (await safePlay(audioRef.current)) {
                    setState((prev) => ({ ...prev, isPlaying: true }));
                  }
                }

                setLoadingPhase('idle');
                setCurrentAudioSource('real-debrid');
                startTrackingPlayback();
                return;
              }

              // If downloading, fall through to Tidal but start background download
              if (['downloading', 'queued', 'magnet_conversion'].includes(selectResult.status)) {
                addDebugLog('⏳ RD in download', `${selectResult.progress}% - uso fallback Tidal`, 'warning');
                // Don't block - fall through to Tidal fallback
                break;
              }
            }
          } catch (error) {
            addDebugLog('⚠️ Errore RD', error instanceof Error ? error.message : 'Errore', 'warning');
          }
        }

        // RD not available or downloading - try remaining fallback chain sources
        const scrapingSources = hybridFallbackChain.filter(s => s !== 'real-debrid');
        for (const sourceId of scrapingSources) {
          addDebugLog(`🔄 Fallback a ${sourceId === 'monochrome' ? 'Monochrome' : 'SquidWTF'}`, '', 'info');
          setLoadingPhase('searching');
          const success = await playWithScrapingSource(sourceId);
          if (success) {
            // Start background RD download while playing via scraping
            if (hasRdKey) {
              startBackgroundRdDownload(enrichedTrack);
            }
            return;
          }
        }
        
        // All failed
        setLoadingPhase('unavailable');
        toast.error('Nessuna sorgente disponibile', {
          description: 'Passo alla prossima...',
        });
        autoSkipToNext();
        return;
      }

      // =============== RD MODE (NO YOUTUBE) ===============
      if (!hasRdKey) {
        setLoadingPhase('unavailable');
        toast.error('Real-Debrid non configurato', {
          description: 'Aggiungi la tua API key nelle impostazioni per riprodurre.',
        });
        return;
      }

      addDebugLog('🎵 Inizio riproduzione', `"${enrichedTrack.title}" di ${enrichedTrack.artist}`, 'info');

      // STEP 1: check saved mapping
      if (enrichedTrack.albumId) {
        try {
          const { data: trackMapping } = await supabase
            .from('track_file_mappings')
            .select('*, album_torrent_mappings!inner(*)')
            .eq('track_id', enrichedTrack.id)
            .maybeSingle();

          if (currentSearchTrackIdRef.current !== enrichedTrack.id) return;

          if (trackMapping) {
            const torrentId = trackMapping.album_torrent_mappings.torrent_id;
            const fileId = trackMapping.file_id;
            const directLink = trackMapping.direct_link;

            if (Number.isFinite(fileId) && fileId > 0) {
              setCurrentMappedFileId(fileId);
              addDebugLog('🎯 Mappatura RD trovata', `File ID: ${fileId}`, 'success');

              if (directLink && audioRef.current) {
                setLoadingPhase('loading');
                audioRef.current.src = directLink;
                if (await safePlay(audioRef.current)) {
                  setState((prev) => ({ ...prev, isPlaying: true }));
                }
                setLoadingPhase('idle');
                setCurrentAudioSource('real-debrid');
                startTrackingPlayback();
                return;
              }

              setLoadingPhase('loading');
              const result = await selectFilesAndPlay(credentials!.realDebridApiKey, torrentId, [fileId]);

              if (currentSearchTrackIdRef.current !== enrichedTrack.id) return;

              if (result.error || ['error', 'dead', 'magnet_error', 'not_found'].includes(result.status)) {
                addDebugLog('⚠️ Mappatura non valida', `Stato: ${result.status || result.error}`, 'warning');
                await supabase.from('track_file_mappings').delete().eq('track_id', enrichedTrack.id);
              } else if (result.streams.length > 0) {
                const streamUrl = result.streams[0].streamUrl;
                setAlternativeStreams(result.streams);
                setCurrentStreamId(result.streams[0].id);

                if (audioRef.current && streamUrl) {
                  audioRef.current.src = streamUrl;
                  if (await safePlay(audioRef.current)) {
                    setState((prev) => ({ ...prev, isPlaying: true }));
                  }

                  await saveFileMapping({
                    track: enrichedTrack,
                    torrentId,
                    torrentTitle: trackMapping.album_torrent_mappings.torrent_title,
                    fileId,
                    fileName: trackMapping.file_name,
                    filePath: trackMapping.file_path,
                    directLink: streamUrl,
                  });
                }

                setLoadingPhase('idle');
                setCurrentAudioSource('real-debrid');
                startTrackingPlayback();
                return;
              } else if (['downloading', 'queued', 'magnet_conversion'].includes(result.status)) {
                addDebugLog('📥 RD in download', `${result.progress}%`, 'info');
                setLoadingPhase('downloading');
                setDownloadProgress(result.progress ?? null);
                setDownloadStatus(result.status);
                startTrackingPlayback();
                return;
              }
            }
          }
        } catch (error) {
          console.error('Failed to check RD mapping:', error);
        }
      }

      // STEP 2: search torrents for album/track
      const query = enrichedTrack.album?.trim() ? `${enrichedTrack.album} ${enrichedTrack.artist}` : `${enrichedTrack.title} ${enrichedTrack.artist}`;
      setLastSearchQuery(query);
      setIsSearchingStreams(true);
      setLoadingPhase('searching');
      addDebugLog('🔎 Ricerca torrent', `Query: "${query}"`, 'info');

      try {
        const result = await searchStreams(credentials!.realDebridApiKey, query);

        if (currentSearchTrackIdRef.current !== enrichedTrack.id) return;

        setAvailableTorrents(result.torrents);

        if (result.streams?.length) {
          setAlternativeStreams(result.streams);
          const selected = result.streams[0];
          setCurrentStreamId(selected.id);
          if (audioRef.current && selected.streamUrl) {
            setLoadingPhase('loading');
            audioRef.current.src = selected.streamUrl;
            if (await safePlay(audioRef.current)) {
              setState((prev) => ({ ...prev, isPlaying: true }));
            }
            setLoadingPhase('idle');
            setCurrentAudioSource('real-debrid');
            addDebugLog('🔊 Riproduzione', selected.title, 'success');
            startTrackingPlayback();
            return;
          }
        }

        // If we have torrents, try to auto-match a file
        for (const torrent of result.torrents) {
          if (!torrent.files?.length) continue;
          const matchingFile = torrent.files.find((file) =>
            flexibleMatch(file.filename || '', enrichedTrack.title) || flexibleMatch(file.path || '', enrichedTrack.title)
          );
          if (!matchingFile) continue;

          addDebugLog('🎯 Match trovato', matchingFile.filename || '', 'success');
          setLoadingPhase('loading');

          const selectResult = await selectFilesAndPlay(credentials!.realDebridApiKey, torrent.torrentId, [matchingFile.id]);
          if (currentSearchTrackIdRef.current !== enrichedTrack.id) return;

          if (!selectResult.error && selectResult.streams.length > 0) {
            const streamUrl = selectResult.streams[0].streamUrl;
            setAlternativeStreams(selectResult.streams);
            setCurrentStreamId(selectResult.streams[0].id);

            await saveFileMapping({
              track: enrichedTrack,
              torrentId: torrent.torrentId,
              torrentTitle: torrent.title,
              fileId: matchingFile.id,
              fileName: matchingFile.filename,
              filePath: matchingFile.path,
              directLink: streamUrl,
            });

            if (audioRef.current && streamUrl) {
              audioRef.current.src = streamUrl;
              if (await safePlay(audioRef.current)) {
                setState((prev) => ({ ...prev, isPlaying: true }));
              }
            }

            setLoadingPhase('idle');
            setIsSearchingStreams(false);
            setCurrentAudioSource('real-debrid');
            startTrackingPlayback();
            return;
          }

          if (!selectResult.error && ['downloading', 'queued', 'magnet_conversion'].includes(selectResult.status)) {
            setLoadingPhase('downloading');
            setDownloadProgress(selectResult.progress ?? null);
            setDownloadStatus(selectResult.status);
            setIsSearchingStreams(false);
            startTrackingPlayback();
            return;
          }
        }

        setLoadingPhase('unavailable');
        setIsSearchingStreams(false);
        toast.error('Nessuna sorgente trovata', {
          description: 'Passo alla prossima...',
        });
        autoSkipToNext();
      } catch (error) {
        setLoadingPhase('unavailable');
        setIsSearchingStreams(false);
        addDebugLog('❌ Errore ricerca', error instanceof Error ? error.message : 'Errore', 'error');
        autoSkipToNext();
      } finally {
        setIsSearchingStreams(false);
      }
    },
    [
      audioSourceMode,
      addDebugLog,
      clearDebugLogs,
      credentials,
      safePlay,
      saveFileMapping,
      tryUnlockAudioFromUserGesture,
      user,
    ]
  );

  const selectStream = useCallback(
    async (stream: StreamResult) => {
      setCurrentStreamId(stream.id);
      setDownloadProgress(null);
      setDownloadStatus(null);

      if (audioRef.current && stream.streamUrl) {
        audioRef.current.src = stream.streamUrl;
        audioRef.current.currentTime = 0;
        if (await safePlay(audioRef.current)) {
          setState((prev) => ({ ...prev, isPlaying: true }));
        }
      }

      addDebugLog('Stream selezionato', `Riproduco: ${stream.title}`, 'success');
    },
    [addDebugLog, safePlay]
  );

  const selectTorrentFile = useCallback(
    async (torrentId: string, fileIds: number[]) => {
      if (!credentials?.realDebridApiKey || !state.currentTrack) return;

      setLoadingPhase('loading');
      const result = await selectFilesAndPlay(credentials.realDebridApiKey, torrentId, fileIds);

      if (result.error || result.status === 'error') {
        setLoadingPhase('unavailable');
        toast.error('Errore selezione file');
        return;
      }

      setAlternativeStreams(result.streams);
      if (result.streams.length > 0) {
        setCurrentStreamId(result.streams[0].id);

        const streamUrl = result.streams[0].streamUrl;
        if (audioRef.current && streamUrl) {
          audioRef.current.src = streamUrl;
          if (await safePlay(audioRef.current)) {
            setState((prev) => ({ ...prev, isPlaying: true }));
          }
        }

        // Save mapping (best-effort: we don't know exact file name/path here)
        await saveFileMapping({
          track: state.currentTrack,
          torrentId,
          fileId: fileIds[0],
          directLink: streamUrl,
        });

        setLoadingPhase('idle');
        return;
      }

      // Downloading
      if (['downloading', 'queued', 'magnet_conversion'].includes(result.status)) {
        setDownloadProgress(result.progress ?? null);
        setDownloadStatus(result.status);
        setLoadingPhase('downloading');
      } else {
        setLoadingPhase('idle');
      }
    },
    [credentials, safePlay, saveFileMapping, state.currentTrack]
  );

  const refreshTorrent = useCallback(
    async (torrentId: string) => {
      if (!credentials?.realDebridApiKey) return;
      const result = await checkTorrentStatus(credentials.realDebridApiKey, torrentId);
      setAvailableTorrents((prev) =>
        prev.map((t) => (t.torrentId === torrentId ? { ...t, ...result } : t))
      );
    },
    [credentials]
  );

  const manualSearch = useCallback(
    async (query: string) => {
      if (!credentials?.realDebridApiKey) {
        toast.error('Real-Debrid non configurato');
        return;
      }

      setLastSearchQuery(query);
      setIsSearchingStreams(true);
      setLoadingPhase('searching');
      setAlternativeStreams([]);
      setAvailableTorrents([]);
      setDownloadProgress(null);
      setDownloadStatus(null);

      addDebugLog('🔎 Ricerca torrent', `Query: "${query}"`, 'info');

      try {
        const result = await searchStreams(credentials.realDebridApiKey, query);
        setAvailableTorrents(result.torrents);
        setAlternativeStreams(result.streams || []);

        if (result.streams?.length) {
          const first = result.streams[0];
          setCurrentStreamId(first.id);
          if (audioRef.current && first.streamUrl) {
            setLoadingPhase('loading');
            audioRef.current.src = first.streamUrl;
            if (await safePlay(audioRef.current)) {
              setState((prev) => ({ ...prev, isPlaying: true }));
            }
            setLoadingPhase('idle');
          }
        } else {
          setLoadingPhase('idle');
        }
      } catch (error) {
        setLoadingPhase('unavailable');
        addDebugLog('❌ Errore ricerca', error instanceof Error ? error.message : 'Errore', 'error');
      } finally {
        setIsSearchingStreams(false);
      }
    },
    [addDebugLog, credentials, safePlay]
  );

  const play = useCallback(
    (track?: Track) => {
      if (track) {
        playTrack(track);
      } else if (audioRef.current) {
        safePlay(audioRef.current).then((success) => {
          if (success) setState((prev) => ({ ...prev, isPlaying: true }));
        });
      } else {
        setState((prev) => ({ ...prev, isPlaying: true }));
      }
    },
    [playTrack, safePlay]
  );

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setState((prev) => ({ ...prev, isPlaying: false }));
  }, []);

  const toggle = useCallback(() => {
    if (state.isPlaying) pause();
    else play();
  }, [pause, play, state.isPlaying]);

  const seek = useCallback((time: number) => {
    if (audioRef.current) audioRef.current.currentTime = time;
    setState((prev) => ({ ...prev, progress: time }));
  }, []);

  const setVolume = useCallback((volume: number) => {
    if (audioRef.current) audioRef.current.volume = volume;
    setState((prev) => ({ ...prev, volume }));
  }, []);

  const addToQueue = useCallback((tracks: Track[]) => {
    setState((prev) => ({ ...prev, queue: [...prev.queue, ...tracks] }));
  }, []);

  const clearQueue = useCallback(() => {
    setState((prev) => ({ ...prev, queue: [], queueIndex: 0 }));
    originalQueueRef.current = [];
    setIsShuffled(false);
  }, []);

  const reorderQueue = useCallback((fromIndex: number, toIndex: number) => {
    setState((prev) => {
      // Convert from "upNext" indices (relative to currentIndex + 1) to actual queue indices
      const actualFromIndex = prev.queueIndex + 1 + fromIndex;
      const actualToIndex = prev.queueIndex + 1 + toIndex;
      
      if (actualFromIndex >= prev.queue.length || actualToIndex >= prev.queue.length) return prev;
      
      const newQueue = [...prev.queue];
      const [movedItem] = newQueue.splice(actualFromIndex, 1);
      newQueue.splice(actualToIndex, 0, movedItem);
      
      // Also update original queue ref if not shuffled
      if (!isShuffled) {
        originalQueueRef.current = newQueue;
      }
      
      return { ...prev, queue: newQueue };
    });
  }, [isShuffled]);

  const shuffleArray = <T,>(array: T[]): T[] => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  const toggleShuffle = useCallback(() => {
    setState((prev) => {
      if (isShuffled) {
        const current = prev.queue[prev.queueIndex];
        const originalQueue = originalQueueRef.current;
        const newIndex = originalQueue.findIndex((t) => t.id === current?.id);
        return {
          ...prev,
          queue: originalQueue,
          queueIndex: newIndex >= 0 ? newIndex : 0,
        };
      }

      const current = prev.queue[prev.queueIndex];
      const otherTracks = prev.queue.filter((_, i) => i !== prev.queueIndex);
      const shuffledOthers = shuffleArray(otherTracks);
      const newQueue = current ? [current, ...shuffledOthers] : shuffledOthers;
      originalQueueRef.current = prev.queue;

      return {
        ...prev,
        queue: newQueue,
        queueIndex: 0,
      };
    });

    setIsShuffled((prev) => !prev);
  }, [isShuffled]);

  const playQueueIndex = useCallback(
    (index: number) => {
      if (index < 0 || index >= state.queue.length) return;
      const track = state.queue[index];
      playTrack(track, state.queue, index);
    },
    [playTrack, state.queue]
  );

  // Track all played track IDs to avoid repetition in autoplay
  const playedTrackIdsRef = useRef<Set<string>>(new Set());
  
  // Update played tracks when track changes
  useEffect(() => {
    if (state.currentTrack?.id) {
      playedTrackIdsRef.current.add(state.currentTrack.id);
    }
  }, [state.currentTrack?.id]);

  // Update playback source when track changes - look up which playlist/album contains it
  useEffect(() => {
    const updateSourceForTrack = async () => {
      if (!state.currentTrack?.id || !user?.id) return;
      
      // Skip auto-lookup if source was manually set (e.g. from Library, Home, Playlist page)
      if (manualSourceRef.current) {
        manualSourceRef.current = false;
        return;
      }
      
      try {
        // Check if the track is in any user playlist
        const { data: playlistTrack } = await supabase
          .from('playlist_tracks')
          .select('playlist_id, playlists!inner(id, name)')
          .eq('track_id', state.currentTrack.id)
          .limit(1)
          .maybeSingle();
        
        if (playlistTrack && playlistTrack.playlists) {
          const pl = playlistTrack.playlists as any;
          setPlaybackSourceInternal({
            type: 'playlist',
            name: pl.name || null,
            path: `/playlist/${pl.id}`,
          });
          return;
        }

        // If track has albumId, show album as source
        if (state.currentTrack.albumId) {
          setPlaybackSourceInternal({
            type: 'album',
            name: state.currentTrack.album || null,
            path: `/album/${state.currentTrack.albumId}`,
          });
          return;
        }

        // Fallback: show artist as source
        if (state.currentTrack.artistId) {
          setPlaybackSourceInternal({
            type: 'artist',
            name: state.currentTrack.artist || null,
            path: `/artist/${state.currentTrack.artistId}`,
          });
        }
      } catch (err) {
        console.warn('Failed to update playback source:', err);
      }
    };

    updateSourceForTrack();
  }, [state.currentTrack?.id, user?.id]);
  
  // Fetch similar tracks - mix of same artists from queue + related artists
  const fetchSimilarTracks = useCallback(async (currentTrack: Track): Promise<Track[]> => {
    try {
      // Collect all played and queued track IDs to avoid
      const avoidIds = new Set([
        ...playedTrackIdsRef.current,
        ...state.queue.map(t => t.id),
        currentTrack.id
      ]);
      
      // Get unique artists from the entire queue for variety
      const queueArtists = [...new Set(state.queue.map(t => ({ 
        id: t.artistId || '', 
        name: t.artist 
      })).filter(a => a.id))];
      
      // Shuffle artists and pick up to 3 different ones
      const shuffledArtists = queueArtists
        .sort(() => Math.random() - 0.5)
        .slice(0, 3);
      
      const allTracks: Track[] = [];
      const seenTrackIds = new Set<string>();
      
      // 1. Get tracks from artists in the queue (variety)
      for (const artist of shuffledArtists) {
        try {
          const artistTracks = await getArtistTopTracks(artist.id);
          for (const track of artistTracks) {
            if (!avoidIds.has(track.id) && !seenTrackIds.has(track.id)) {
              allTracks.push(track);
              seenTrackIds.add(track.id);
            }
          }
        } catch (e) {
          console.log('[Autoplay] Failed to get tracks for artist:', artist.name, e);
        }
      }
      
      // 2. Add more from current artist if we don't have enough
      if (allTracks.length < 15 && currentTrack.artistId) {
        try {
          const currentArtistTracks = await getArtistTopTracks(currentTrack.artistId);
          for (const track of currentArtistTracks) {
            if (!avoidIds.has(track.id) && !seenTrackIds.has(track.id)) {
              allTracks.push(track);
              seenTrackIds.add(track.id);
            }
          }
        } catch (e) {
          console.log('[Autoplay] Failed to get current artist tracks:', e);
        }
      }
      
      // 3. Search for related tracks by genre/style if still not enough
      if (allTracks.length < 10) {
        try {
          // Search by current artist name to find related tracks
          const searchResults = await searchTracks(currentTrack.artist);
          for (const track of searchResults) {
            if (!avoidIds.has(track.id) && !seenTrackIds.has(track.id)) {
              allTracks.push(track);
              seenTrackIds.add(track.id);
              if (allTracks.length >= 20) break;
            }
          }
        } catch (e) {
          console.log('[Autoplay] Search failed:', e);
        }
      }
      
      // Shuffle final result for variety
      const shuffled = allTracks.sort(() => Math.random() - 0.5);
      console.log('[Autoplay] Found', shuffled.length, 'unique tracks for autoplay');
      
      return shuffled.slice(0, 15);
    } catch (error) {
      console.error('[Autoplay] Failed to fetch similar tracks:', error);
      return [];
    }
  }, [state.queue]);

  // Use refs to always have the latest queue state for async operations
  const queueRef = useRef(state.queue);
  const queueIndexRef = useRef(state.queueIndex);
  const currentTrackRef = useRef(state.currentTrack);
  
  useEffect(() => {
    queueRef.current = state.queue;
    queueIndexRef.current = state.queueIndex;
    currentTrackRef.current = state.currentTrack;
  }, [state.queue, state.queueIndex, state.currentTrack]);

  // Internal play: advances within existing queue without resetting it
  const playTrackInternal = useCallback(async (track: Track, index: number) => {
    // Save listening stats for previous track
    if (lastSavedTrackRef.current && audioRef.current) {
      const { track: prevTrack, startTime } = lastSavedTrackRef.current;
      const actualSecondsListened = Math.round((Date.now() - startTime) / 1000);
      if (actualSecondsListened >= 10) {
        saveRecentlyPlayedTrack(prevTrack, user?.id, actualSecondsListened);
        if (user?.id) {
          updateListeningStats(prevTrack, user.id, actualSecondsListened);
        }
      }
      lastSavedTrackRef.current = null;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }

    currentSearchTrackIdRef.current = track.id;

    // Update state: currentTrack + queueIndex, but do NOT touch queue
    setState((prev) => ({
      ...prev,
      currentTrack: track,
      isPlaying: true,
      queueIndex: index,
      duration: track.duration,
      progress: 0,
    }));

    updateMediaSessionMetadata(track, true);

    // Clear prefetch
    prefetchedNextUrlRef.current = null;
    prefetchedTrackIdRef.current = null;

    // Now resolve the audio source (same logic as playTrack but without queue setup)
    const enrichedTrack = track;

    clearDebugLogs();
    setAlternativeStreams([]);
    setAvailableTorrents([]);
    setCurrentStreamId(undefined);
    setDownloadProgress(null);
    setDownloadStatus(null);
    setLoadingPhase('idle');
    setCurrentAudioSource(null);

    // Check offline first
    const offlineUrl = await getOfflineTrackUrl(enrichedTrack.id);
    if (offlineUrl && audioRef.current) {
      audioRef.current.src = offlineUrl;
      if (await safePlay(audioRef.current)) {
        setState((prev) => ({ ...prev, isPlaying: true }));
        setLoadingPhase('idle');
        setCurrentAudioSource('offline');
        lastSavedTrackRef.current = { track: enrichedTrack, startTime: Date.now() };
        return;
      }
    }

    // Check prefetched URL
    const prefetched = prefetchedNextUrlRef.current;
    if (prefetched && prefetched.trackId === enrichedTrack.id && prefetched.url && audioRef.current) {
      console.log('[Queue] Using prefetched URL for:', enrichedTrack.title);
      audioRef.current.src = prefetched.url;
      prefetchedNextUrlRef.current = null;
      prefetchedTrackIdRef.current = null;
      if (await safePlay(audioRef.current)) {
        setState((prev) => ({ ...prev, isPlaying: true }));
        setLoadingPhase('idle');
        setCurrentAudioSource(prefetched.source);
        lastSavedTrackRef.current = { track: enrichedTrack, startTime: Date.now() };
        return;
      }
    }

    // Delegate to full playTrack for source resolution (but keep the queue!)
    // We need to call the source resolution logic - reuse playTrack with current queue
    const currentQueue = queueRef.current;
    playTrack(enrichedTrack, currentQueue, index);
  }, [clearDebugLogs, playTrack, safePlay, user]);

  const next = useCallback(async () => {
    const currentQueue = queueRef.current;
    const currentIndex = queueIndexRef.current;
    const currentTrack = currentTrackRef.current;
    const nextIndex = currentIndex + 1;
    
    console.log('[Queue] next() called - currentIndex:', currentIndex, 'nextIndex:', nextIndex, 'queueLength:', currentQueue.length);
    
    if (nextIndex < currentQueue.length) {
      const nextTrack = currentQueue[nextIndex];
      console.log('[Queue] Playing next track:', nextTrack.title, 'at index', nextIndex);
      playTrackInternal(nextTrack, nextIndex);
    } else if (currentTrack) {
      // End of queue - fetch similar tracks
      console.log('[Autoplay] Queue ended, fetching similar tracks...');
      addDebugLog('🔄 Autoplay', 'Carico brani simili...', 'info');
      
      try {
        const similarTracks = await fetchSimilarTracks(currentTrack);
        if (similarTracks.length > 0) {
          const latestQueue = queueRef.current;
          const newQueue = [...latestQueue, ...similarTracks];
          const newIndex = latestQueue.length;
          
          console.log('[Autoplay] Adding', similarTracks.length, 'tracks, playing at index', newIndex);
          
          // For autoplay, use playTrack to set the new expanded queue
          playTrack(similarTracks[0], newQueue, newIndex);
          addDebugLog('✅ Autoplay avviato', `${similarTracks.length} brani aggiunti`, 'success');
        } else {
          addDebugLog('ℹ️ Autoplay', 'Nessun brano simile trovato', 'info');
        }
      } catch (error) {
        console.error('[Autoplay] Error:', error);
        addDebugLog('❌ Autoplay fallito', error instanceof Error ? error.message : 'Errore', 'error');
      }
    }
  }, [addDebugLog, fetchSimilarTracks, playTrack, playTrackInternal]);

  const previous = useCallback(() => {
    if (state.progress > 3) {
      seek(0);
      return;
    }

    const currentQueue = queueRef.current;
    const currentIndex = queueIndexRef.current;
    const prevIndex = currentIndex - 1;
    
    console.log('[Queue] previous() called - currentIndex:', currentIndex, 'prevIndex:', prevIndex);
    
    if (prevIndex >= 0) {
      const prevTrack = currentQueue[prevIndex];
      console.log('[Queue] Playing previous track:', prevTrack.title, 'at index', prevIndex);
      playTrackInternal(prevTrack, prevIndex);
    }
  }, [playTrackInternal, seek, state.progress]);

  // Keep refs updated for Media Session handlers
  useEffect(() => {
    nextRef.current = next;
    previousRef.current = previous;
  }, [next, previous]);

  // Pre-fetch next track URL (simplified - no event system, just pre-resolve URL)
  useEffect(() => {
    if (!state.currentTrack || !state.isPlaying) return;
    
    const currentQueue = queueRef.current;
    const currentIndex = queueIndexRef.current;
    const nextIndex = currentIndex + 1;
    
    if (nextIndex >= currentQueue.length) return;
    
    const nextTrack = currentQueue[nextIndex];
    if (!nextTrack) return;
    if (prefetchedTrackIdRef.current === nextTrack.id) return;
    
    const prefetchTimeout = setTimeout(async () => {
      if (isPrefetchingRef.current) return;
      isPrefetchingRef.current = true;
      
      try {
        // Check saved RD mapping
        if (nextTrack.albumId) {
          const { data: trackMapping } = await supabase
            .from('track_file_mappings')
            .select('direct_link')
            .eq('track_id', nextTrack.id)
            .maybeSingle();
          
          if (trackMapping?.direct_link) {
            prefetchedNextUrlRef.current = { trackId: nextTrack.id, url: trackMapping.direct_link, source: 'real-debrid' };
            prefetchedTrackIdRef.current = nextTrack.id;
            console.log('[Prefetch] Cached RD link for:', nextTrack.title);
            isPrefetchingRef.current = false;
            return;
          }
        }
        
        // Try selected scraping source
        const tidalQuality = mapQualityToTidal(settings.audioQuality);
        const streamFn = selectedScrapingSource === 'monochrome' ? getMonochromeStream : getTidalStream;
        const sourceLabel: AudioSource = selectedScrapingSource === 'monochrome' ? 'monochrome' : 'squidwtf';
        const result = await streamFn(nextTrack.title, nextTrack.artist, tidalQuality);
        
        if ('streamUrl' in result && result.streamUrl) {
          prefetchedNextUrlRef.current = { trackId: nextTrack.id, url: result.streamUrl, source: sourceLabel };
          prefetchedTrackIdRef.current = nextTrack.id;
          console.log(`[Prefetch] ${sourceLabel} URL ready for:`, nextTrack.title);
        }
      } catch (error) {
        console.log('[Prefetch] Error:', error);
      } finally {
        isPrefetchingRef.current = false;
      }
    }, 3000);
    
    return () => clearTimeout(prefetchTimeout);
  }, [state.currentTrack?.id, state.isPlaying, settings.audioQuality]);

  // Note: Media Session next/previous handlers are set up in the audio initialization useEffect

  // Auto-poll downloading torrents (kept, without YouTube interplay)
  useEffect(() => {
    if (loadingPhase !== 'downloading' || availableTorrents.length === 0) return;
    if (!credentials?.realDebridApiKey) return;

    const downloadingTorrents = availableTorrents.filter((t) =>
      ['downloading', 'queued', 'magnet_conversion'].includes(t.status)
    );

    if (downloadingTorrents.length === 0) return;

    const startTime = Date.now();

    const pollInterval = setInterval(async () => {
      for (const torrent of downloadingTorrents) {
        try {
          const result = await checkTorrentStatus(credentials.realDebridApiKey, torrent.torrentId);

          if (['error', 'dead', 'magnet_error'].includes(result.status)) {
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

          if (['downloading', 'queued', 'magnet_conversion'].includes(result.status)) {
            setDownloadProgress(result.progress);
            setDownloadStatus(result.status);

            const elapsedSeconds = (Date.now() - startTime) / 1000;
            if (result.progress === 0 && elapsedSeconds >= 10) {
              addDebugLog('⏱️ Timeout', `Download fermo a 0% per ${Math.round(elapsedSeconds)}s`, 'error');
              setLoadingPhase('unavailable');
              setDownloadProgress(null);
              setDownloadStatus(null);
              toast.error('File al momento non disponibile', {
                description: 'Il download non è partito. Pochi seeders o torrent non valido.',
              });
              clearInterval(pollInterval);
              return;
            }
          }

          if (result.streams.length > 0) {
            const streamUrl = result.streams[0].streamUrl;
            setAlternativeStreams(result.streams);
            setCurrentStreamId(result.streams[0].id);
            setDownloadProgress(null);
            setDownloadStatus(null);
            setLoadingPhase('idle');

            if (audioRef.current && streamUrl) {
              audioRef.current.src = streamUrl;
              safePlay(audioRef.current).then((success) => {
                if (success) setState((prev) => ({ ...prev, isPlaying: true }));
              });
            }

            clearInterval(pollInterval);
            return;
          }
        } catch (error) {
          console.error('Poll error:', error);
        }
      }
    }, 1000);

    return () => clearInterval(pollInterval);
  }, [addDebugLog, availableTorrents, credentials, loadingPhase]);

  // Pre-sync next track in queue (kept behavior)
  useEffect(() => {
    if (!credentials?.realDebridApiKey) return;
    if (!state.currentTrack || !state.isPlaying) return;

    const currentAlbumId = state.currentTrack.albumId;
    const nextIndex = state.queueIndex + 1;
    if (nextIndex >= state.queue.length) return;

    const nextTrack = state.queue[nextIndex];
    if (!nextTrack) return;

    const preSyncNextTrack = async () => {
      const { data: existingMapping } = await supabase
        .from('track_file_mappings')
        .select('id')
        .eq('track_id', nextTrack.id)
        .maybeSingle();

      if (existingMapping) return;

      addSyncingTrack(nextTrack.id);

      try {
        if (nextTrack.albumId === currentAlbumId) {
          // Cache reuse logic could go here if needed
        }

        if (nextTrack.album?.trim() && nextTrack.artist?.trim()) {
          const result = await searchStreams(credentials.realDebridApiKey, `${nextTrack.album} ${nextTrack.artist}`);

          for (const torrent of result.torrents) {
            if (!torrent.files?.length) continue;
            const matchingFile = torrent.files.find((file) =>
              flexibleMatch(file.filename || '', nextTrack.title) || flexibleMatch(file.path || '', nextTrack.title)
            );
            if (!matchingFile) continue;

            const selectResult = await selectFilesAndPlay(credentials.realDebridApiKey, torrent.torrentId, [matchingFile.id]);
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

              removeSyncingTrack(nextTrack.id);
              if (directLink) addSyncedTrack(nextTrack.id);
              return;
            }
          }
        }

        removeSyncingTrack(nextTrack.id);
      } catch (error) {
        console.log('Pre-sync failed for next track:', error);
        removeSyncingTrack(nextTrack.id);
      }
    };

    const timeout = setTimeout(preSyncNextTrack, 3000);
    return () => clearTimeout(timeout);
  }, [credentials, saveFileMapping, state.currentTrack, state.isPlaying, state.queue, state.queueIndex]);

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
        reorderQueue,
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
        lastSearchQuery,
        isShuffled,
        toggleShuffle,
        currentAudioSource,
        playbackSource,
        setPlaybackSource,
        updateTrackMetadata,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
};

export const usePlayer = () => {
  const context = useContext(PlayerContext);
  if (!context) throw new Error('usePlayer must be used within a PlayerProvider');
  return context;
};
