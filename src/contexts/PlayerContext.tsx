import React, { createContext, useContext, useState, useRef, useCallback, ReactNode, useEffect } from 'react';
import { Track, PlayerState } from '@/types/music';
import { StreamResult, TorrentInfo, AudioFile, searchStreams, selectFilesAndPlay, checkTorrentStatus } from '@/lib/realdebrid';
import { useAuth } from './AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { addSyncingTrack, removeSyncingTrack, addSyncedTrack } from '@/hooks/useSyncedTracks';

export interface DebugLogEntry {
  timestamp: Date;
  step: string;
  details?: string;
  status: 'info' | 'success' | 'error' | 'warning';
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
  const [alternativeStreams, setAlternativeStreams] = useState<StreamResult[]>([]);
  const [availableTorrents, setAvailableTorrents] = useState<TorrentInfo[]>([]);
  const [currentStreamId, setCurrentStreamId] = useState<string>();
  const [isSearchingStreams, setIsSearchingStreams] = useState(false);
  const [debugLogs, setDebugLogs] = useState<DebugLogEntry[]>([]);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);
  const [currentMappedFileId, setCurrentMappedFileId] = useState<number | undefined>();
  
  // Track ID currently being searched - used to cancel stale searches
  const currentSearchTrackIdRef = useRef<string | null>(null);

  const addDebugLog = useCallback((step: string, details?: string, status: 'info' | 'success' | 'error' | 'warning' = 'info') => {
    setDebugLogs(prev => [...prev, { timestamp: new Date(), step, details, status }]);
    console.log(`[DEBUG] ${step}`, details || '');
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
      .replace(/[^a-z0-9\s]/g, ' ') // replace special chars with space
      .replace(/\s+/g, ' ') // collapse multiple spaces
      .trim();
  };

  // Extract significant words from a string (ignore short words and common terms)
  const extractSignificantWords = (str: string): string[] => {
    const normalized = normalizeForMatch(str);
    // Filter out very short words and common filler words
    const stopWords = ['a', 'e', 'i', 'o', 'u', 'il', 'la', 'lo', 'le', 'un', 'una', 'di', 'da', 'in', 'con', 'su', 'per', 'tra', 'fra', 'the', 'a', 'an', 'of', 'to', 'and', 'or', 'for', 'mp3', 'flac', 'wav', 'm4a', 'aac', 'ogg'];
    return normalized
      .split(/\s+/)
      .filter(w => w.length > 1 && !stopWords.includes(w));
  };

  // Helper to check if file name contains track title words (flexible matching)
  // e.g. "16 - L'EMOZIONE NON HA VOCE.flac" should match "L'emozione non ha voce"
  const flexibleMatch = (fileName: string, trackTitle: string): boolean => {
    const normalizedFile = normalizeForMatch(fileName);
    const normalizedTitle = normalizeForMatch(trackTitle);
    
    // First try exact substring match (after normalization)
    if (normalizedFile.includes(normalizedTitle)) {
      return true;
    }
    
    // Extract significant words from track title
    const titleWords = extractSignificantWords(trackTitle);
    if (titleWords.length === 0) return false;
    
    // All significant words from the track title must be present in the filename
    const allWordsPresent = titleWords.every(word => normalizedFile.includes(word));
    
    if (allWordsPresent) {
      return true;
    }
    
    // Try matching with a minimum word overlap (for cases with partial matches)
    // At least 70% of words must match
    const matchingWords = titleWords.filter(word => normalizedFile.includes(word));
    const matchRatio = matchingWords.length / titleWords.length;
    
    return matchRatio >= 0.7 && matchingWords.length >= 2;
  };

  // Helper to save a **file** mapping (torrent + specific file id) to database
  const saveFileMapping = useCallback(async (params: {
    track: Track;
    torrentId: string;
    torrentTitle?: string;
    fileId: number;
    fileName?: string;
    filePath?: string;
  }) => {
    const { track, torrentId, torrentTitle, fileId, fileName, filePath } = params;

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
            },
            {
              onConflict: 'track_id',
            }
          );

        setCurrentMappedFileId(fileId);
        console.log('Saved file mapping for track:', track.title, { torrentId, fileId });
        addSyncedTrack(track.id);
      }
    } catch (error) {
      console.error('Failed to save file mapping:', error);
      removeSyncingTrack(track.id);
    }
  }, []);

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
      
      setAvailableTorrents(result.torrents);
      addDebugLog('Risultati album', `Trovati ${result.torrents.length} torrent`, result.torrents.length > 0 ? 'success' : 'warning');
      
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
          console.log(`Looking for track "${track.title}" -> normalized: "${normalizedTrackTitle}", words: [${trackWords.join(', ')}]`);
          
          // Find a file that contains the track title (check both filename and path)
          const matchingFile = torrent.files.find(file => {
            const normalizedFileName = normalizeForMatch(file.filename || '');
            const matchesFileName = flexibleMatch(file.filename || '', track.title);
            const matchesPath = flexibleMatch(file.path || '', track.title);
            const matches = matchesFileName || matchesPath;
            
            console.log(`  Checking file "${file.filename}" -> normalized: "${normalizedFileName}" -> match: ${matches}`);
            
            if (matches) {
              addDebugLog('Match trovato', `"${file.filename}" ≈ "${track.title}"`, 'success');
            }
            return matches;
          });
          
          if (matchingFile) {
            addDebugLog('File trovato', `Match: "${matchingFile.filename}"`, 'success');
            
            // Select this file and play it
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
            
            if (selectResult.streams.length > 0) {
              setAlternativeStreams(selectResult.streams);
              setCurrentStreamId(selectResult.streams[0].id);
              setDownloadProgress(null);
              setDownloadStatus(null);
              
              if (audioRef.current && selectResult.streams[0].streamUrl) {
                audioRef.current.src = selectResult.streams[0].streamUrl;
                audioRef.current.play();
                setState(prev => ({ ...prev, isPlaying: true }));
              }
              
              await saveFileMapping({
                track,
                torrentId: torrent.torrentId,
                torrentTitle: torrent.title,
                fileId: matchingFile.id,
                fileName: matchingFile.filename,
                filePath: matchingFile.path,
              });
              addDebugLog('Riproduzione', 'Stream avviato e mappatura salvata', 'success');
              
              return true;
            } else if (selectResult.status === 'downloading' || selectResult.status === 'queued') {
              setDownloadProgress(selectResult.progress);
              setDownloadStatus(selectResult.status);
              addDebugLog('Salvataggio', 'Salvataggio in cloud', 'success');
              // Don't return yet, show the download progress
            } else {
              addDebugLog('Stato torrent', `Stato: ${selectResult.status}, nessuno stream pronto`, 'warning');
            }
          } else {
            // Log all file names for debugging
            const fileNames = torrent.files.map(f => f.filename).join(', ');
            addDebugLog('Nessun match', `Cercavo "${track.title}" in: ${fileNames.substring(0, 200)}...`, 'warning');
          }
        }
      }
      
      // If no file match found but we have torrents, at least show them
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
    if (!credentials?.realDebridApiKey) {
      addDebugLog('Errore API', 'API Key Real-Debrid non configurata', 'error');
      return;
    }
    
    // Store the track ID we're searching for
    const searchTrackId = track?.id || null;
    
    if (clearLogs) {
      clearDebugLogs();
    }
    setIsSearchingStreams(true);
    setAlternativeStreams([]);
    setAvailableTorrents([]);
    setDownloadProgress(null);
    setDownloadStatus(null);
    
    addDebugLog('Inizio ricerca', `Query: "${query}"`, 'info');
    
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
      addDebugLog('Ricerca completata', `Stream pronti: ${result.streams?.length || 0}, Torrent: ${result.torrents.length}`, 
        (result.streams?.length || 0) > 0 ? 'success' : 'info');
      
      // If any torrent has ready streams (cached), get them
      if (result.streams && result.streams.length > 0) {
        setAlternativeStreams(result.streams);
        addDebugLog('Stream disponibili', `${result.streams.length} stream pronti per la riproduzione`, 'success');
        
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
            audioRef.current.src = selectedStream.streamUrl;
            audioRef.current.play();
            setState(prev => ({ ...prev, isPlaying: true }));
            addDebugLog('Riproduzione', `Avviato: "${selectedStream.title}"`, 'success');
          }
          
          // Non auto-salvare qui: gli stream "cached" non includono fileId affidabile.
          // La mappatura viene salvata solo quando scegliamo un file specifico (selectTorrentFile / match su file).

        }
      } else if ((!result.streams || result.streams.length === 0) && result.torrents.length === 0) {
        // No results for track title, try searching for the album
        addDebugLog('Nessun risultato diretto', 'Provo ricerca per album...', 'warning');
        
        if (track && track.album) {
          const foundInAlbum = await searchAlbumAndMatch(track);
          
          // Check if search is still valid
          if (searchTrackId && currentSearchTrackIdRef.current !== searchTrackId) {
            console.log('Search cancelled after album search - track changed');
            return;
          }
          
          if (!foundInAlbum && showNoResultsToast) {
            addDebugLog('Nessun risultato', 'Nessuna sorgente trovata', 'error');
            if (track) removeSyncingTrack(track.id);
            toast.error('Nessun contenuto trovato', {
              description: 'Non è stato trovato nessun risultato per questa traccia.',
            });
          }
        } else if (showNoResultsToast) {
          addDebugLog('Nessun risultato', 'Nessuna sorgente trovata e album non disponibile', 'error');
          if (track) removeSyncingTrack(track.id);
          toast.error('Nessun contenuto trovato', {
            description: 'Non è stato trovato nessun risultato per questa traccia.',
          });
        }
      } else if (result.torrents.length > 0 && (!result.streams || result.streams.length === 0)) {
        addDebugLog('Solo torrent', `${result.torrents.length} torrent disponibili`, 'info');
        
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
              addDebugLog('Analisi torrent', `"${torrent.title}" - ${torrent.files.length} file audio`, 'info');
              
              // Find a file that matches the track title using flexible matching
              const matchingFile = torrent.files.find(file => {
                const matchesFileName = flexibleMatch(file.filename || '', track.title);
                const matchesPath = flexibleMatch(file.path || '', track.title);
                const matches = matchesFileName || matchesPath;
                if (matches) {
                  addDebugLog('Match trovato', `"${file.filename}" contiene parole di "${track.title}"`, 'success');
                }
                return matches;
              });
              
              // Or if there's only one file, use it
              const fileToUse = matchingFile || (torrent.files.length === 1 ? torrent.files[0] : null);
              
              if (fileToUse) {
                addDebugLog('File selezionato', `"${fileToUse.filename}" (ID: ${fileToUse.id})`, 'success');
                
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
                  setAlternativeStreams(selectResult.streams);
                  setCurrentStreamId(selectResult.streams[0].id);
                  
                  if (audioRef.current && selectResult.streams[0].streamUrl) {
                    audioRef.current.src = selectResult.streams[0].streamUrl;
                    audioRef.current.play();
                    setState(prev => ({ ...prev, isPlaying: true }));
                  }
                  
                  await saveFileMapping({
                    track,
                    torrentId: torrent.torrentId,
                    torrentTitle: torrent.title,
                    fileId: fileToUse.id,
                    fileName: fileToUse.filename,
                    filePath: fileToUse.path,
                  });
                  addDebugLog('Riproduzione', 'Stream avviato e mappatura salvata', 'success');
                  playbackStarted = true;
                  break;
                } else if (selectResult.status === 'downloading' || selectResult.status === 'queued') {
                  setDownloadProgress(selectResult.progress);
                  setDownloadStatus(selectResult.status);
                  addDebugLog('Salvataggio', 'Salvataggio in cloud', 'success');
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
              addDebugLog('Nessun risultato album', 'Nessuna sorgente trovata neanche per album', 'error');
              removeSyncingTrack(track.id);
              toast.error('Nessun contenuto trovato', {
                description: 'Non è stato trovato nessun risultato per questa traccia.',
              });
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
      }
    }
  }, [credentials, saveFileMapping, searchAlbumAndMatch, addDebugLog, clearDebugLogs]);

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

        if (audioRef.current && result.streams[0].streamUrl) {
          audioRef.current.src = result.streams[0].streamUrl;
          audioRef.current.play();
          setState(prev => ({ ...prev, isPlaying: true }));
        }

        // Persist mapping using the **fileId** (not stream.id)
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
          });
        }

        addDebugLog('Riproduzione', `Stream pronto: ${result.streams[0].title}`, 'success');
      } else if (result.status === 'downloading' || result.status === 'queued' || result.status === 'magnet_conversion') {
        // Update torrent status in the list
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
        addDebugLog('Download completato', 'Stream pronti per la riproduzione', 'success');
        
        // Auto-play if nothing is playing
        if (!currentStreamId && result.streams.length > 0) {
          setCurrentStreamId(result.streams[0].id);
          if (audioRef.current && result.streams[0].streamUrl) {
            audioRef.current.src = result.streams[0].streamUrl;
            audioRef.current.play();
            setState(prev => ({ ...prev, isPlaying: true }));
          }
        }
      }
    } catch (error) {
      addDebugLog('Errore refresh', error instanceof Error ? error.message : 'Errore sconosciuto', 'error');
    }
  }, [credentials, currentStreamId, addDebugLog]);

  const manualSearch = useCallback(async (query: string) => {
    await searchForStreams(query, true, undefined, true);
  }, [searchForStreams]);

  // Load saved mapping to show in BugsModal for editing
  const loadSavedMapping = useCallback(async () => {
    const track = state.currentTrack;
    if (!credentials?.realDebridApiKey || !track?.albumId) return;
    
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
          }
          
          addDebugLog('Mappatura caricata', `Torrent: ${trackMapping.album_torrent_mappings.torrent_title}`, 'success');
        }
      } else {
        setCurrentMappedFileId(undefined);
        addDebugLog('Nessuna mappatura', 'Nessuna mappatura eseguita in precedenza, proseguo con la ricerca', 'info');
      }
    } catch (error) {
      console.error('Failed to load saved mapping:', error);
      addDebugLog('Errore caricamento', error instanceof Error ? error.message : 'Errore sconosciuto', 'error');
    }
  }, [state.currentTrack, credentials, addDebugLog]);

  const playTrack = useCallback(async (track: Track, queue?: Track[]) => {
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
    
    // Clear previous streams
    setAlternativeStreams([]);
    setAvailableTorrents([]);
    setCurrentStreamId(undefined);
    setDownloadProgress(null);
    setDownloadStatus(null);

    // First check if we have a saved mapping for this track
    if (credentials?.realDebridApiKey && track.albumId) {
      try {
        const { data: trackMapping } = await supabase
          .from('track_file_mappings')
          .select('*, album_torrent_mappings!inner(*)')
          .eq('track_id', track.id)
          .maybeSingle();

        // Verify track is still current
        if (currentSearchTrackIdRef.current !== track.id) {
          console.log('Track changed during mapping lookup, aborting');
          return;
        }

        if (trackMapping) {
          console.log('Found saved mapping for track:', track.title, trackMapping);

          // Use the saved torrent and file mapping
          const torrentId = trackMapping.album_torrent_mappings.torrent_id;
          const fileId = trackMapping.file_id;

          // Guard: old buggy mappings could have non-sensical file ids (e.g. parsed from stream id)
          if (!Number.isFinite(fileId) || fileId <= 0) {
            console.log('Ignoring invalid saved mapping fileId:', fileId);
          } else {
            setCurrentMappedFileId(fileId);

            // Select and play this specific file
            const result = await selectFilesAndPlay(credentials.realDebridApiKey, torrentId, [fileId]);

            // Verify track is still current
            if (currentSearchTrackIdRef.current !== track.id) {
              console.log('Track changed during file selection, aborting');
              return;
            }

            if (result.streams.length > 0) {
              setAlternativeStreams(result.streams);
              setCurrentStreamId(result.streams[0].id);

              if (audioRef.current && result.streams[0].streamUrl) {
                audioRef.current.src = result.streams[0].streamUrl;
                audioRef.current.play();
                setState(prev => ({ ...prev, isPlaying: true }));
              }

              // Save to recently played
              const recent = JSON.parse(localStorage.getItem('recentlyPlayed') || '[]');
              const filtered = recent.filter((t: Track) => t.id !== track.id);
              const updated = [track, ...filtered].slice(0, 20);
              localStorage.setItem('recentlyPlayed', JSON.stringify(updated));
              return;
            } else if (result.status === 'downloading' || result.status === 'queued') {
              // Torrent is downloading, show progress
              setAvailableTorrents([
                {
                  torrentId,
                  title: trackMapping.album_torrent_mappings.torrent_title,
                  size: 'Unknown',
                  source: 'Saved',
                  seeders: 0,
                  status: result.status,
                  progress: result.progress,
                  files: [],
                  hasLinks: false,
                },
              ]);
            }
          }
        }
      } catch (error) {
        console.error('Failed to check saved mapping:', error);
      }
    }

    // Verify track is still current before starting search
    if (currentSearchTrackIdRef.current !== track.id) {
      console.log('Track changed before search, aborting');
      return;
    }

    // No saved mapping - FIRST try album search, THEN fall back to track search
    // Questo evita di perdere tempo con la ricerca singola quando l'album esiste.
    clearDebugLogs();
    addSyncingTrack(track.id);
    
    if (track.album?.trim() && track.artist?.trim()) {
      // Try album search first
      const albumQuery = `${track.album} ${track.artist}`;
      addDebugLog('Strategia ricerca', `Prima: album (query: "${albumQuery}")`, 'info');
      const foundInAlbum = await searchAlbumAndMatch(track);
      
      if (currentSearchTrackIdRef.current !== track.id) {
        console.log('Track changed during album search, aborting');
        return;
      }
      
      if (!foundInAlbum) {
        // Album search failed, try track search as fallback
        const trackQuery = `${track.artist} ${track.title}`;
        addDebugLog('Fallback', `Album non trovato: provo traccia (query: "${trackQuery}")`, 'warning');
        searchForStreams(trackQuery, true, track, false);
      }
    } else {
      // No album info, search directly for track (ma logghiamo chiaramente il motivo)
      const trackQuery = `${track.artist} ${track.title}`;
      addDebugLog('Strategia ricerca', 'Album mancante: parto direttamente dalla traccia', 'warning');
      searchForStreams(trackQuery, true, track, false);
    }

    // If track has a stream URL, play it
    if (audioRef.current && track.streamUrl) {
      audioRef.current.src = track.streamUrl;
      audioRef.current.play();
    }

    // Save to recently played
    const recent = JSON.parse(localStorage.getItem('recentlyPlayed') || '[]');
    const filtered = recent.filter((t: Track) => t.id !== track.id);
    const updated = [track, ...filtered].slice(0, 20);
    localStorage.setItem('recentlyPlayed', JSON.stringify(updated));
  }, [searchForStreams, credentials]);

  const selectStream = useCallback(async (stream: StreamResult) => {
    // Switch stream for current playback immediately - no download needed since stream is already ready
    setCurrentStreamId(stream.id);
    
    // Clear any download progress since we're switching to a ready stream
    setDownloadProgress(null);
    setDownloadStatus(null);
    
    if (audioRef.current && stream.streamUrl) {
      audioRef.current.src = stream.streamUrl;
      audioRef.current.currentTime = 0;
      audioRef.current.play();
      setState(prev => ({ ...prev, isPlaying: true }));
    }
    
    addDebugLog('Stream selezionato', `Riproduco: ${stream.title}`, 'success');
  }, [addDebugLog]);

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
  }, []);

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

  // Pre-load next track in queue when current track starts playing
  useEffect(() => {
    // Skip if conditions aren't met
    if (!credentials?.realDebridApiKey) return;
    if (!state.currentTrack || !state.isPlaying) return;
    
    const currentTrackId = state.currentTrack.id;
    const currentAlbumId = state.currentTrack.albumId;
    const nextIndex = state.queueIndex + 1;
    if (nextIndex >= state.queue.length) return;
    
    const nextTrack = state.queue[nextIndex];
    if (!nextTrack?.albumId) return;
    
    // IMPORTANT: avoid interfering with current playback when the next track is in the same album/torrent.
    if (nextTrack.albumId === currentAlbumId) return;

    const preloadNextTrack = async () => {
      // Check if next track already has a mapping
      const { data: existingMapping } = await supabase
        .from('track_file_mappings')
        .select('id')
        .eq('track_id', nextTrack.id)
        .maybeSingle();
      
      if (existingMapping) return;
      
      console.log('Pre-loading next track:', nextTrack.title);
      
      if (nextTrack.album?.trim() && nextTrack.artist?.trim()) {
        try {
          const result = await searchStreams(
            credentials.realDebridApiKey,
            `${nextTrack.album} ${nextTrack.artist}`
          );
          
          if (result.torrents.length > 0) {
            const normalizeForMatch = (str: string): string => {
              return str
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9\s]/g, '')
                .trim();
            };
            
            const titleWords = normalizeForMatch(nextTrack.title).split(/\s+/).filter(w => w.length > 1);
            
            for (const torrent of result.torrents) {
              if (torrent.files && torrent.files.length > 0) {
                const matchingFile = torrent.files.find(file => {
                  const normalizedFile = normalizeForMatch(file.filename || '');
                  return titleWords.every(word => normalizedFile.includes(word));
                });
                
                if (matchingFile) {
                  await selectFilesAndPlay(credentials.realDebridApiKey, torrent.torrentId, [matchingFile.id]);
                  console.log('Pre-loaded next track file:', matchingFile.filename);
                  break;
                }
              }
            }
          }
        } catch (error) {
          console.log('Pre-load failed for next track, will load on play:', error);
        }
      }
    };
    
    // Delay pre-load to not interfere with current track loading
    const timeout = setTimeout(preloadNextTrack, 5000);
    return () => clearTimeout(timeout);
  }, [state.currentTrack, state.isPlaying, state.queueIndex, state.queue, credentials]);

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
