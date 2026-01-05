import React, { createContext, useContext, useState, useRef, useCallback, ReactNode, useEffect } from 'react';
import { Track, PlayerState } from '@/types/music';
import { StreamResult, TorrentInfo, AudioFile, searchStreams, selectFilesAndPlay, checkTorrentStatus } from '@/lib/realdebrid';
import { useAuth } from './AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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
  clearQueue: () => void;
  alternativeStreams: StreamResult[];
  availableTorrents: TorrentInfo[];
  selectStream: (stream: StreamResult) => void;
  selectTorrentFile: (torrentId: string, fileIds: number[]) => Promise<void>;
  refreshTorrent: (torrentId: string) => Promise<void>;
  currentStreamId?: string;
  isSearchingStreams: boolean;
  manualSearch: (query: string) => Promise<void>;
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

  const searchForStreams = useCallback(async (query: string, showNoResultsToast = false) => {
    if (!credentials?.realDebridApiKey) return;
    
    setIsSearchingStreams(true);
    setAlternativeStreams([]);
    setAvailableTorrents([]);
    
    try {
      const result = await searchStreams(
        credentials.realDebridApiKey,
        query
      );
      
      setAvailableTorrents(result.torrents);
      
      // If any torrent has ready streams (cached), get them
      if (result.streams && result.streams.length > 0) {
        setAlternativeStreams(result.streams);
        
        // Auto-select first stream if available
        setCurrentStreamId(result.streams[0].id);
        if (audioRef.current && result.streams[0].streamUrl) {
          audioRef.current.src = result.streams[0].streamUrl;
          audioRef.current.play();
          setState(prev => ({ ...prev, isPlaying: true }));
        }
      } else if (showNoResultsToast && result.torrents.length === 0) {
        // Show toast when no content found and it was requested
        toast.error('Nessun contenuto trovato', {
          description: 'Non è stato trovato nessun risultato per questa traccia.',
        });
      }
    } catch (error) {
      console.error('Failed to search streams:', error);
      if (showNoResultsToast) {
        toast.error('Errore nella ricerca', {
          description: 'Si è verificato un errore durante la ricerca.',
        });
      }
    } finally {
      setIsSearchingStreams(false);
    }
  }, [credentials]);

  const selectTorrentFile = useCallback(async (torrentId: string, fileIds: number[]) => {
    if (!credentials?.realDebridApiKey) return;
    
    console.log('Selecting files:', torrentId, fileIds);
    
    try {
      const result = await selectFilesAndPlay(credentials.realDebridApiKey, torrentId, fileIds);
      console.log('Select result:', result);
      
      if (result.streams.length > 0) {
        // Add streams and auto-play first one
        setAlternativeStreams(prev => [...result.streams, ...prev]);
        setCurrentStreamId(result.streams[0].id);
        
        if (audioRef.current && result.streams[0].streamUrl) {
          audioRef.current.src = result.streams[0].streamUrl;
          audioRef.current.play();
          setState(prev => ({ ...prev, isPlaying: true }));
        }
      } else if (result.status === 'downloading' || result.status === 'queued' || result.status === 'magnet_conversion') {
        // Update torrent status in the list
        setAvailableTorrents(prev => prev.map(t => 
          t.torrentId === torrentId 
            ? { ...t, status: result.status, progress: result.progress }
            : t
        ));
      }
    } catch (error) {
      console.error('Failed to select files:', error);
    }
  }, [credentials]);

  const refreshTorrent = useCallback(async (torrentId: string) => {
    if (!credentials?.realDebridApiKey) return;
    
    try {
      const result = await checkTorrentStatus(credentials.realDebridApiKey, torrentId);
      console.log('Torrent status check:', torrentId, result);
      
      // Update torrent in list
      setAvailableTorrents(prev => prev.map(t => 
        t.torrentId === torrentId 
          ? { ...t, status: result.status, progress: result.progress, files: result.files.length > 0 ? result.files : t.files }
          : t
      ));
      
      if (result.streams.length > 0) {
        // Add new streams
        setAlternativeStreams(prev => {
          const existingIds = new Set(prev.map(s => s.id));
          const newStreams = result.streams.filter(s => !existingIds.has(s.id));
          return [...prev, ...newStreams];
        });
        
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
      console.error('Failed to check torrent status:', error);
    }
  }, [credentials, currentStreamId]);

  const manualSearch = useCallback(async (query: string) => {
    await searchForStreams(query, true);
  }, [searchForStreams]);

  const playTrack = useCallback(async (track: Track, queue?: Track[]) => {
    setState(prev => ({
      ...prev,
      currentTrack: track,
      isPlaying: true,
      queue: queue || [track],
      queueIndex: queue ? queue.findIndex(t => t.id === track.id) : 0,
      duration: track.duration,
      progress: 0,
    }));

    // First check if we have a saved mapping for this track
    if (credentials?.realDebridApiKey && track.albumId) {
      try {
        const { data: trackMapping } = await supabase
          .from('track_file_mappings')
          .select('*, album_torrent_mappings!inner(*)')
          .eq('track_id', track.id)
          .maybeSingle();

        if (trackMapping) {
          console.log('Found saved mapping for track:', track.title, trackMapping);
          
          // Use the saved torrent and file mapping
          const torrentId = trackMapping.album_torrent_mappings.torrent_id;
          const fileId = trackMapping.file_id;
          
          // Select and play this specific file
          const result = await selectFilesAndPlay(credentials.realDebridApiKey, torrentId, [fileId]);
          
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
            setAvailableTorrents([{
              torrentId,
              title: trackMapping.album_torrent_mappings.torrent_title,
              size: 'Unknown',
              source: 'Saved',
              seeders: 0,
              status: result.status,
              progress: result.progress,
              files: [],
              hasLinks: false,
            }]);
          }
        }
      } catch (error) {
        console.error('Failed to check saved mapping:', error);
      }
    }

    // No saved mapping, search for streams via Real-Debrid with artist + title
    // Pass true to show toast when no results found
    searchForStreams(`${track.artist} ${track.title}`, true);

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
    setCurrentStreamId(stream.id);
    if (audioRef.current && stream.streamUrl) {
      const currentTime = audioRef.current.currentTime;
      audioRef.current.src = stream.streamUrl;
      audioRef.current.currentTime = currentTime;
      if (state.isPlaying) {
        audioRef.current.play();
      }
    }

    // Save stream selection to database for future playback
    const currentTrack = state.currentTrack;
    if (currentTrack?.albumId && currentTrack?.id) {
      try {
        // First, find or create album_torrent_mapping
        let albumMappingId: string | null = null;
        
        // Check if we have existing album mapping
        const { data: existingMapping } = await supabase
          .from('album_torrent_mappings')
          .select('id')
          .eq('album_id', currentTrack.albumId)
          .maybeSingle();
        
        if (existingMapping) {
          albumMappingId = existingMapping.id;
        } else {
          // Create new album mapping with stream info
          const { data: newMapping, error: insertError } = await supabase
            .from('album_torrent_mappings')
            .insert({
              album_id: currentTrack.albumId,
              album_title: currentTrack.album || currentTrack.title,
              artist_name: currentTrack.artist,
              torrent_id: stream.id,
              torrent_title: stream.title || currentTrack.title,
            })
            .select('id')
            .single();
          
          if (!insertError && newMapping) {
            albumMappingId = newMapping.id;
          }
        }

        if (albumMappingId) {
          // Upsert track file mapping
          const { error: trackError } = await supabase
            .from('track_file_mappings')
            .upsert({
              album_mapping_id: albumMappingId,
              track_id: currentTrack.id,
              track_title: currentTrack.title,
              track_position: null,
              file_id: parseInt(stream.id) || 0,
              file_path: stream.streamUrl,
              file_name: stream.title || currentTrack.title,
            }, {
              onConflict: 'track_id',
            });

          if (!trackError) {
            console.log('Saved stream selection for track:', currentTrack.title);
            toast.success('Sorgente salvata', {
              description: 'Questa sorgente verrà usata automaticamente la prossima volta.',
              duration: 2000,
            });
          }
        }
      } catch (error) {
        console.error('Failed to save stream selection:', error);
      }
    }
  }, [state.isPlaying, state.currentTrack]);

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
        clearQueue,
        alternativeStreams,
        availableTorrents,
        selectStream,
        selectTorrentFile,
        refreshTorrent,
        currentStreamId,
        isSearchingStreams,
        manualSearch,
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
