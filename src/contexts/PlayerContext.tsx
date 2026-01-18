// PlayerContext - Audio playback state management (v2.3 - AudioContext Crossfade)
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
import { useIOSAudioSession, isIOS, isPWA } from '@/hooks/useIOSAudioSession';
import { useCrossfade } from '@/hooks/useCrossfade';
import { useQueuePrefetch, type QueuePrefetchState } from '@/hooks/useQueuePrefetch';

import {
  type AudioFile,
  type StreamResult,
  type TorrentInfo,
  checkTorrentStatus,
  searchStreams,
  selectFilesAndPlay,
} from '@/lib/realdebrid';

import { getTidalStream, mapQualityToTidal } from '@/lib/tidal';
import { searchTracks, getArtistTopTracks } from '@/lib/deezer';
import { saveRecentlyPlayedTrack } from '@/hooks/useRecentlyPlayed';
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
export type AudioSource = 'tidal' | 'real-debrid' | 'offline' | null;

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

  lastSearchQuery: string | null;

  isShuffled: boolean;
  toggleShuffle: () => void;
  
  currentAudioSource: AudioSource;
  
  updateTrackMetadata: (oldTrackId: string, newData: { id: string; title: string; artist: string; album?: string; coverUrl?: string; duration?: number }) => void;
  
  // Queue prefetch state for iOS
  queuePrefetchState: QueuePrefetchState;
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
  // DUAL AUDIO SYSTEM: Two audio elements for gapless crossfade
  // audioRef = currently playing, nextAudioRef = preloaded next track
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const nextAudioRef = useRef<HTMLAudioElement | null>(null);
  const crossfadeInProgressRef = useRef(false);
  const crossfadeTriggeredForTrackRef = useRef<string | null>(null);
  
  const { credentials, user } = useAuth();
  const { audioSourceMode, settings } = useSettings();
  // iOS audio session management (uses only refs internally)
  const iosAudio = useIOSAudioSession();
  
  // AudioContext-based crossfade for iOS (new system)
  const crossfade = useCrossfade();
  const crossfadeRef = useRef(crossfade);
  const usingAudioContextCrossfadeRef = useRef(false);
  
  // Queue prefetch for iOS background playback
  const queuePrefetch = useQueuePrefetch();
  
  // Keep crossfadeRef updated
  useEffect(() => {
    crossfadeRef.current = crossfade;
  }, [crossfade]);

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
      console.log('[PlayerContext] safePlay called, audio.paused:', audio.paused, 'readyState:', audio.readyState);
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        await playPromise;
      }
      console.log('[PlayerContext] safePlay SUCCESS');
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
          console.log('[PlayerContext] Autoplay blocked - syncing state to paused');
          // CRITICAL: Sync state with reality when autoplay is blocked
          setState((prev) => ({ ...prev, isPlaying: false }));
          return false;
        }
      }
      console.error('[PlayerContext] Play error:', error);
      // Sync state with reality on any error
      setState((prev) => ({ ...prev, isPlaying: false }));
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
  // Works with both HTMLAudioElement and AudioContext crossfade
  useEffect(() => {
    if (!('mediaSession' in navigator) || !state.currentTrack) return;
    
    try {
      // When using AudioContext crossfade, get duration from crossfade hook
      const isUsingAudioContext = usingAudioContextCrossfadeRef.current;
      const duration = isUsingAudioContext 
        ? (crossfade.getCurrentDuration?.() || state.duration || 0)
        : (state.duration || 0);
      const position = Math.min(state.progress, duration);
      
      navigator.mediaSession.setPositionState({
        duration: duration > 0 ? duration : 1, // Prevent 0 duration which can cause issues
        playbackRate: 1,
        position: position >= 0 ? position : 0,
      });
    } catch (e) {
      // Ignore errors on browsers that don't support setPositionState
    }
  }, [state.progress, state.duration, state.currentTrack, crossfade]);

  // Store iosAudio in a ref to avoid dependency issues
  const iosAudioRef = useRef(iosAudio);
  iosAudioRef.current = iosAudio;

  // iOS: during the last seconds of a track, iOS can drop the audio session while we swap src.
  // We run a short "transition keep-alive" window: from ~5s before end to ~5s after next starts.
  const transitionKeepAliveIntervalRef = useRef<number | null>(null);
  const transitionStopTimeoutRef = useRef<number | null>(null);
  const transitionArmedRef = useRef(false);

  const stopTransitionKeepAlive = useCallback(() => {
    if (transitionKeepAliveIntervalRef.current) {
      window.clearInterval(transitionKeepAliveIntervalRef.current);
      transitionKeepAliveIntervalRef.current = null;
    }
    if (transitionStopTimeoutRef.current) {
      window.clearTimeout(transitionStopTimeoutRef.current);
      transitionStopTimeoutRef.current = null;
    }
    transitionArmedRef.current = false;
  }, []);

  // iOS background playback keep-alive interval
  // Calls keepAlive every 10 seconds during playback to maintain audio session
  useEffect(() => {
    if (!state.isPlaying) return;

    // Call keepAlive immediately when playback starts
    iosAudio.keepAlive();

    // Then call every 10 seconds during playback
    const intervalId = setInterval(() => {
      iosAudio.keepAlive();
    }, 10000);

    return () => clearInterval(intervalId);
  }, [state.isPlaying, iosAudio]);

  // App lifecycle instrumentation (helps debug iOS/PWA background behaviour)
  // IMPORTANT: attach listeners once to avoid duplicated logs.
  const lifecycleRef = useRef({
    isPlaying: false,
    queueIndex: 0,
    track: null as Track | null,
  });

  useEffect(() => {
    lifecycleRef.current = {
      isPlaying: state.isPlaying,
      queueIndex: state.queueIndex,
      track: state.currentTrack,
    };
  }, [state.isPlaying, state.queueIndex, state.currentTrack]);

  // Crossfade enabled ref (synced with settings for use in event handlers)
  const crossfadeEnabledRef = useRef(settings.crossfadeEnabled);
  // Crossfade is AUTOMATICALLY enabled on iOS, regardless of manual setting
  // On other platforms, it respects the user's setting
  useEffect(() => {
    const isIOSDevice = isIOS();
    crossfadeEnabledRef.current = isIOSDevice || settings.crossfadeEnabled;
    
    if (isIOSDevice) {
      console.log('[PlayerContext] Crossfade auto-enabled on iOS device');
    }
  }, [settings.crossfadeEnabled]);

  useEffect(() => {
    const getMediaSessionSnapshot = () => {
      if (!('mediaSession' in navigator)) return null;
      const ms = navigator.mediaSession;
      const md: any = ms.metadata as any;
      return {
        playbackState: ms.playbackState,
        title: md?.title ?? null,
        artist: md?.artist ?? null,
      };
    };

    const snapshot = (eventName: string, extra?: Record<string, unknown>) => {
      const audio = audioRef.current;
      const { isPlaying, queueIndex, track } = lifecycleRef.current;

      const details = {
        ts: new Date().toISOString(),
        event: eventName,
        visibility: document.visibilityState,
        isPlayingState: isPlaying,
        queueIndex,
        trackId: track?.id ?? null,
        trackTitle: track?.title ?? null,
        audio: audio
          ? {
              paused: audio.paused,
              ended: audio.ended,
              readyState: audio.readyState,
              networkState: audio.networkState,
              currentTime: Number(audio.currentTime.toFixed(3)),
              duration: Number((audio.duration || 0).toFixed(3)),
              src: audio.currentSrc || audio.src || null,
              errorCode: audio.error?.code ?? null,
            }
          : null,
        mediaSession: getMediaSessionSnapshot(),
        ...extra,
      };

      iosAudioRef.current.addLog('info', '[AppLifecycle]', JSON.stringify(details));
    };

    const syncFromAudio = (reason: string) => {
      const audio = audioRef.current;
      if (!audio) return;

      // readyState > 2 means we have current data, helps avoid false positives right after src swap
      const actuallyPlaying = !audio.paused && !audio.ended && audio.readyState > 2;
      const { isPlaying, track } = lifecycleRef.current;

      snapshot('sync', { reason, actuallyPlaying, isPlayingState: isPlaying });

      if (isPlaying !== actuallyPlaying) {
        setState((prev) => ({ ...prev, isPlaying: actuallyPlaying }));
      }

      // Refresh widget state (best effort)
      updateMediaSessionMetadata(track, actuallyPlaying);
    };

    const handleVisibilityChange = () => {
      snapshot('visibilitychange');
      if (document.visibilityState === 'visible') syncFromAudio('visibilitychange-visible');
    };

    const handlePageHide = (e: PageTransitionEvent) => {
      snapshot('pagehide', { persisted: e.persisted });
    };

    const handlePageShow = (e: PageTransitionEvent) => {
      snapshot('pageshow', { persisted: e.persisted });
      syncFromAudio('pageshow');
    };

    const handleFocus = () => {
      snapshot('focus');
      syncFromAudio('focus');
    };

    const handleBlur = () => {
      snapshot('blur');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);


  useEffect(() => {
    // Create PRIMARY audio element
    audioRef.current = new Audio();
    audioRef.current.volume = state.volume;
    audioRef.current.setAttribute('playsinline', '');
    audioRef.current.setAttribute('webkit-playsinline', '');

    // Create SECONDARY audio element for crossfade
    nextAudioRef.current = new Audio();
    nextAudioRef.current.volume = 0; // Start silent for crossfade
    nextAudioRef.current.setAttribute('playsinline', '');
    nextAudioRef.current.setAttribute('webkit-playsinline', '');

    // Note: Dummy audio removed - the existing iOS audio session keep-alive handles this
    
    const audio = audioRef.current;
    const nextAudio = nextAudioRef.current;

    // CROSSFADE TRANSITION: Start crossfade 10s before end
    // This avoids relying on `ended` event which can fail when JS is suspended
    // Only active when settings.crossfadeEnabled is true (checked via crossfadeEnabledRef)
    const CROSSFADE_START_SECONDS = 10;
    const CROSSFADE_DURATION_MS = 3000; // 3 second crossfade

    const performCrossfade = async (nextTrackId: string) => {
      if (crossfadeInProgressRef.current) return;
      crossfadeInProgressRef.current = true;

      const prefetched = prefetchedNextUrlRef.current;
      if (!prefetched || prefetched.trackId !== nextTrackId) {
        console.log('[Crossfade] No prefetched URL, falling back to normal next()');
        crossfadeInProgressRef.current = false;
        // Don't call next() here - let ended handler do it
        return;
      }

      console.log('[Crossfade] Starting crossfade transition');
      iosAudioRef.current.addLog('info', '[Crossfade]', 'Starting crossfade');

      // Keep iOS session alive during transition
      iosAudioRef.current.keepAlive({ force: true });

      // Load next track into secondary audio
      nextAudio.src = prefetched.url;
      nextAudio.volume = 0;
      
      try {
        await nextAudio.play();
        console.log('[Crossfade] Next audio playing (volume 0)');
        
        // Perform crossfade over CROSSFADE_DURATION_MS
        const fadeSteps = 30;
        const stepDuration = CROSSFADE_DURATION_MS / fadeSteps;
        
        for (let i = 1; i <= fadeSteps; i++) {
          await new Promise(resolve => setTimeout(resolve, stepDuration));
          const progress = i / fadeSteps;
          
          // Fade out current, fade in next
          if (audio) audio.volume = Math.max(0, state.volume * (1 - progress));
          if (nextAudio) nextAudio.volume = state.volume * progress;
        }

        console.log('[Crossfade] Crossfade complete, swapping audio elements');
        
        // Stop old audio
        audio.pause();
        audio.src = '';

        // Swap references: nextAudio becomes the new primary
        // Copy src to primary element and stop secondary
        audio.src = nextAudio.src;
        audio.volume = state.volume;
        audio.currentTime = nextAudio.currentTime;
        
        // Transfer playback to primary
        try {
          await audio.play();
          nextAudio.pause();
          nextAudio.src = '';
          nextAudio.volume = 0;
        } catch (e) {
          console.log('[Crossfade] Swap failed, keeping nextAudio as primary');
          // nextAudio is already playing, that's fine
        }

        // Update state for next track
        const stateRef = lifecycleRef.current;
        const nextIndex = stateRef.queueIndex + 1;
        
        // Clear prefetch refs
        prefetchedNextUrlRef.current = null;
        prefetchedTrackIdRef.current = null;
        crossfadeTriggeredForTrackRef.current = null;

        // Trigger state update via custom event (will be handled in next effect)
        window.dispatchEvent(new CustomEvent('crossfade-complete', { 
          detail: { nextIndex, source: prefetched.source } 
        }));

        iosAudioRef.current.addLog('info', '[Crossfade]', 'Complete');
        
        // Start prefetching the NEXT next track
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('prefetch-next-track'));
        }, 3000);

      } catch (error) {
        console.log('[Crossfade] Failed:', error);
        iosAudioRef.current.addLog('error', '[Crossfade]', `Failed: ${error}`);
        // Reset and let ended handler take over
        nextAudio.pause();
        nextAudio.src = '';
        nextAudio.volume = 0;
      } finally {
        crossfadeInProgressRef.current = false;
      }
    };

    // Enhanced time update handler with crossfade logic
    const handleTimeUpdate = () => {
      const currentTime = audio.currentTime;
      const duration = audio.duration;

      setState((prev) => ({ ...prev, progress: currentTime }));

      // iOS/PWA: "bridge" keep-alive during track transition window.
      if (duration && Number.isFinite(duration) && duration > 0) {
        const remaining = duration - currentTime;
        
        // Keep-alive logic (unchanged)
        if (remaining <= 5 && remaining >= 0 && !transitionArmedRef.current) {
          transitionArmedRef.current = true;
          iosAudioRef.current.addLog('info', '[TransitionKeepAlive] armed', `remaining=${remaining.toFixed(2)}s`);
          iosAudioRef.current.keepAlive({ force: true });
          transitionKeepAliveIntervalRef.current = window.setInterval(() => {
            iosAudioRef.current.keepAlive({ force: true });
          }, 2500);
        }

        // CROSSFADE: Trigger 10s before end (only once per track, only if enabled)
        if (crossfadeEnabledRef.current && remaining <= CROSSFADE_START_SECONDS && remaining > CROSSFADE_START_SECONDS - 1) {
          const { queueIndex } = lifecycleRef.current;
          const currentTrackId = lifecycleRef.current.track?.id;
          
          // Only trigger if not already triggered for this track
          if (currentTrackId && crossfadeTriggeredForTrackRef.current !== currentTrackId) {
            crossfadeTriggeredForTrackRef.current = currentTrackId;
            
            // Check if we have next track in queue
            const stateSnapshot = lifecycleRef.current;
            const nextIndex = queueIndex + 1;
            
            // Note: We need to get queue from somewhere... dispatch event to trigger
            window.dispatchEvent(new CustomEvent('check-crossfade', { 
              detail: { nextIndex, currentTrackId } 
            }));
          }
        }
      }

      // AGGRESSIVE PREFETCH: Start prefetching 3 seconds AFTER playback begins
      if (currentTime >= 3 && currentTime < 6) {
        if (!isPrefetchingRef.current && !prefetchedNextUrlRef.current) {
          window.dispatchEvent(new CustomEvent('prefetch-next-track'));
        }
      }
    };

    const handleLoadedMetadata = () => setState((prev) => ({ ...prev, duration: audio.duration }));

    // Track ended handler - FALLBACK if crossfade didn't happen
    const handleEnded = () => {
      console.log('[PlayerContext] Track ended (fallback - crossfade should have handled this)');

      // Keep media session active
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing';
      }

      // iOS: maintain audio session
      const iosAudioInstance = iosAudioRef.current;
      if (iosAudioInstance && !iosAudioInstance.isExternalDevice()) {
        iosAudioInstance.keepAlive({ force: true });
        iosAudioInstance.playPlaceholder().catch(() => {});
      }

      // Only call next() if crossfade isn't in progress
      if (!crossfadeInProgressRef.current) {
        nextRef.current();
      }
    };

    // Handle pause events
    const handlePause = () => {
      if (!audio.ended) {
        setState((prev) => ({ ...prev, isPlaying: false }));
      }
      stopTransitionKeepAlive();
    };

    const handlePlay = () => {
      setState((prev) => ({ ...prev, isPlaying: true }));

      if (transitionArmedRef.current) {
        if (transitionStopTimeoutRef.current) window.clearTimeout(transitionStopTimeoutRef.current);
        transitionStopTimeoutRef.current = window.setTimeout(() => {
          iosAudioRef.current.addLog('info', '[TransitionKeepAlive] stopping (post-start)');
          stopTransitionKeepAlive();
        }, 5000);
      }
    };

    const handleError = (e: Event) => {
      console.error('[PlayerContext] Audio error:', e);
      const audioElement = e.target as HTMLAudioElement;
      const errorCode = audioElement?.error?.code;
      const errorMessage = audioElement?.error?.message;
      
      console.log('[PlayerContext] Error details:', { errorCode, errorMessage });
      iosAudioRef.current.addLog('error', '[Audio]', `Error code: ${errorCode}, message: ${errorMessage}`);
      
      // Auto-skip to next track on certain errors (network errors, decode errors)
      if (errorCode && errorCode !== MediaError.MEDIA_ERR_ABORTED) {
        console.log('[PlayerContext] Auto-skipping to next track due to audio error');
        // Small delay to avoid rapid skipping
        setTimeout(() => {
          nextRef.current();
        }, 1000);
      }
    };

    const handleStalled = () => {
      console.log('[PlayerContext] Audio stalled');
      iosAudioRef.current.addLog('warning', '[Audio]', 'Playback stalled');
    };

    // Listen for crossfade check event
    const handleCheckCrossfade = async (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const prefetched = prefetchedNextUrlRef.current;
      
      if (prefetched && prefetched.trackId) {
        performCrossfade(prefetched.trackId);
      }
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('error', handleError);
    audio.addEventListener('stalled', handleStalled);
    window.addEventListener('check-crossfade', handleCheckCrossfade);

    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', async () => {
        console.log('[MediaSession] play triggered');
        // Resume AudioContext if using crossfade
        if (usingAudioContextCrossfadeRef.current) {
          await crossfadeRef.current?.resume?.();
        }
        try {
          await audio.play();
          setState((prev) => ({ ...prev, isPlaying: true }));
        } catch (e) {
          console.log('[MediaSession] play failed:', e);
        }
      });
      
      navigator.mediaSession.setActionHandler('pause', () => {
        console.log('[MediaSession] pause triggered');
        // Pause AudioContext if using crossfade
        if (usingAudioContextCrossfadeRef.current) {
          crossfadeRef.current?.pause?.();
        }
        audio.pause();
        setState((prev) => ({ ...prev, isPlaying: false }));
      });
      
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        console.log('[MediaSession] previoustrack triggered');
        iosAudioRef.current.addLog('info', '[MediaSession]', 'previoustrack triggered');
        previousRef.current();
      });
      
      // ENHANCED: nexttrack handler with AudioContext crossfade support for CarPlay
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        console.log('[MediaSession] nexttrack triggered');
        const shouldUseCrossfade = crossfadeEnabledRef.current && isIOS() && isPWA();
        const hasPreloaded = crossfadeRef.current?.hasPreloadedNext?.();
        const isPreloading = crossfadeRef.current?.isPreloading?.();
        const preloadStatus = crossfadeRef.current?.getPreloadStatus?.();
        
        iosAudioRef.current.addLog('info', '[MediaSession]', `nexttrack: shouldUseCrossfade=${shouldUseCrossfade}, hasPreloaded=${hasPreloaded}, isPreloading=${isPreloading}`);
        
        if (shouldUseCrossfade && hasPreloaded) {
          // Use AudioContext crossfade for gapless transition
          console.log('[MediaSession] Using AudioContext crossfade for nexttrack');
          iosAudioRef.current.addLog('info', '[MediaSession]', `nexttrack -> AudioContext crossfade (buffer: ${preloadStatus?.bufferDuration?.toFixed(1)}s)`);
          crossfadeRef.current.triggerCrossfade();
        } else {
          // Fallback to standard next
          console.log('[MediaSession] Using standard next for nexttrack', { shouldUseCrossfade, hasPreloaded, isPreloading });
          iosAudioRef.current.addLog('info', '[MediaSession]', `nexttrack -> standard next() (no buffer ready)`);
          nextRef.current();
        }
      });
      
      // Seekto handler - works with both HTMLAudioElement and AudioContext
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        console.log('[MediaSession] seekto:', details.seekTime);
        if (details.seekTime !== undefined) {
          // For HTMLAudioElement
          if (audio.duration && !usingAudioContextCrossfadeRef.current) {
            audio.currentTime = details.seekTime;
            setState((prev) => ({ ...prev, progress: details.seekTime! }));
          }
          // Note: Web Audio API AudioBufferSourceNode doesn't support seeking mid-playback
          // The position state is still updated for UI consistency
        }
      });
      
      // Explicitly set seekbackward/seekforward to null to show skip buttons instead
      // On iOS this helps show the proper track skip controls in Control Center/CarPlay
      try {
        navigator.mediaSession.setActionHandler('seekbackward', null);
        navigator.mediaSession.setActionHandler('seekforward', null);
      } catch (e) {
        // Some browsers don't support setting handlers to null
        // In that case, map them to track skip actions
        try {
          navigator.mediaSession.setActionHandler('seekbackward', () => {
            console.log('[MediaSession] seekbackward -> previoustrack');
            previousRef.current();
          });
          navigator.mediaSession.setActionHandler('seekforward', () => {
            console.log('[MediaSession] seekforward -> nexttrack');
            const shouldUseCrossfade = crossfadeEnabledRef.current && isIOS() && isPWA();
            if (shouldUseCrossfade && crossfadeRef.current?.hasPreloadedNext?.()) {
              crossfadeRef.current.triggerCrossfade();
            } else {
              nextRef.current();
            }
          });
        } catch (e2) {
          // Fallback: just ignore
          console.log('[MediaSession] Could not set seek handlers');
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
      window.removeEventListener('check-crossfade', handleCheckCrossfade);

      stopTransitionKeepAlive();

      audio.pause();
      audio.src = '';
      nextAudio.pause();
      nextAudio.src = '';
      
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Simplified unlock - also initialize crossfade AudioContext
  const tryUnlockAudioFromUserGesture = useCallback(() => {
    iosAudio.quickUnlock();
    
    // Initialize crossfade AudioContext on user gesture if crossfade is enabled
    if (settings.crossfadeEnabled && isIOS() && isPWA()) {
      crossfade.initialize().then(success => {
        if (success) {
          console.log('[PlayerContext] Crossfade AudioContext initialized on user gesture');
        }
      });
    }
  }, [iosAudio, settings.crossfadeEnabled, crossfade]);

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
    async (track: Track, queue?: Track[]) => {
      console.log('[playTrack] Starting playback:', track.title, 'by', track.artist);
      tryUnlockAudioFromUserGesture();

      if (audioRef.current) {
        console.log('[playTrack] Stopping current audio');
        audioRef.current.pause();
        audioRef.current.src = '';
      }

      // Start with original track - fetch metadata in background while playing
      currentSearchTrackIdRef.current = track.id;

      // Initialize queue with original track
      const initialQueue = queue ? [...queue] : [track];

      setState((prev) => ({
        ...prev,
        currentTrack: track,
        isPlaying: true,
        queue: initialQueue,
        queueIndex: initialQueue.findIndex((t) => t.id === track.id),
        duration: track.duration,
        progress: 0,
      }));

      // iOS widget sync: Set metadata immediately and play placeholder
      // This keeps the widget showing correct info during stream loading
      updateMediaSessionMetadata(track, true);
      
      // Play silent placeholder on iOS (not on CarPlay/Bluetooth) to maintain session
      await iosAudio.playPlaceholder();
      
      // Note: Dummy audio for Media Session is handled by the keep-alive system
      // Don't start it here to avoid interference with main playback

      // REMOVED: Automatic metadata fetch - user can manually fix metadata via Debug Modal if needed
      // Use original track for playback
      const enrichedTrack = track;

      clearDebugLogs();
      setAlternativeStreams([]);
      setAvailableTorrents([]);
      setCurrentStreamId(undefined);
      setDownloadProgress(null);
      setDownloadStatus(null);
      setLoadingPhase('idle');
      setCurrentAudioSource(null);
      
      // Reset AudioContext crossfade flag - we're starting fresh with HTML audio
      usingAudioContextCrossfadeRef.current = false;
      
      // Stop any ongoing AudioContext playback
      crossfade.stopCurrent();

      // PRIORITY 1: Check for offline availability first (works without network)
      const offlineUrl = await getOfflineTrackUrl(enrichedTrack.id);
      if (offlineUrl && audioRef.current) {
        addDebugLog('📱 Brano offline', `Riproduzione da storage locale`, 'info');
        audioRef.current.src = offlineUrl;
        
        if (await safePlay(audioRef.current)) {
          setState((prev) => ({ ...prev, isPlaying: true }));
          setLoadingPhase('idle');
          setCurrentAudioSource('offline');
          saveRecentlyPlayedTrack(enrichedTrack, user?.id);
          addDebugLog('✅ Riproduzione offline', `"${enrichedTrack.title}" avviato`, 'success');
          updateMediaSessionMetadata(enrichedTrack, true);
          return;
        }
      }

      const isDeezerPriorityMode = audioSourceMode === 'deezer_priority';
      const isHybridMode = audioSourceMode === 'hybrid_priority';
      const hasRdKey = !!credentials?.realDebridApiKey;

      // Helper to save recently played (uses database if user is logged in)
      const saveRecentlyPlayed = () => {
        saveRecentlyPlayedTrack(enrichedTrack, user?.id);
      };

      // Helper function for Tidal fallback (used in hybrid mode)
      const playWithTidalFallback = async (): Promise<boolean> => {
        const tidalQuality = mapQualityToTidal(settings.audioQuality);
        addDebugLog('🎵 Fallback Tidal', `Ricerca "${enrichedTrack.title}" di ${enrichedTrack.artist} (${tidalQuality})`, 'info');
        try {
          const tidalResult = await getTidalStream(enrichedTrack.title, enrichedTrack.artist, tidalQuality);
          if (currentSearchTrackIdRef.current !== enrichedTrack.id) return false;

          if ('streamUrl' in tidalResult && tidalResult.streamUrl && audioRef.current) {
            audioRef.current.src = tidalResult.streamUrl;
            
            try {
              if (currentSearchTrackIdRef.current !== enrichedTrack.id) return false;
              
              const playPromise = audioRef.current.play();
              if (playPromise !== undefined) {
                await playPromise;
              }
              
              if (currentSearchTrackIdRef.current !== enrichedTrack.id) return false;
              
              setState((prev) => ({ ...prev, isPlaying: true }));
              setLoadingPhase('idle');
              setCurrentAudioSource('tidal');
              saveRecentlyPlayed();
              
              const qualityInfo = tidalResult.bitDepth && tidalResult.sampleRate 
                ? `${tidalResult.bitDepth}bit/${tidalResult.sampleRate/1000}kHz` 
                : tidalResult.quality || 'LOSSLESS';
              addDebugLog('✅ Fallback Tidal avviato', `Stream ${qualityInfo}`, 'success');
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
          addDebugLog('❌ Fallback Tidal fallito', error instanceof Error ? error.message : 'Errore', 'error');
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

      // =============== DEEZER/TIDAL PRIORITY MODE ===============
      if (isDeezerPriorityMode) {
        const tidalQuality = mapQualityToTidal(settings.audioQuality);
        const searchStartTime = Date.now();
        addDebugLog('🔍 Avvio ricerca', `"${enrichedTrack.title}" - ${enrichedTrack.artist}`, 'info');
        setLoadingPhase('searching');

        try {
          // Use Tidal via SquidWTF - search by title and artist
          addDebugLog('📡 Chiamata API', `Tidal/SquidWTF (${tidalQuality})...`, 'info');
          const tidalResult = await getTidalStream(enrichedTrack.title, enrichedTrack.artist, tidalQuality);
          const searchDuration = Date.now() - searchStartTime;
          
          if (currentSearchTrackIdRef.current !== enrichedTrack.id) {
            addDebugLog('⏭️ Ricerca annullata', `Traccia cambiata (${searchDuration}ms)`, 'warning');
            return;
          }

          if ('streamUrl' in tidalResult && tidalResult.streamUrl && audioRef.current) {
            addDebugLog('✅ Stream trovato', `${searchDuration}ms - Caricamento audio...`, 'success');
            setLoadingPhase('loading');
            audioRef.current.src = tidalResult.streamUrl;
            
            try {
              // Check again if we're still playing this track
              if (currentSearchTrackIdRef.current !== enrichedTrack.id) return;
              
              const playPromise = audioRef.current.play();
              if (playPromise !== undefined) {
                await playPromise;
              }
              
              // Final check after play succeeds
              if (currentSearchTrackIdRef.current !== enrichedTrack.id) return;
              
              setState((prev) => ({ ...prev, isPlaying: true }));
              setLoadingPhase('idle');
              setCurrentAudioSource('tidal');
              
              // Save to recently played for Deezer/Tidal mode
              saveRecentlyPlayed();
              
              const qualityInfo = tidalResult.bitDepth && tidalResult.sampleRate 
                ? `${tidalResult.bitDepth}bit/${tidalResult.sampleRate/1000}kHz` 
                : tidalResult.quality || 'LOSSLESS';
              addDebugLog('✅ Riproduzione Tidal', `Stream ${qualityInfo} avviato`, 'success');
              return;
            } catch (playError) {
              // Ignore "interrupted" errors - this is normal when user switches tracks quickly
              if (playError instanceof Error && playError.name === 'AbortError') {
                console.log('[PlayerContext] Play was aborted (user switched tracks)');
                return;
              }
              // For NotAllowedError, the user hasn't interacted yet
              if (playError instanceof Error && playError.name === 'NotAllowedError') {
                console.log('[PlayerContext] Autoplay blocked, waiting for user interaction');
                setState((prev) => ({ ...prev, isPlaying: false }));
                setLoadingPhase('idle');
                setCurrentAudioSource('tidal');
                saveRecentlyPlayed();
                return;
              }
              throw playError;
            }
          }

          const errorMsg = 'error' in tidalResult ? tidalResult.error : 'Stream non disponibile';
          addDebugLog('❌ Tidal non disponibile', errorMsg, 'error');
          setLoadingPhase('unavailable');
          toast.error('Traccia non trovata su Tidal', { description: 'Passo alla prossima...' });
          autoSkipToNext();
          return;
        } catch (error) {
          addDebugLog('❌ Errore Tidal', error instanceof Error ? error.message : 'Errore', 'error');
          setLoadingPhase('unavailable');
          toast.error('Errore Tidal', { description: 'Passo alla prossima...' });
          autoSkipToNext();
          return;
        }
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
                saveRecentlyPlayed();
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
                saveRecentlyPlayed();
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
                saveRecentlyPlayed();
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

        // RD not available or downloading - use Tidal fallback
        addDebugLog('🔄 Fallback a Tidal', 'RD non disponibile, uso SquidWTF', 'info');
        setLoadingPhase('searching');
        
        const tidalSuccess = await playWithTidalFallback();
        
        if (tidalSuccess) {
          // Start background RD download while playing via Tidal
          if (hasRdKey) {
            startBackgroundRdDownload(enrichedTrack);
          }
          return;
        }
        
        // Both failed
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
                saveRecentlyPlayed();
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
                saveRecentlyPlayed();
                return;
              } else if (['downloading', 'queued', 'magnet_conversion'].includes(result.status)) {
                addDebugLog('📥 RD in download', `${result.progress}%`, 'info');
                setLoadingPhase('downloading');
                setDownloadProgress(result.progress ?? null);
                setDownloadStatus(result.status);
                saveRecentlyPlayed();
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
            saveRecentlyPlayed();
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
            saveRecentlyPlayed();
            return;
          }

          if (!selectResult.error && ['downloading', 'queued', 'magnet_conversion'].includes(selectResult.status)) {
            setLoadingPhase('downloading');
            setDownloadProgress(selectResult.progress ?? null);
            setDownloadStatus(selectResult.status);
            setIsSearchingStreams(false);
            saveRecentlyPlayed();
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
      setState((prev) => ({ ...prev, queueIndex: index }));
      playTrack(track, state.queue);
    },
    [playTrack, state.queue]
  );

  // Fetch similar tracks based on current track's artist
  const fetchSimilarTracks = useCallback(async (currentTrack: Track): Promise<Track[]> => {
    try {
      // Get top tracks from the same artist
      const artistTopTracks = await getArtistTopTracks(currentTrack.artistId || '');
      
      // Filter out tracks already in queue and current track
      const queueIds = new Set(state.queue.map(t => t.id));
      const newTracks = artistTopTracks.filter(t => !queueIds.has(t.id) && t.id !== currentTrack.id);
      
      // If we got enough from same artist, use those
      if (newTracks.length >= 5) {
        console.log('[Autoplay] Found', newTracks.length, 'similar tracks from', currentTrack.artist);
        return newTracks.slice(0, 10);
      }
      
      // Otherwise search for related tracks
      const searchResults = await searchTracks(`${currentTrack.artist}`);
      const additionalTracks = searchResults.filter(t => 
        !queueIds.has(t.id) && 
        t.id !== currentTrack.id &&
        !newTracks.find(nt => nt.id === t.id)
      );
      
      const combined = [...newTracks, ...additionalTracks].slice(0, 15);
      console.log('[Autoplay] Found', combined.length, 'tracks for autoplay');
      return combined;
    } catch (error) {
      console.error('[Autoplay] Failed to fetch similar tracks:', error);
      return [];
    }
  }, [state.queue]);

  const next = useCallback(async () => {
    const nextIndex = state.queueIndex + 1;
    if (nextIndex < state.queue.length) {
      const nextTrack = state.queue[nextIndex];
      setState((prev) => ({ ...prev, queueIndex: nextIndex, currentTrack: nextTrack }));
      
      const isIOSPWA = isIOS() && isPWA();
      
      // iOS PWA: Try to use pre-loaded AudioBuffer from queuePrefetch first
      // This enables background playback even when the app is minimized
      if (isIOSPWA && crossfadeEnabledRef.current) {
        const prefetchedBuffer = queuePrefetch.getBuffer(nextTrack.id);
        const prefetchedUrl = queuePrefetch.getUrl(nextTrack.id);
        
        if (prefetchedBuffer) {
          console.log('[Next-iOS] Using pre-loaded AudioBuffer for:', nextTrack.title);
          iosAudioRef.current.addLog('success', '[Next-iOS]', `Playing from buffer: ${nextTrack.title}`);
          
          // Activate iOS audio session keepalive
          iosAudioRef.current.playPlaceholder?.();
          
          // Play using AudioContext with pre-loaded buffer
          const duration = await crossfade.playFromBuffer(prefetchedBuffer, nextTrack.id, {
            onTrackEnd: () => {
              console.log('[Next-iOS] Buffer track ended, moving to next');
              iosAudioRef.current.addLog('info', '[Next-iOS]', 'Track ended, calling next()');
              nextRef.current?.();
            },
          });
          
          if (duration > 0) {
            setState((prev) => ({ ...prev, isPlaying: true, duration }));
            setCurrentAudioSource('tidal');
            setLoadingPhase('idle');
            updateMediaSessionMetadata(nextTrack, true);
            saveRecentlyPlayedTrack(nextTrack, user?.id);
            addDebugLog('🔊 AudioBuffer', `"${nextTrack.title}" (${duration.toFixed(0)}s)`, 'success');
            
            // Mark as using AudioContext crossfade
            usingAudioContextCrossfadeRef.current = true;
            
            // Preload the NEXT track's buffer into crossfade system
            const nextNextIndex = nextIndex + 1;
            if (nextNextIndex < state.queue.length) {
              const nextNextTrack = state.queue[nextNextIndex];
              const nextNextBuffer = queuePrefetch.getBuffer(nextNextTrack.id);
              
              if (nextNextBuffer) {
                crossfade.preloadNextFromBuffer(nextNextBuffer, nextNextTrack.id);
                iosAudioRef.current.addLog('info', '[Next-iOS]', `Preloaded next: ${nextNextTrack.title}`);
              } else {
                // Try URL preload if buffer not ready yet
                const nextNextUrl = queuePrefetch.getUrl(nextNextTrack.id);
                if (nextNextUrl) {
                  crossfade.preloadNext(nextNextUrl, nextNextTrack.id);
                }
              }
            }
            
            // Clear old tracks from cache
            queuePrefetch.clearOldTracks(state.queue, nextIndex);
            
            // Continue prefetching more tracks if needed
            setTimeout(() => {
              queuePrefetch.prefetchQueue(state.queue, nextIndex, { 
                maxTracks: 15, 
                forceRestart: false 
              });
            }, 1000);
            
            return;
          } else {
            console.log('[Next-iOS] playFromBuffer failed, falling back');
            iosAudioRef.current.addLog('warning', '[Next-iOS]', 'Buffer playback failed, trying URL');
          }
        }
        
        // Fallback: Try prefetched URL if buffer not available
        if (prefetchedUrl) {
          console.log('[Next-iOS] Using prefetched URL for:', nextTrack.title);
          iosAudioRef.current.addLog('info', '[Next-iOS]', `Playing from URL: ${nextTrack.title}`);
          
          iosAudioRef.current.playPlaceholder?.();
          
          const duration = await crossfade.playWithCrossfade(prefetchedUrl, nextTrack.id, {
            onTrackEnd: () => {
              console.log('[Next-iOS] URL track ended, moving to next');
              nextRef.current?.();
            },
          });
          
          if (duration > 0) {
            setState((prev) => ({ ...prev, isPlaying: true, duration }));
            setCurrentAudioSource('tidal');
            setLoadingPhase('idle');
            updateMediaSessionMetadata(nextTrack, true);
            saveRecentlyPlayedTrack(nextTrack, user?.id);
            addDebugLog('⚡ URL pre-caricato', `"${nextTrack.title}"`, 'success');
            usingAudioContextCrossfadeRef.current = true;
            
            queuePrefetch.clearOldTracks(state.queue, nextIndex);
            return;
          }
        }
      }
      
      // Legacy iOS prefetch (simple URL prefetch for non-crossfade mode)
      const prefetched = prefetchedNextUrlRef.current;
      if (isIOSPWA && prefetched && prefetched.trackId === nextTrack.id && prefetched.url) {
        console.log('[Next] Using prefetched URL for:', nextTrack.title);
        
        prefetchedNextUrlRef.current = null;
        prefetchedTrackIdRef.current = null;
        
        if (audioRef.current) {
          audioRef.current.src = prefetched.url;
          updateMediaSessionMetadata(nextTrack, true);
          
          try {
            console.log('[Next] Playing prefetched track:', nextTrack.title);
            await audioRef.current.play();
            setState((prev) => ({ ...prev, isPlaying: true }));
            setCurrentAudioSource(prefetched.source === 'tidal' ? 'tidal' : prefetched.source === 'offline' ? 'offline' : 'real-debrid');
            setLoadingPhase('idle');
            addDebugLog('⚡ Transizione veloce', `"${nextTrack.title}" (pre-caricato)`, 'success');
            
            saveRecentlyPlayedTrack(nextTrack, user?.id);
            
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent('prefetch-next-track'));
            }, 3000);
            
            return;
          } catch (playError) {
            console.log('[Next] Prefetched play failed:', playError);
            if (playError instanceof Error && playError.name === 'NotAllowedError') {
              console.log('[Next] Autoplay blocked - setting isPlaying to false');
              setState((prev) => ({ ...prev, isPlaying: false }));
              addDebugLog('⚠️ Autoplay bloccato', 'Premi play per avviare', 'warning');
              return;
            }
          }
        }
      }
      
      // Normal playback (no prefetch or prefetch failed)
      playTrack(nextTrack, state.queue);
    } else if (state.currentTrack) {
      // End of queue - fetch similar tracks and continue playing
      console.log('[Autoplay] Queue ended, fetching similar tracks...');
      addDebugLog('🔄 Autoplay', 'Carico brani simili...', 'info');
      
      fetchSimilarTracks(state.currentTrack).then((similarTracks) => {
        if (similarTracks.length > 0) {
          const currentQueue = state.queue;
          const newQueue = [...currentQueue, ...similarTracks];
          setState((prev) => ({ ...prev, queue: newQueue }));
          playTrack(similarTracks[0], newQueue);
          setState((prev) => ({ ...prev, queueIndex: currentQueue.length }));
          addDebugLog('✅ Autoplay avviato', `${similarTracks.length} brani aggiunti`, 'success');
        } else {
          addDebugLog('ℹ️ Autoplay', 'Nessun brano simile trovato', 'info');
        }
      }).catch((error) => {
        console.error('[Autoplay] Error fetching similar tracks:', error);
        addDebugLog('❌ Autoplay fallito', error instanceof Error ? error.message : 'Errore', 'error');
      });
    }
  }, [addDebugLog, crossfade, fetchSimilarTracks, playTrack, queuePrefetch, state.currentTrack, state.queue, state.queueIndex, user?.id]);

  const previous = useCallback(() => {
    if (state.progress > 3) {
      seek(0);
      return;
    }

    const prevIndex = state.queueIndex - 1;
    if (prevIndex >= 0) {
      playTrack(state.queue[prevIndex], state.queue);
      setState((prev) => ({ ...prev, queueIndex: prevIndex }));
    }
  }, [playTrack, seek, state.progress, state.queue, state.queueIndex]);

  // Keep refs updated for Media Session handlers
  useEffect(() => {
    nextRef.current = next;
    previousRef.current = previous;
  }, [next, previous]);

  // Pre-fetch next track URL for seamless iOS background playback (iOS ONLY)
  useEffect(() => {
    // Only run prefetch on iOS PWA - other platforms don't need it
    const isIOSPWA = isIOS() && isPWA();
    if (!isIOSPWA) return;
    
    const handlePrefetchNextTrack = async () => {
      // Skip if already prefetching or no next track
      if (isPrefetchingRef.current) return;
      
      const nextIndex = state.queueIndex + 1;
      if (nextIndex >= state.queue.length) return;
      
      const nextTrack = state.queue[nextIndex];
      if (!nextTrack) return;
      
      // Skip if already prefetched this track
      if (prefetchedTrackIdRef.current === nextTrack.id) {
        // But check if AudioContext preload also needs to happen
        const isIOSPWA = isIOS() && isPWA();
        const shouldPreloadAudioContext = crossfadeEnabledRef.current && isIOSPWA;
        
        if (shouldPreloadAudioContext && !crossfade.hasPreloadedNext() && prefetchedNextUrlRef.current) {
          console.log('[Prefetch] URL cached, but AudioContext needs preload');
          iosAudioRef.current.addLog('info', '[Prefetch]', 'Starting AudioContext preload for cached URL');
          
          const preloadSuccess = await crossfade.preloadNext(prefetchedNextUrlRef.current.url, nextTrack.id);
          if (preloadSuccess) {
            addDebugLog('🔊 AudioContext pre-caricato', `"${nextTrack.title}"`, 'success');
            iosAudioRef.current.addLog('success', '[Prefetch]', `AudioContext preloaded: ${nextTrack.title}`);
          } else {
            const status = crossfade.getPreloadStatus();
            iosAudioRef.current.addLog('error', '[Prefetch]', `AudioContext preload failed: ${status?.error || 'unknown'}`);
          }
        }
        return;
      }
      
      isPrefetchingRef.current = true;
      console.log('[Prefetch] Starting prefetch for:', nextTrack.title);
      iosAudioRef.current.addLog('info', '[Prefetch]', `Starting: ${nextTrack.title}`);
      
      try {
        // Simple: Just use Tidal - it's fast and reliable
        const tidalQuality = mapQualityToTidal(settings.audioQuality);
        const tidalResult = await getTidalStream(nextTrack.title, nextTrack.artist, tidalQuality);
        
        if ('streamUrl' in tidalResult && tidalResult.streamUrl) {
          prefetchedNextUrlRef.current = {
            trackId: nextTrack.id,
            url: tidalResult.streamUrl,
            source: 'tidal'
          };
          prefetchedTrackIdRef.current = nextTrack.id;
          console.log('[Prefetch] Prefetched URL:', nextTrack.title);
          addDebugLog('📥 Pre-caricato', `"${nextTrack.title}" pronto`, 'success');
          iosAudioRef.current.addLog('success', '[Prefetch]', `URL cached: ${nextTrack.title}`);
          
          // CRITICAL: If crossfade is enabled on iOS PWA, IMMEDIATELY preload into AudioContext
          // This is the key for gapless background playback
          const isIOSPWA = isIOS() && isPWA();
          const shouldPreloadAudioContext = crossfadeEnabledRef.current && isIOSPWA;
          
          if (shouldPreloadAudioContext) {
            console.log('[Prefetch] Preloading into AudioContext crossfade system');
            iosAudioRef.current.addLog('info', '[Prefetch]', 'Starting AudioContext buffer load');
            
            const preloadStart = Date.now();
            const success = await crossfade.preloadNext(tidalResult.streamUrl, nextTrack.id);
            const preloadDuration = Date.now() - preloadStart;
            
            if (success) {
              const status = crossfade.getPreloadStatus();
              addDebugLog('🔊 AudioContext pre-caricato', `"${nextTrack.title}" (${preloadDuration}ms)`, 'success');
              iosAudioRef.current.addLog('success', '[Prefetch]', `AudioContext ready: ${nextTrack.title} (${status?.bufferDuration?.toFixed(1)}s in ${preloadDuration}ms)`);
            } else {
              const status = crossfade.getPreloadStatus();
              console.log('[Prefetch] AudioContext preload failed:', status?.error);
              iosAudioRef.current.addLog('error', '[Prefetch]', `AudioContext preload failed: ${status?.error || 'unknown'} after ${preloadDuration}ms`);
            }
          }
        } else {
          console.log('[Prefetch] No stream URL found for:', nextTrack.title);
          iosAudioRef.current.addLog('warning', '[Prefetch]', `No stream for: ${nextTrack.title}`);
        }
      } catch (error) {
        console.log('[Prefetch] Failed:', error);
        iosAudioRef.current.addLog('error', '[Prefetch]', `Failed: ${error instanceof Error ? error.message : 'unknown'}`);
      } finally {
        isPrefetchingRef.current = false;
      }
    };
    
    // Handle crossfade complete event - update state after successful crossfade
    const handleCrossfadeComplete = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const { nextIndex, source } = detail;
      
      if (nextIndex >= 0 && nextIndex < state.queue.length) {
        const nextTrack = state.queue[nextIndex];
        console.log('[Crossfade] Updating state to track:', nextTrack?.title);
        
        setState((prev) => ({
          ...prev,
          queueIndex: nextIndex,
          currentTrack: nextTrack,
          isPlaying: true,
          progress: 0,
          duration: nextTrack?.duration || 0,
        }));
        
        // Update audio source
        setCurrentAudioSource(source === 'tidal' ? 'tidal' : source === 'offline' ? 'offline' : 'real-debrid');
        setLoadingPhase('idle');
        
        // Update media session
        if (nextTrack) {
          updateMediaSessionMetadata(nextTrack, true);
          saveRecentlyPlayedTrack(nextTrack, user?.id);
          addDebugLog('⚡ Crossfade completo', `"${nextTrack.title}"`, 'success');
        }
      }
    };
    
    // Handle AudioContext crossfade complete - triggered by useCrossfade hook
    const handleAudioContextCrossfadeComplete = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const { trackId } = detail;
      
      // Find the track index in the queue
      const trackIndex = state.queue.findIndex(t => t.id === trackId);
      if (trackIndex >= 0 && trackIndex < state.queue.length) {
        const track = state.queue[trackIndex];
        console.log('[AudioContext Crossfade] Updating state to track:', track?.title);
        
        setState((prev) => ({
          ...prev,
          queueIndex: trackIndex,
          currentTrack: track,
          isPlaying: true,
          progress: 0,
          duration: track?.duration || 0,
        }));
        
        setCurrentAudioSource('tidal');
        setLoadingPhase('idle');
        
        if (track) {
          updateMediaSessionMetadata(track, true);
          saveRecentlyPlayedTrack(track, user?.id);
          addDebugLog('🔊 AudioContext crossfade completo', `"${track.title}"`, 'success');
        }
        
        // Start prefetching the next track
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('prefetch-next-track'));
        }, 3000);
      }
    };
    
    window.addEventListener('prefetch-next-track', handlePrefetchNextTrack);
    window.addEventListener('crossfade-complete', handleCrossfadeComplete);
    window.addEventListener('audiocontext-crossfade-complete', handleAudioContextCrossfadeComplete);
    
    return () => {
      window.removeEventListener('prefetch-next-track', handlePrefetchNextTrack);
      window.removeEventListener('crossfade-complete', handleCrossfadeComplete);
      window.removeEventListener('audiocontext-crossfade-complete', handleAudioContextCrossfadeComplete);
    };
  }, [state.queue, state.queueIndex, settings.audioQuality, settings.crossfadeEnabled, addDebugLog, user?.id, crossfade]);

  // AudioContext progress sync: Update UI progress when using AudioContext playback
  useEffect(() => {
    if (!usingAudioContextCrossfadeRef.current || !state.isPlaying) return;
    
    const intervalId = setInterval(() => {
      const currentTime = crossfade.getCurrentTime();
      const duration = crossfade.getCurrentDuration();
      
      if (duration > 0 && currentTime >= 0) {
        setState((prev) => ({
          ...prev,
          progress: currentTime,
          duration: duration,
        }));
        
        // Update Media Session position state
        if ('mediaSession' in navigator && navigator.mediaSession.setPositionState) {
          try {
            navigator.mediaSession.setPositionState({
              duration: duration,
              playbackRate: 1.0,
              position: Math.min(currentTime, duration),
            });
          } catch (e) {
            // Ignore position state errors
          }
        }
      }
    }, 500); // Update every 500ms
    
    return () => clearInterval(intervalId);
  }, [state.isPlaying, crossfade]);

  // iOS Queue Prefetch: When playback starts on iOS PWA, prefetch the entire queue
  // This ensures continuous playback even when the app goes to background
  useEffect(() => {
    if (!isIOS() || !isPWA()) return;
    if (!state.isPlaying || !state.currentTrack) return;
    if (state.queue.length <= 1) return;
    
    // Trigger queue prefetch after a short delay (let current track start playing)
    const timeout = setTimeout(() => {
      console.log('[QueuePrefetch] Triggering full queue prefetch for iOS background playback');
      iosAudioRef.current.addLog('info', '[QueuePrefetch]', `Starting full queue prefetch (${state.queue.length - state.queueIndex - 1} tracks ahead)`);
      
      queuePrefetch.prefetchQueue(state.queue, state.queueIndex, {
        maxTracks: 15, // Prefetch up to 15 tracks ahead
        forceRestart: false, // Resume from where we left off
      });
    }, 2000);
    
    return () => clearTimeout(timeout);
  }, [state.isPlaying, state.currentTrack?.id, state.queue, state.queueIndex, queuePrefetch]);

  // Resume queue prefetch when app comes back to foreground
  useEffect(() => {
    if (!isIOS() || !isPWA()) return;
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && state.isPlaying && state.queue.length > 1) {
        // Resume prefetching if there are still tracks to prefetch
        const { fetchedCount, totalTracks, isActive } = queuePrefetch.state;
        
        if (!isActive && fetchedCount < totalTracks) {
          console.log('[QueuePrefetch] Resuming prefetch on visibility change');
          iosAudioRef.current.addLog('info', '[QueuePrefetch]', 'Resuming prefetch (app visible)');
          
          queuePrefetch.prefetchQueue(state.queue, state.queueIndex, {
            maxTracks: 15,
            forceRestart: false, // Important: resume, not restart
          });
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [state.isPlaying, state.queue, state.queueIndex, queuePrefetch]);

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

  // Pre-sync next track in queue (ONLY if RD mode is selected)
  useEffect(() => {
    // Skip RD pre-sync if not using RD priority mode
    if (audioSourceMode !== 'rd_priority' && audioSourceMode !== 'hybrid_priority') return;
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
  }, [audioSourceMode, credentials, saveFileMapping, state.currentTrack, state.isPlaying, state.queue, state.queueIndex]);

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
        lastSearchQuery,
        isShuffled,
        toggleShuffle,
        currentAudioSource,
        updateTrackMetadata,
        queuePrefetchState: queuePrefetch.state,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
};

export const usePlayer = () => {
  const context = useContext(PlayerContext);

  // In rare cases (HMR/cache edge cases), the tree can momentarily render without the provider.
  // Throwing here causes a blank screen, so we fail-safe with a noop context and loud logging.
  if (!context) {
    console.error('[PlayerContext] usePlayer called outside PlayerProvider (returning noop context)');
    return {
      currentTrack: null,
      isPlaying: false,
      volume: 0.7,
      progress: 0,
      duration: 0,
      queue: [],
      queueIndex: 0,

      play: () => {},
      pause: () => {},
      toggle: () => {},
      next: () => {},
      previous: () => {},
      seek: () => {},
      setVolume: () => {},

      addToQueue: () => {},
      playTrack: () => {},
      playQueueIndex: () => {},
      clearQueue: () => {},

      alternativeStreams: [],
      availableTorrents: [],
      selectStream: () => {},
      selectTorrentFile: async () => {},
      refreshTorrent: async () => {},

      currentStreamId: undefined,
      isSearchingStreams: false,
      manualSearch: async () => {},

      debugLogs: [],
      clearDebugLogs: () => {},

      downloadProgress: null,
      downloadStatus: null,
      loadSavedMapping: async () => {},
      currentMappedFileId: undefined,
      loadingPhase: 'idle',

      lastSearchQuery: null,

      isShuffled: false,
      toggleShuffle: () => {},

      currentAudioSource: null,

      updateTrackMetadata: () => {},
      
      queuePrefetchState: {
        totalTracks: 0,
        fetchedCount: 0,
        bufferReadyCount: 0,
        swCachedCount: 0,
        currentlyFetching: null,
        lastFetchedIndex: -1,
        isActive: false,
      },
    } as any;
  }

  return context;
};
