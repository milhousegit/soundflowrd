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
import { useIOSAudioSession } from '@/hooks/useIOSAudioSession';

import {
  type AudioFile,
  type StreamResult,
  type TorrentInfo,
  checkTorrentStatus,
  searchStreams,
  selectFilesAndPlay,
} from '@/lib/realdebrid';
import { getDeezerStream } from '@/lib/lucida';
import { addSyncedTrack, addSyncingTrack, removeSyncingTrack } from '@/hooks/useSyncedTracks';

export interface DebugLogEntry {
  timestamp: Date;
  step: string;
  details?: string;
  status: 'info' | 'success' | 'error' | 'warning';
}

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

  lastSearchQuery: string | null;

  isShuffled: boolean;
  toggleShuffle: () => void;
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

export const PlayerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { credentials } = useAuth();
  const { audioSourceMode } = useSettings();
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
  const [lastSearchQuery, setLastSearchQuery] = useState<string | null>(null);

  const [isShuffled, setIsShuffled] = useState(false);
  const originalQueueRef = useRef<Track[]>([]);

  const currentSearchTrackIdRef = useRef<string | null>(null);

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

  useEffect(() => {
    updateMediaSessionMetadata(state.currentTrack, state.isPlaying);
  }, [state.currentTrack, state.isPlaying]);

  useEffect(() => {
    audioRef.current = new Audio();
    audioRef.current.volume = state.volume;

    const audio = audioRef.current;

    const handleTimeUpdate = () => setState((prev) => ({ ...prev, progress: audio.currentTime }));
    const handleLoadedMetadata = () => setState((prev) => ({ ...prev, duration: audio.duration }));
    const handleEnded = () => next();

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => {
        audio.play();
        setState((prev) => ({ ...prev, isPlaying: true }));
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        audio.pause();
        setState((prev) => ({ ...prev, isPlaying: false }));
      });
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined) {
          audio.currentTime = details.seekTime;
          setState((prev) => ({ ...prev, progress: details.seekTime! }));
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

  const tryUnlockAudioFromUserGesture = useCallback(() => {
    iosAudio.quickUnlock();
    iosAudio.keepAlive();
  }, [iosAudio]);

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
      tryUnlockAudioFromUserGesture();

      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }

      currentSearchTrackIdRef.current = track.id;

      setState((prev) => ({
        ...prev,
        currentTrack: track,
        isPlaying: true,
        queue: queue || [track],
        queueIndex: queue ? queue.findIndex((t) => t.id === track.id) : 0,
        duration: track.duration,
        progress: 0,
      }));

      clearDebugLogs();
      setAlternativeStreams([]);
      setAvailableTorrents([]);
      setCurrentStreamId(undefined);
      setDownloadProgress(null);
      setDownloadStatus(null);
      setLoadingPhase('idle');

      const isDeezerPriorityMode = audioSourceMode === 'deezer_priority';
      const hasRdKey = !!credentials?.realDebridApiKey;

      // =============== DEEZER PRIORITY MODE ===============
      if (isDeezerPriorityMode) {
        const isValidDeezerId = /^\d+$/.test(track.id);
        if (!isValidDeezerId) {
          addDebugLog('❌ ID non Deezer', `"${track.id}" non è un ID Deezer numerico`, 'error');
          setLoadingPhase('unavailable');
          toast.error('Traccia non disponibile', {
            description: 'Questa traccia non proviene da Deezer e non può essere riprodotta in modalità Deezer HQ.',
          });
          return;
        }

        addDebugLog('🎵 Modalità Deezer HQ', `Tentativo stream per ID: ${track.id}`, 'info');
        setLoadingPhase('searching');

        try {
          const deezerResult = await getDeezerStream(track.id);
          if (currentSearchTrackIdRef.current !== track.id) return;

          if ('streamUrl' in deezerResult && deezerResult.streamUrl && audioRef.current) {
            setLoadingPhase('loading');
            audioRef.current.src = deezerResult.streamUrl;
            await audioRef.current.play();
            setState((prev) => ({ ...prev, isPlaying: true }));
            setLoadingPhase('idle');
            addDebugLog('✅ Riproduzione Deezer', 'Stream HQ avviato', 'success');
            return;
          }

          const errorMsg = 'error' in deezerResult ? deezerResult.error : 'Stream non disponibile';
          addDebugLog('❌ Deezer non disponibile', errorMsg, 'error');
          setLoadingPhase('unavailable');
          toast.error('Deezer non disponibile', { description: errorMsg });
          return;
        } catch (error) {
          addDebugLog('❌ Errore Deezer', error instanceof Error ? error.message : 'Errore', 'error');
          setLoadingPhase('unavailable');
          toast.error('Errore Deezer', { description: error instanceof Error ? error.message : 'Errore sconosciuto' });
          return;
        }
      }

      // =============== RD MODE (NO YOUTUBE) ===============
      if (!hasRdKey) {
        setLoadingPhase('unavailable');
        toast.error('Real-Debrid non configurato', {
          description: 'Aggiungi la tua API key nelle impostazioni per riprodurre.',
        });
        return;
      }

      const saveRecentlyPlayed = () => {
        const recent = JSON.parse(localStorage.getItem('recentlyPlayed') || '[]');
        const filtered = recent.filter((t: Track) => t.id !== track.id);
        const updated = [track, ...filtered].slice(0, 20);
        localStorage.setItem('recentlyPlayed', JSON.stringify(updated));
      };

      addDebugLog('🎵 Inizio riproduzione', `"${track.title}" di ${track.artist}`, 'info');

      // STEP 1: check saved mapping
      if (track.albumId) {
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

              if (directLink && audioRef.current) {
                setLoadingPhase('loading');
                audioRef.current.src = directLink;
                await audioRef.current.play();
                setState((prev) => ({ ...prev, isPlaying: true }));
                setLoadingPhase('idle');
                saveRecentlyPlayed();
                return;
              }

              setLoadingPhase('loading');
              const result = await selectFilesAndPlay(credentials!.realDebridApiKey, torrentId, [fileId]);

              if (currentSearchTrackIdRef.current !== track.id) return;

              if (result.error || ['error', 'dead', 'magnet_error', 'not_found'].includes(result.status)) {
                addDebugLog('⚠️ Mappatura non valida', `Stato: ${result.status || result.error}`, 'warning');
                await supabase.from('track_file_mappings').delete().eq('track_id', track.id);
              } else if (result.streams.length > 0) {
                const streamUrl = result.streams[0].streamUrl;
                setAlternativeStreams(result.streams);
                setCurrentStreamId(result.streams[0].id);

                if (audioRef.current && streamUrl) {
                  audioRef.current.src = streamUrl;
                  await audioRef.current.play();
                  setState((prev) => ({ ...prev, isPlaying: true }));

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
      const query = track.album?.trim() ? `${track.album} ${track.artist}` : `${track.title} ${track.artist}`;
      setLastSearchQuery(query);
      setIsSearchingStreams(true);
      setLoadingPhase('searching');
      addDebugLog('🔎 Ricerca torrent', `Query: "${query}"`, 'info');

      try {
        const result = await searchStreams(credentials!.realDebridApiKey, query);

        if (currentSearchTrackIdRef.current !== track.id) return;

        setAvailableTorrents(result.torrents);

        if (result.streams?.length) {
          setAlternativeStreams(result.streams);
          const selected = result.streams[0];
          setCurrentStreamId(selected.id);
          if (audioRef.current && selected.streamUrl) {
            setLoadingPhase('loading');
            audioRef.current.src = selected.streamUrl;
            await audioRef.current.play();
            setState((prev) => ({ ...prev, isPlaying: true }));
            setLoadingPhase('idle');
            addDebugLog('🔊 Riproduzione', selected.title, 'success');
            saveRecentlyPlayed();
            return;
          }
        }

        // If we have torrents, try to auto-match a file
        for (const torrent of result.torrents) {
          if (!torrent.files?.length) continue;
          const matchingFile = torrent.files.find((file) =>
            flexibleMatch(file.filename || '', track.title) || flexibleMatch(file.path || '', track.title)
          );
          if (!matchingFile) continue;

          addDebugLog('🎯 Match trovato', matchingFile.filename || '', 'success');
          setLoadingPhase('loading');

          const selectResult = await selectFilesAndPlay(credentials!.realDebridApiKey, torrent.torrentId, [matchingFile.id]);
          if (currentSearchTrackIdRef.current !== track.id) return;

          if (!selectResult.error && selectResult.streams.length > 0) {
            const streamUrl = selectResult.streams[0].streamUrl;
            setAlternativeStreams(selectResult.streams);
            setCurrentStreamId(selectResult.streams[0].id);

            await saveFileMapping({
              track,
              torrentId: torrent.torrentId,
              torrentTitle: torrent.title,
              fileId: matchingFile.id,
              fileName: matchingFile.filename,
              filePath: matchingFile.path,
              directLink: streamUrl,
            });

            if (audioRef.current && streamUrl) {
              audioRef.current.src = streamUrl;
              await audioRef.current.play();
              setState((prev) => ({ ...prev, isPlaying: true }));
            }

            setLoadingPhase('idle');
            setIsSearchingStreams(false);
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
          description: 'Nessun torrent/stream compatibile disponibile al momento.',
        });
      } catch (error) {
        setLoadingPhase('unavailable');
        setIsSearchingStreams(false);
        addDebugLog('❌ Errore ricerca', error instanceof Error ? error.message : 'Errore', 'error');
      } finally {
        setIsSearchingStreams(false);
      }
    },
    [
      audioSourceMode,
      addDebugLog,
      clearDebugLogs,
      credentials,
      saveFileMapping,
      tryUnlockAudioFromUserGesture,
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
        await audioRef.current.play();
        setState((prev) => ({ ...prev, isPlaying: true }));
      }

      addDebugLog('Stream selezionato', `Riproduco: ${stream.title}`, 'success');
    },
    [addDebugLog]
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
          await audioRef.current.play();
          setState((prev) => ({ ...prev, isPlaying: true }));
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
    [credentials, saveFileMapping, state.currentTrack]
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
            await audioRef.current.play();
            setState((prev) => ({ ...prev, isPlaying: true }));
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
    [addDebugLog, credentials]
  );

  const play = useCallback(
    (track?: Track) => {
      if (track) {
        playTrack(track);
      } else if (audioRef.current) {
        audioRef.current.play();
        setState((prev) => ({ ...prev, isPlaying: true }));
      } else {
        setState((prev) => ({ ...prev, isPlaying: true }));
      }
    },
    [playTrack]
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

  const next = useCallback(() => {
    const nextIndex = state.queueIndex + 1;
    if (nextIndex < state.queue.length) {
      playTrack(state.queue[nextIndex], state.queue);
      setState((prev) => ({ ...prev, queueIndex: nextIndex }));
    }
  }, [playTrack, state.queue, state.queueIndex]);

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

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.setActionHandler('previoustrack', () => previous());
    navigator.mediaSession.setActionHandler('nexttrack', () => next());
  }, [next, previous]);

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
              await audioRef.current.play();
              setState((prev) => ({ ...prev, isPlaying: true }));
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
