// AudioContext-based crossfade hook for iOS PWA gapless playback
// Uses AudioBufferSourceNode + GainNode for smooth crossfading
// Based on iOS WebAudio best practices: single AudioContext, timer-based crossfade

import { useRef, useCallback, useEffect } from 'react';

export interface CrossfadeLog {
  timestamp: Date;
  type: 'info' | 'success' | 'error' | 'warning';
  message: string;
}

export interface CrossfadeState {
  isActive: boolean;
  progress: number; // 0-1
  currentTrackDuration: number;
  remainingTime: number;
}

interface CrossfadeTrack {
  url: string;
  trackId: string;
  onComplete?: () => void;
}

const CROSSFADE_DURATION_SECONDS = 3;
const CROSSFADE_START_BEFORE_END_SECONDS = 10;

export const useCrossfade = () => {
  // Single AudioContext (iOS allows only one per tab/PWA)
  const audioContextRef = useRef<AudioContext | null>(null);
  
  // Current track nodes
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const currentGainRef = useRef<GainNode | null>(null);
  const currentBufferRef = useRef<AudioBuffer | null>(null);
  const currentStartTimeRef = useRef<number>(0);
  
  // Next track nodes (preloaded)
  const nextSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const nextGainRef = useRef<GainNode | null>(null);
  const nextBufferRef = useRef<AudioBuffer | null>(null);
  const nextTrackIdRef = useRef<string | null>(null);
  
  // State tracking
  const isCrossfadingRef = useRef(false);
  const crossfadeTimerRef = useRef<number | null>(null);
  const isActiveRef = useRef(false);
  const logsRef = useRef<CrossfadeLog[]>([]);
  
  // Volume control
  const masterVolumeRef = useRef(0.7);
  
  // Callbacks
  const onTrackEndRef = useRef<(() => void) | null>(null);
  const onCrossfadeCompleteRef = useRef<((trackId: string) => void) | null>(null);
  
  const addLog = useCallback((type: CrossfadeLog['type'], message: string) => {
    const log: CrossfadeLog = {
      timestamp: new Date(),
      type,
      message,
    };
    logsRef.current.push(log);
    // Keep last 100 logs
    if (logsRef.current.length > 100) {
      logsRef.current = logsRef.current.slice(-100);
    }
    console.log(`[Crossfade ${type.toUpperCase()}] ${message}`);
  }, []);
  
  /**
   * Initialize AudioContext - call on first user interaction
   */
  const initialize = useCallback(async (): Promise<boolean> => {
    if (audioContextRef.current) {
      if (audioContextRef.current.state === 'suspended') {
        try {
          await audioContextRef.current.resume();
          addLog('success', 'AudioContext resumed');
        } catch (e) {
          addLog('error', `Failed to resume AudioContext: ${e}`);
        }
      }
      return true;
    }
    
    try {
      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) {
        addLog('error', 'AudioContext not supported');
        return false;
      }
      
      audioContextRef.current = new AudioCtx();
      addLog('success', `AudioContext created (sampleRate: ${audioContextRef.current.sampleRate})`);
      return true;
    } catch (e) {
      addLog('error', `Failed to create AudioContext: ${e}`);
      return false;
    }
  }, [addLog]);
  
  /**
   * Load audio from URL into an AudioBuffer
   */
  const loadBuffer = useCallback(async (url: string): Promise<AudioBuffer | null> => {
    if (!audioContextRef.current) {
      addLog('error', 'No AudioContext for loading buffer');
      return null;
    }
    
    try {
      addLog('info', `Loading buffer from: ${url.substring(0, 50)}...`);
      const response = await fetch(url);
      
      if (!response.ok) {
        addLog('error', `Fetch failed: ${response.status}`);
        return null;
      }
      
      const arrayBuffer = await response.arrayBuffer();
      addLog('info', `Fetched ${Math.round(arrayBuffer.byteLength / 1024)} KB, decoding...`);
      
      const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
      addLog('success', `Buffer decoded: ${audioBuffer.duration.toFixed(1)}s`);
      
      return audioBuffer;
    } catch (e) {
      addLog('error', `Failed to load buffer: ${e}`);
      return null;
    }
  }, [addLog]);
  
  /**
   * Create and connect a source node from a buffer
   */
  const createSourceFromBuffer = useCallback((buffer: AudioBuffer, gainNode: GainNode): AudioBufferSourceNode => {
    const ctx = audioContextRef.current!;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(gainNode);
    return source;
  }, []);
  
  /**
   * Start playing a track using AudioContext
   * Returns the duration of the track
   */
  const playWithCrossfade = useCallback(async (
    url: string,
    trackId: string,
    options?: {
      onTrackEnd?: () => void;
      onCrossfadeComplete?: (trackId: string) => void;
    }
  ): Promise<number> => {
    // Initialize context if needed
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      const success = await initialize();
      if (!success) return 0;
    }
    
    const ctx = audioContextRef.current!;
    
    // Resume if suspended
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
        addLog('info', 'AudioContext resumed for playback');
      } catch (e) {
        addLog('error', `Failed to resume: ${e}`);
        return 0;
      }
    }
    
    // Store callbacks
    onTrackEndRef.current = options?.onTrackEnd || null;
    onCrossfadeCompleteRef.current = options?.onCrossfadeComplete || null;
    
    // Stop current playback
    stopCurrent();
    
    // Load the buffer
    const buffer = await loadBuffer(url);
    if (!buffer) {
      addLog('error', 'Failed to load audio buffer');
      return 0;
    }
    
    // Create gain node
    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(masterVolumeRef.current, ctx.currentTime);
    gainNode.connect(ctx.destination);
    
    // Create source
    const source = createSourceFromBuffer(buffer, gainNode);
    
    // Store refs
    currentSourceRef.current = source;
    currentGainRef.current = gainNode;
    currentBufferRef.current = buffer;
    currentStartTimeRef.current = ctx.currentTime;
    
    // Start playback
    source.start(0);
    isActiveRef.current = true;
    addLog('success', `Playing: ${trackId} (duration: ${buffer.duration.toFixed(1)}s)`);
    
    // Set up crossfade timer (start crossfade X seconds before end)
    const crossfadeStartTime = (buffer.duration - CROSSFADE_START_BEFORE_END_SECONDS) * 1000;
    
    if (crossfadeStartTime > 0) {
      clearCrossfadeTimer();
      
      crossfadeTimerRef.current = window.setTimeout(() => {
        addLog('info', 'Crossfade timer triggered');
        triggerCrossfade();
      }, crossfadeStartTime);
      
      addLog('info', `Crossfade scheduled in ${(crossfadeStartTime / 1000).toFixed(1)}s`);
    }
    
    // Handle track end (fallback if crossfade doesn't happen)
    source.onended = () => {
      if (!isCrossfadingRef.current && isActiveRef.current) {
        addLog('info', 'Track ended naturally (no crossfade)');
        onTrackEndRef.current?.();
      }
    };
    
    return buffer.duration;
  }, [initialize, loadBuffer, createSourceFromBuffer, addLog]);
  
  /**
   * Preload next track for crossfade
   */
  const preloadNext = useCallback(async (url: string, trackId: string): Promise<boolean> => {
    if (!audioContextRef.current) {
      addLog('warning', 'No AudioContext for preloading');
      return false;
    }
    
    // Already preloaded?
    if (nextTrackIdRef.current === trackId && nextBufferRef.current) {
      addLog('info', `Track ${trackId} already preloaded`);
      return true;
    }
    
    addLog('info', `Preloading: ${trackId}`);
    
    const buffer = await loadBuffer(url);
    if (!buffer) {
      addLog('error', 'Failed to preload next track');
      return false;
    }
    
    // Create gain node (muted initially)
    const ctx = audioContextRef.current;
    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.connect(ctx.destination);
    
    nextBufferRef.current = buffer;
    nextGainRef.current = gainNode;
    nextTrackIdRef.current = trackId;
    
    addLog('success', `Preloaded: ${trackId} (${buffer.duration.toFixed(1)}s)`);
    return true;
  }, [loadBuffer, addLog]);
  
  /**
   * Execute the crossfade transition
   */
  const triggerCrossfade = useCallback(async () => {
    if (isCrossfadingRef.current) {
      addLog('warning', 'Crossfade already in progress');
      return;
    }
    
    if (!nextBufferRef.current || !nextGainRef.current) {
      addLog('warning', 'No preloaded track for crossfade, falling back to normal transition');
      onTrackEndRef.current?.();
      return;
    }
    
    const ctx = audioContextRef.current;
    if (!ctx || ctx.state !== 'running') {
      addLog('error', 'AudioContext not ready for crossfade');
      onTrackEndRef.current?.();
      return;
    }
    
    isCrossfadingRef.current = true;
    const now = ctx.currentTime;
    const fadeDuration = CROSSFADE_DURATION_SECONDS;
    
    addLog('info', `Starting crossfade (${fadeDuration}s)`);
    
    // Create and start the next source
    const nextSource = createSourceFromBuffer(nextBufferRef.current, nextGainRef.current);
    nextSourceRef.current = nextSource;
    nextSource.start(0);
    
    // Fade out current
    if (currentGainRef.current) {
      currentGainRef.current.gain.setValueAtTime(masterVolumeRef.current, now);
      currentGainRef.current.gain.linearRampToValueAtTime(0, now + fadeDuration);
    }
    
    // Fade in next
    nextGainRef.current.gain.setValueAtTime(0, now);
    nextGainRef.current.gain.linearRampToValueAtTime(masterVolumeRef.current, now + fadeDuration);
    
    // After fade completes, swap references
    setTimeout(() => {
      addLog('success', 'Crossfade complete');
      
      // Stop old source
      try {
        currentSourceRef.current?.stop();
      } catch (e) {
        // May already be stopped
      }
      
      // Disconnect old gain
      try {
        currentGainRef.current?.disconnect();
      } catch (e) {
        // May already be disconnected
      }
      
      // Swap to new track
      currentSourceRef.current = nextSourceRef.current;
      currentGainRef.current = nextGainRef.current;
      currentBufferRef.current = nextBufferRef.current;
      currentStartTimeRef.current = ctx.currentTime - fadeDuration;
      
      const completedTrackId = nextTrackIdRef.current;
      
      // Clear next refs
      nextSourceRef.current = null;
      nextGainRef.current = null;
      nextBufferRef.current = null;
      nextTrackIdRef.current = null;
      
      isCrossfadingRef.current = false;
      
      // Set up new crossfade timer for the new track
      const newDuration = currentBufferRef.current?.duration || 0;
      const crossfadeStartTime = (newDuration - fadeDuration - CROSSFADE_START_BEFORE_END_SECONDS) * 1000;
      
      if (crossfadeStartTime > 0) {
        clearCrossfadeTimer();
        crossfadeTimerRef.current = window.setTimeout(() => {
          addLog('info', 'Crossfade timer triggered (new track)');
          triggerCrossfade();
        }, crossfadeStartTime);
      }
      
      // Callback and dispatch event
      if (completedTrackId) {
        onCrossfadeCompleteRef.current?.(completedTrackId);
        
        // Dispatch custom event for PlayerContext to update state
        window.dispatchEvent(new CustomEvent('audiocontext-crossfade-complete', {
          detail: { trackId: completedTrackId }
        }));
      }
      
      // Handle new track end
      if (currentSourceRef.current) {
        currentSourceRef.current.onended = () => {
          if (!isCrossfadingRef.current && isActiveRef.current) {
            addLog('info', 'Track ended naturally (new track)');
            onTrackEndRef.current?.();
          }
        };
      }
    }, fadeDuration * 1000);
  }, [createSourceFromBuffer, addLog]);
  
  /**
   * Clear the crossfade timer
   */
  const clearCrossfadeTimer = useCallback(() => {
    if (crossfadeTimerRef.current !== null) {
      window.clearTimeout(crossfadeTimerRef.current);
      crossfadeTimerRef.current = null;
    }
  }, []);
  
  /**
   * Stop current playback
   */
  const stopCurrent = useCallback(() => {
    clearCrossfadeTimer();
    isActiveRef.current = false;
    
    try {
      currentSourceRef.current?.stop();
    } catch (e) {
      // May already be stopped
    }
    
    try {
      currentGainRef.current?.disconnect();
    } catch (e) {
      // May already be disconnected
    }
    
    currentSourceRef.current = null;
    currentGainRef.current = null;
    currentBufferRef.current = null;
    
    // Also clear next track
    try {
      nextSourceRef.current?.stop();
    } catch (e) {
      // May already be stopped
    }
    
    try {
      nextGainRef.current?.disconnect();
    } catch (e) {
      // May already be disconnected
    }
    
    nextSourceRef.current = null;
    nextGainRef.current = null;
    nextBufferRef.current = null;
    nextTrackIdRef.current = null;
    
    isCrossfadingRef.current = false;
    addLog('info', 'Playback stopped');
  }, [clearCrossfadeTimer, addLog]);
  
  /**
   * Pause playback (AudioBufferSourceNode cannot be paused, so we stop)
   * For true pause/resume, HTMLAudioElement is better - crossfade is for gapless transitions
   */
  const pause = useCallback(() => {
    const ctx = audioContextRef.current;
    if (ctx && ctx.state === 'running') {
      ctx.suspend();
      addLog('info', 'AudioContext suspended (pause)');
    }
  }, [addLog]);
  
  /**
   * Resume playback
   */
  const resume = useCallback(async () => {
    const ctx = audioContextRef.current;
    if (ctx && ctx.state === 'suspended') {
      await ctx.resume();
      addLog('info', 'AudioContext resumed');
    }
  }, [addLog]);
  
  /**
   * Set master volume
   */
  const setVolume = useCallback((volume: number) => {
    masterVolumeRef.current = Math.max(0, Math.min(1, volume));
    
    const ctx = audioContextRef.current;
    if (ctx && currentGainRef.current && !isCrossfadingRef.current) {
      currentGainRef.current.gain.setValueAtTime(masterVolumeRef.current, ctx.currentTime);
    }
  }, []);
  
  /**
   * Get current playback time
   */
  const getCurrentTime = useCallback((): number => {
    const ctx = audioContextRef.current;
    if (!ctx || !isActiveRef.current) return 0;
    
    return ctx.currentTime - currentStartTimeRef.current;
  }, []);
  
  /**
   * Get current state
   */
  const getState = useCallback((): CrossfadeState => {
    const duration = currentBufferRef.current?.duration || 0;
    const currentTime = getCurrentTime();
    
    return {
      isActive: isActiveRef.current,
      progress: isCrossfadingRef.current ? 0 : 0,
      currentTrackDuration: duration,
      remainingTime: Math.max(0, duration - currentTime),
    };
  }, [getCurrentTime]);
  
  /**
   * Get logs
   */
  const getLogs = useCallback(() => [...logsRef.current], []);
  
  /**
   * Clear logs
   */
  const clearLogs = useCallback(() => {
    logsRef.current = [];
  }, []);
  
  /**
   * Check if crossfade is supported and active
   */
  const isSupported = useCallback(() => {
    return !!(window as any).AudioContext || !!(window as any).webkitAudioContext;
  }, []);
  
  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      stopCurrent();
      clearCrossfadeTimer();
      
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
    };
  }, [stopCurrent, clearCrossfadeTimer]);
  
  return {
    // Core functions
    initialize,
    playWithCrossfade,
    preloadNext,
    triggerCrossfade,
    stopCurrent,
    pause,
    resume,
    setVolume,
    
    // State
    getCurrentTime,
    getState,
    isSupported,
    isCrossfading: () => isCrossfadingRef.current,
    isPlaying: () => isActiveRef.current,
    hasPreloadedNext: () => !!nextBufferRef.current,
    
    // Logging
    getLogs,
    clearLogs,
  };
};

export default useCrossfade;
