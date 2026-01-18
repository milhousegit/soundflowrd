// useCrossfade - Web Audio API crossfade system for gapless playback
// Uses a single shared AudioContext with two AudioBufferSourceNodes for smooth transitions

import { useRef, useCallback, useEffect } from 'react';
import { isIOS, isPWA } from './useIOSAudioSession';

interface CrossfadeSource {
  sourceNode: AudioBufferSourceNode | null;
  gainNode: GainNode | null;
  buffer: AudioBuffer | null;
  duration: number;
}

interface UseCrossfadeOptions {
  fadeDuration?: number; // seconds
  onTrackEnd?: () => void;
  onCrossfadeStart?: () => void;
  enabled?: boolean;
}

export interface CrossfadeHandle {
  // Load a buffer into the current source and start playing
  playFromUrl: (url: string, startOffset?: number) => Promise<boolean>;
  // Preload the next track's buffer (won't start playing)
  preloadNext: (url: string) => Promise<boolean>;
  // Preload from an existing buffer
  preloadNextFromBuffer: (buffer: AudioBuffer) => void;
  // Play from an existing buffer
  playFromBuffer: (buffer: AudioBuffer, startOffset?: number) => Promise<boolean>;
  // Trigger crossfade transition now (manual)
  crossfadeToNext: () => void;
  // Stop all playback
  stop: () => void;
  // Pause
  pause: () => void;
  // Resume
  resume: () => Promise<boolean>;
  // Seek to time (restarts buffer from offset)
  seek: (time: number) => Promise<void>;
  // Current playback time
  getCurrentTime: () => number;
  // Current duration
  getDuration: () => number;
  // Is currently playing
  isPlaying: () => boolean;
  // Get the AudioContext (for external integrations)
  getAudioContext: () => AudioContext | null;
  // Expose buffer for iOS queue prefetch
  getCurrentBuffer: () => AudioBuffer | null;
  getNextBuffer: () => AudioBuffer | null;
}

export const useCrossfade = (options: UseCrossfadeOptions = {}): CrossfadeHandle => {
  const { fadeDuration = 3, onTrackEnd, onCrossfadeStart, enabled = true } = options;

  // Shared AudioContext
  const audioContextRef = useRef<AudioContext | null>(null);
  
  // Current and next sources
  const currentRef = useRef<CrossfadeSource>({
    sourceNode: null,
    gainNode: null,
    buffer: null,
    duration: 0,
  });
  
  const nextRef = useRef<CrossfadeSource>({
    sourceNode: null,
    gainNode: null,
    buffer: null,
    duration: 0,
  });
  
  // Playback state
  const isPlayingRef = useRef(false);
  const startTimeRef = useRef(0); // AudioContext time when playback started
  const pauseOffsetRef = useRef(0); // Offset when paused
  const crossfadeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize AudioContext lazily
  const getOrCreateContext = useCallback((): AudioContext | null => {
    if (audioContextRef.current) {
      // Resume if suspended
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }
      return audioContextRef.current;
    }
    
    try {
      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        audioContextRef.current = new AudioCtx();
        console.log('[Crossfade] AudioContext created, sampleRate:', audioContextRef.current.sampleRate);
        return audioContextRef.current;
      }
    } catch (e) {
      console.error('[Crossfade] Failed to create AudioContext:', e);
    }
    return null;
  }, []);

  // Load audio from URL and decode into buffer
  const loadBuffer = useCallback(async (url: string): Promise<AudioBuffer | null> => {
    const ctx = getOrCreateContext();
    if (!ctx) return null;
    
    try {
      console.log('[Crossfade] Loading buffer from URL...');
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      console.log('[Crossfade] Buffer loaded, duration:', audioBuffer.duration.toFixed(2), 's');
      return audioBuffer;
    } catch (e) {
      console.error('[Crossfade] Failed to load buffer:', e);
      return null;
    }
  }, [getOrCreateContext]);

  // Create source node from buffer and connect to gain
  const createSourceFromBuffer = useCallback((buffer: AudioBuffer): CrossfadeSource => {
    const ctx = getOrCreateContext();
    if (!ctx) return { sourceNode: null, gainNode: null, buffer: null, duration: 0 };
    
    const sourceNode = ctx.createBufferSource();
    sourceNode.buffer = buffer;
    
    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    
    sourceNode.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    return {
      sourceNode,
      gainNode,
      buffer,
      duration: buffer.duration,
    };
  }, [getOrCreateContext]);

  // Schedule crossfade based on current buffer duration
  const scheduleCrossfade = useCallback(() => {
    if (crossfadeTimeoutRef.current) {
      clearTimeout(crossfadeTimeoutRef.current);
      crossfadeTimeoutRef.current = null;
    }
    
    const current = currentRef.current;
    if (!current.buffer || current.duration <= 0) return;
    
    const ctx = audioContextRef.current;
    if (!ctx) return;
    
    // Calculate remaining time
    const elapsed = ctx.currentTime - startTimeRef.current + pauseOffsetRef.current;
    const remaining = current.duration - elapsed;
    
    // Schedule crossfade fadeDuration seconds before end
    const crossfadeStartIn = Math.max(0, (remaining - fadeDuration) * 1000);
    
    console.log('[Crossfade] Scheduling crossfade in', (crossfadeStartIn / 1000).toFixed(2), 's');
    
    crossfadeTimeoutRef.current = setTimeout(() => {
      if (isPlayingRef.current) {
        performCrossfade();
      }
    }, crossfadeStartIn);
  }, [fadeDuration]);

  // Perform the actual crossfade
  const performCrossfade = useCallback(() => {
    const ctx = audioContextRef.current;
    const current = currentRef.current;
    const next = nextRef.current;
    
    if (!ctx) return;
    
    console.log('[Crossfade] Starting crossfade transition');
    onCrossfadeStart?.();
    
    const now = ctx.currentTime;
    
    // Fade out current
    if (current.gainNode) {
      current.gainNode.gain.setValueAtTime(current.gainNode.gain.value, now);
      current.gainNode.gain.linearRampToValueAtTime(0, now + fadeDuration);
    }
    
    // If we have a preloaded next buffer, start it
    if (next.buffer && next.gainNode) {
      next.gainNode.gain.setValueAtTime(0, now);
      next.gainNode.gain.linearRampToValueAtTime(1, now + fadeDuration);
      
      if (next.sourceNode) {
        try {
          next.sourceNode.start(0);
        } catch (e) {
          // Already started or error
          console.log('[Crossfade] Source already started:', e);
        }
      }
    }
    
    // After fade completes, cleanup current and promote next
    setTimeout(() => {
      // Stop old current
      if (current.sourceNode) {
        try {
          current.sourceNode.stop();
          current.sourceNode.disconnect();
        } catch (e) {
          // Already stopped
        }
      }
      if (current.gainNode) {
        current.gainNode.disconnect();
      }
      
      // Promote next to current
      currentRef.current = { ...nextRef.current };
      startTimeRef.current = ctx.currentTime;
      pauseOffsetRef.current = 0;
      
      // Clear next
      nextRef.current = {
        sourceNode: null,
        gainNode: null,
        buffer: null,
        duration: 0,
      };
      
      // Schedule next crossfade if still playing
      if (isPlayingRef.current && currentRef.current.buffer) {
        scheduleCrossfade();
      }
      
      // Notify track end (caller should preload next)
      onTrackEnd?.();
    }, fadeDuration * 1000);
  }, [fadeDuration, onCrossfadeStart, onTrackEnd, scheduleCrossfade]);

  // Public: Play from URL
  const playFromUrl = useCallback(async (url: string, startOffset: number = 0): Promise<boolean> => {
    if (!enabled) return false;
    
    const buffer = await loadBuffer(url);
    if (!buffer) return false;
    
    return playFromBuffer(buffer, startOffset);
  }, [enabled, loadBuffer]);

  // Public: Play from existing buffer
  const playFromBuffer = useCallback(async (buffer: AudioBuffer, startOffset: number = 0): Promise<boolean> => {
    const ctx = getOrCreateContext();
    if (!ctx) return false;
    
    // Stop current if playing
    if (currentRef.current.sourceNode) {
      try {
        currentRef.current.sourceNode.stop();
        currentRef.current.sourceNode.disconnect();
      } catch (e) {}
    }
    if (currentRef.current.gainNode) {
      currentRef.current.gainNode.disconnect();
    }
    
    // Clear any scheduled crossfade
    if (crossfadeTimeoutRef.current) {
      clearTimeout(crossfadeTimeoutRef.current);
      crossfadeTimeoutRef.current = null;
    }
    
    // Create new source
    const newSource = createSourceFromBuffer(buffer);
    if (!newSource.sourceNode || !newSource.gainNode) return false;
    
    // Set up for playback
    currentRef.current = newSource;
    pauseOffsetRef.current = startOffset;
    
    // Fade in immediately
    newSource.gainNode.gain.setValueAtTime(0, ctx.currentTime);
    newSource.gainNode.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.1);
    
    // Start playback
    try {
      newSource.sourceNode.start(0, startOffset);
      startTimeRef.current = ctx.currentTime;
      isPlayingRef.current = true;
      
      console.log('[Crossfade] Playback started, offset:', startOffset);
      
      // Schedule crossfade
      scheduleCrossfade();
      
      return true;
    } catch (e) {
      console.error('[Crossfade] Failed to start playback:', e);
      return false;
    }
  }, [getOrCreateContext, createSourceFromBuffer, scheduleCrossfade]);

  // Public: Preload next track
  const preloadNext = useCallback(async (url: string): Promise<boolean> => {
    const buffer = await loadBuffer(url);
    if (!buffer) return false;
    
    preloadNextFromBuffer(buffer);
    return true;
  }, [loadBuffer]);

  // Public: Preload next from buffer
  const preloadNextFromBuffer = useCallback((buffer: AudioBuffer) => {
    const newSource = createSourceFromBuffer(buffer);
    nextRef.current = newSource;
    console.log('[Crossfade] Next track preloaded, duration:', buffer.duration.toFixed(2));
  }, [createSourceFromBuffer]);

  // Public: Manual crossfade trigger
  const crossfadeToNext = useCallback(() => {
    if (nextRef.current.buffer) {
      performCrossfade();
    } else {
      console.log('[Crossfade] No next track preloaded, cannot crossfade');
      // Just stop current
      stop();
      onTrackEnd?.();
    }
  }, [performCrossfade, onTrackEnd]);

  // Public: Stop
  const stop = useCallback(() => {
    if (crossfadeTimeoutRef.current) {
      clearTimeout(crossfadeTimeoutRef.current);
      crossfadeTimeoutRef.current = null;
    }
    
    // Stop current
    if (currentRef.current.sourceNode) {
      try {
        currentRef.current.sourceNode.stop();
        currentRef.current.sourceNode.disconnect();
      } catch (e) {}
    }
    if (currentRef.current.gainNode) {
      currentRef.current.gainNode.disconnect();
    }
    
    // Stop next
    if (nextRef.current.sourceNode) {
      try {
        nextRef.current.sourceNode.stop();
        nextRef.current.sourceNode.disconnect();
      } catch (e) {}
    }
    if (nextRef.current.gainNode) {
      nextRef.current.gainNode.disconnect();
    }
    
    currentRef.current = { sourceNode: null, gainNode: null, buffer: null, duration: 0 };
    nextRef.current = { sourceNode: null, gainNode: null, buffer: null, duration: 0 };
    isPlayingRef.current = false;
    pauseOffsetRef.current = 0;
    startTimeRef.current = 0;
  }, []);

  // Public: Pause
  const pause = useCallback(() => {
    const ctx = audioContextRef.current;
    if (!ctx || !isPlayingRef.current) return;
    
    // Calculate current offset
    const elapsed = ctx.currentTime - startTimeRef.current;
    pauseOffsetRef.current = pauseOffsetRef.current + elapsed;
    
    // Stop source (we'll recreate on resume)
    if (currentRef.current.sourceNode) {
      try {
        currentRef.current.sourceNode.stop();
        currentRef.current.sourceNode.disconnect();
      } catch (e) {}
      currentRef.current.sourceNode = null;
    }
    
    // Clear scheduled crossfade
    if (crossfadeTimeoutRef.current) {
      clearTimeout(crossfadeTimeoutRef.current);
      crossfadeTimeoutRef.current = null;
    }
    
    isPlayingRef.current = false;
    console.log('[Crossfade] Paused at offset:', pauseOffsetRef.current);
  }, []);

  // Public: Resume
  const resume = useCallback(async (): Promise<boolean> => {
    const ctx = getOrCreateContext();
    const buffer = currentRef.current.buffer;
    if (!ctx || !buffer) return false;
    
    // Recreate source from stored buffer
    const newSource = createSourceFromBuffer(buffer);
    if (!newSource.sourceNode || !newSource.gainNode) return false;
    
    currentRef.current.sourceNode = newSource.sourceNode;
    currentRef.current.gainNode = newSource.gainNode;
    
    // Set gain to 1 immediately
    newSource.gainNode.gain.setValueAtTime(1, ctx.currentTime);
    
    // Start from paused offset
    try {
      newSource.sourceNode.start(0, pauseOffsetRef.current);
      startTimeRef.current = ctx.currentTime;
      isPlayingRef.current = true;
      
      console.log('[Crossfade] Resumed from offset:', pauseOffsetRef.current);
      
      // Re-schedule crossfade
      scheduleCrossfade();
      
      return true;
    } catch (e) {
      console.error('[Crossfade] Failed to resume:', e);
      return false;
    }
  }, [getOrCreateContext, createSourceFromBuffer, scheduleCrossfade]);

  // Public: Seek
  const seek = useCallback(async (time: number): Promise<void> => {
    const buffer = currentRef.current.buffer;
    if (!buffer) return;
    
    const wasPlaying = isPlayingRef.current;
    
    // Stop current
    if (currentRef.current.sourceNode) {
      try {
        currentRef.current.sourceNode.stop();
        currentRef.current.sourceNode.disconnect();
      } catch (e) {}
      currentRef.current.sourceNode = null;
    }
    
    pauseOffsetRef.current = Math.max(0, Math.min(time, buffer.duration));
    
    if (wasPlaying) {
      await resume();
    }
  }, [resume]);

  // Public: Get current time
  const getCurrentTime = useCallback((): number => {
    const ctx = audioContextRef.current;
    if (!ctx || !isPlayingRef.current) return pauseOffsetRef.current;
    
    const elapsed = ctx.currentTime - startTimeRef.current;
    return pauseOffsetRef.current + elapsed;
  }, []);

  // Public: Get duration
  const getDuration = useCallback((): number => {
    return currentRef.current.duration || 0;
  }, []);

  // Public: Is playing
  const isPlaying = useCallback((): boolean => {
    return isPlayingRef.current;
  }, []);

  // Public: Get AudioContext
  const getAudioContext = useCallback((): AudioContext | null => {
    return audioContextRef.current;
  }, []);

  // Public: Get current buffer
  const getCurrentBuffer = useCallback((): AudioBuffer | null => {
    return currentRef.current.buffer;
  }, []);

  // Public: Get next buffer
  const getNextBuffer = useCallback((): AudioBuffer | null => {
    return nextRef.current.buffer;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stop();
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
    };
  }, [stop]);

  return {
    playFromUrl,
    preloadNext,
    preloadNextFromBuffer,
    playFromBuffer,
    crossfadeToNext,
    stop,
    pause,
    resume,
    seek,
    getCurrentTime,
    getDuration,
    isPlaying,
    getAudioContext,
    getCurrentBuffer,
    getNextBuffer,
  };
};

export default useCrossfade;
