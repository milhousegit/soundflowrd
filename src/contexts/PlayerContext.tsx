import React, { createContext, useContext, useState, useRef, useCallback, ReactNode, useEffect } from 'react';
import { Track, PlayerState } from '@/types/music';

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
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

export const PlayerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<PlayerState>({
    currentTrack: null,
    isPlaying: false,
    volume: 0.7,
    progress: 0,
    duration: 0,
    queue: [],
    queueIndex: 0,
  });

  useEffect(() => {
    audioRef.current = new Audio();
    audioRef.current.volume = state.volume;

    const audio = audioRef.current;

    audio.addEventListener('timeupdate', () => {
      setState(prev => ({ ...prev, progress: audio.currentTime }));
    });

    audio.addEventListener('loadedmetadata', () => {
      setState(prev => ({ ...prev, duration: audio.duration }));
    });

    audio.addEventListener('ended', () => {
      next();
    });

    return () => {
      audio.pause();
      audio.src = '';
    };
  }, []);

  const playTrack = useCallback((track: Track, queue?: Track[]) => {
    if (audioRef.current && track.streamUrl) {
      audioRef.current.src = track.streamUrl;
      audioRef.current.play();
      setState(prev => ({
        ...prev,
        currentTrack: track,
        isPlaying: true,
        queue: queue || [track],
        queueIndex: queue ? queue.findIndex(t => t.id === track.id) : 0,
      }));
    } else {
      // Demo mode - no actual audio
      setState(prev => ({
        ...prev,
        currentTrack: track,
        isPlaying: true,
        queue: queue || [track],
        queueIndex: queue ? queue.findIndex(t => t.id === track.id) : 0,
        duration: track.duration,
      }));
    }

    // Save to recently played
    const recent = JSON.parse(localStorage.getItem('recentlyPlayed') || '[]');
    const filtered = recent.filter((t: Track) => t.id !== track.id);
    const updated = [track, ...filtered].slice(0, 20);
    localStorage.setItem('recentlyPlayed', JSON.stringify(updated));
  }, []);

  const play = useCallback((track?: Track) => {
    if (track) {
      playTrack(track);
    } else if (audioRef.current && state.currentTrack?.streamUrl) {
      audioRef.current.play();
      setState(prev => ({ ...prev, isPlaying: true }));
    } else {
      setState(prev => ({ ...prev, isPlaying: true }));
    }
  }, [state.currentTrack, playTrack]);

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
    const prevIndex = state.queueIndex - 1;
    if (prevIndex >= 0) {
      playTrack(state.queue[prevIndex], state.queue);
      setState(prev => ({ ...prev, queueIndex: prevIndex }));
    }
  }, [state.queue, state.queueIndex, playTrack]);

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
