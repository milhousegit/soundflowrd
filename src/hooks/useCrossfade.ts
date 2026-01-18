// useCrossfade - Web Audio API crossfade system for gapless playback
// v1.7.2: iOS uses HTMLAudioElement with native volume control (NOT Web Audio output)
// to ensure background playback works. Web Audio is only used on non-iOS platforms.

import { useRef, useCallback, useEffect } from 'react';
import { isIOS } from './useIOSAudioSession';

interface CrossfadeSource {
  sourceNode: AudioBufferSourceNode | null;
  gainNode: GainNode | null;
  buffer: AudioBuffer | null;
  duration: number;
}

interface MediaElementSource {
  audioElement: HTMLAudioElement | null;
  // Note: No Web Audio nodes on iOS - audio goes directly through HTMLAudioElement
  // to ensure background playback works (iOS suspends AudioContext in background)
  url: string;
  duration: number;
  fadeInterval: NodeJS.Timeout | null;
  endedHandler: (() => void) | null; // Fallback for when setTimeout is suspended
}

interface UseCrossfadeOptions {
  fadeDuration?: number;
  onTrackEnd?: () => void;
  onCrossfadeStart?: () => void;
  enabled?: boolean;
}

export interface CrossfadeHandle {
  playFromUrl: (url: string, startOffset?: number) => Promise<boolean>;
  preloadNext: (url: string) => Promise<boolean>;
  preloadNextFromBuffer: (buffer: AudioBuffer) => void;
  playFromBuffer: (buffer: AudioBuffer, startOffset?: number) => Promise<boolean>;
  crossfadeToNext: () => void;
  stop: () => void;
  pause: () => void;
  resume: () => Promise<boolean>;
  seek: (time: number) => Promise<void>;
  getCurrentTime: () => number;
  getDuration: () => number;
  isPlaying: () => boolean;
  getAudioContext: () => AudioContext | null;
  getCurrentBuffer: () => AudioBuffer | null;
  getNextBuffer: () => AudioBuffer | null;
}

export const useCrossfade = (options: UseCrossfadeOptions = {}): CrossfadeHandle => {
  const { fadeDuration = 3, onTrackEnd, onCrossfadeStart, enabled = true } = options;

  const useMediaElementMode = isIOS();

  const audioContextRef = useRef<AudioContext | null>(null);
  
  // Buffer-based sources (non-iOS)
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

  // MediaElement-based sources (iOS) - NO Web Audio, direct HTMLAudioElement output
  const currentMediaRef = useRef<MediaElementSource>({
    audioElement: null,
    url: '',
    duration: 0,
    fadeInterval: null,
    endedHandler: null,
  });

  const nextMediaRef = useRef<MediaElementSource>({
    audioElement: null,
    url: '',
    duration: 0,
    fadeInterval: null,
    endedHandler: null,
  });
  
  const isPlayingRef = useRef(false);
  const startTimeRef = useRef(0);
  const pauseOffsetRef = useRef(0);
  const crossfadeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Refs for callbacks to break circular dependencies
  const onTrackEndRef = useRef(onTrackEnd);
  const onCrossfadeStartRef = useRef(onCrossfadeStart);
  onTrackEndRef.current = onTrackEnd;
  onCrossfadeStartRef.current = onCrossfadeStart;

  const getOrCreateContext = useCallback((): AudioContext | null => {
    if (audioContextRef.current) {
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

  // ========== iOS MediaElement Mode ==========

  // iOS: Create HTMLAudioElement WITHOUT connecting to Web Audio
  // This ensures audio plays through native iOS audio system which works in background
  const createMediaElementSource = useCallback((url: string): MediaElementSource => {
    const audio = document.createElement('audio');
    audio.crossOrigin = 'anonymous';
    audio.preload = 'auto';
    audio.setAttribute('playsinline', '');
    audio.setAttribute('webkit-playsinline', '');
    audio.src = url;
    audio.volume = 0; // Start muted, will fade in

    console.log('[Crossfade/iOS] Created HTMLAudioElement (native output, no Web Audio)');

    return {
      audioElement: audio,
      url,
      duration: 0,
      fadeInterval: null,
      endedHandler: null,
    };
  }, []);

  // Forward declaration via ref to break circular dependency
  const performMediaElementCrossfadeRef = useRef<() => void>(() => {});

  const scheduleMediaElementCrossfade = useCallback(() => {
    if (crossfadeTimeoutRef.current) {
      clearTimeout(crossfadeTimeoutRef.current);
      crossfadeTimeoutRef.current = null;
    }

    const audio = currentMediaRef.current.audioElement;
    if (!audio || !audio.duration) return;

    const checkTime = () => {
      if (!isPlayingRef.current) return;
      
      const remaining = audio.duration - audio.currentTime;
      
      if (remaining <= fadeDuration && remaining > 0) {
        performMediaElementCrossfadeRef.current();
      } else if (remaining > fadeDuration) {
        crossfadeTimeoutRef.current = setTimeout(checkTime, (remaining - fadeDuration - 0.5) * 1000);
      }
    };

    crossfadeTimeoutRef.current = setTimeout(checkTime, 1000);
  }, [fadeDuration]);

  // iOS crossfade using HTMLAudioElement.volume (native, works in background)
  const performMediaElementCrossfade = useCallback(() => {
    const current = currentMediaRef.current;
    const next = nextMediaRef.current;

    // Prevent double-trigger: if crossfade already in progress, skip
    if (current.fadeInterval) {
      console.log('[Crossfade/iOS] Crossfade already in progress, skipping');
      return;
    }

    console.log('[Crossfade/iOS] Starting crossfade transition (native volume control)');
    onCrossfadeStartRef.current?.();

    // Clear any existing fade intervals
    if (next.fadeInterval) clearInterval(next.fadeInterval);

    // Remove 'ended' handler from current track to prevent double-trigger
    if (current.audioElement && current.endedHandler) {
      current.audioElement.removeEventListener('ended', current.endedHandler);
      current.endedHandler = null;
    }

    const fadeSteps = 30; // 30 steps over fadeDuration
    const stepTime = (fadeDuration * 1000) / fadeSteps;
    let step = 0;

    // Start next track
    if (next.audioElement) {
      next.audioElement.volume = 0;
      next.audioElement.play().catch(() => {});
    }

    // Crossfade using native volume
    const fadeInterval = setInterval(() => {
      step++;
      const progress = step / fadeSteps;

      if (current.audioElement) {
        current.audioElement.volume = Math.max(0, 1 - progress);
      }
      if (next.audioElement) {
        next.audioElement.volume = Math.min(1, progress);
      }

      if (step >= fadeSteps) {
        clearInterval(fadeInterval);
        current.fadeInterval = null;

        // Cleanup old track
        if (current.audioElement) {
          current.audioElement.pause();
          current.audioElement.src = '';
        }

        currentMediaRef.current = { ...nextMediaRef.current };
        nextMediaRef.current = {
          audioElement: null,
          url: '',
          duration: 0,
          fadeInterval: null,
          endedHandler: null,
        };

        if (isPlayingRef.current && currentMediaRef.current.audioElement) {
          scheduleMediaElementCrossfade();
        }

        onTrackEndRef.current?.();
      }
    }, stepTime);

    current.fadeInterval = fadeInterval;
  }, [fadeDuration, scheduleMediaElementCrossfade]);

  // Update ref after definition
  performMediaElementCrossfadeRef.current = performMediaElementCrossfade;

  // iOS: Play using native HTMLAudioElement (no Web Audio)
  const playFromUrlMediaElement = useCallback(async (url: string, startOffset: number = 0): Promise<boolean> => {
    // Stop current and remove ended handler
    if (currentMediaRef.current.audioElement) {
      if (currentMediaRef.current.fadeInterval) {
        clearInterval(currentMediaRef.current.fadeInterval);
      }
      if (currentMediaRef.current.endedHandler) {
        currentMediaRef.current.audioElement.removeEventListener('ended', currentMediaRef.current.endedHandler);
      }
      currentMediaRef.current.audioElement.pause();
      currentMediaRef.current.audioElement.src = '';
    }

    if (crossfadeTimeoutRef.current) {
      clearTimeout(crossfadeTimeoutRef.current);
      crossfadeTimeoutRef.current = null;
    }

    const newSource = createMediaElementSource(url);
    if (!newSource.audioElement) return false;

    currentMediaRef.current = newSource;
    
    return new Promise((resolve) => {
      const audio = newSource.audioElement!;
      
      // CRITICAL: Add 'ended' event as fallback for when setTimeout is suspended in background
      // iOS suspends setTimeout/setInterval when app is in background, but 'ended' event still fires
      const onEnded = () => {
        console.log('[Crossfade/iOS] Track ended via native event (fallback)');
        
        // If we have a next track preloaded, try crossfade
        if (nextMediaRef.current.audioElement) {
          performMediaElementCrossfadeRef.current();
        } else {
          // No next track, just trigger track end callback
          onTrackEndRef.current?.();
        }
      };
      audio.addEventListener('ended', onEnded);
      newSource.endedHandler = onEnded;
      
      const onCanPlay = () => {
        audio.removeEventListener('canplay', onCanPlay);
        audio.removeEventListener('error', onError);
        
        newSource.duration = audio.duration || 0;
        currentMediaRef.current.duration = newSource.duration;
        
        if (startOffset > 0) {
          audio.currentTime = startOffset;
        }

        // Fade in using native volume
        audio.volume = 0;
        let fadeStep = 0;
        const fadeSteps = 10;
        const fadeIn = setInterval(() => {
          fadeStep++;
          audio.volume = Math.min(1, fadeStep / fadeSteps);
          if (fadeStep >= fadeSteps) clearInterval(fadeIn);
        }, 10);

        audio.play().then(() => {
          isPlayingRef.current = true;
          pauseOffsetRef.current = startOffset;
          startTimeRef.current = Date.now() / 1000;
          
          console.log('[Crossfade/iOS] Playback started via native HTMLAudioElement');
          scheduleMediaElementCrossfade();
          resolve(true);
        }).catch((e) => {
          console.error('[Crossfade/iOS] Play failed:', e);
          resolve(false);
        });
      };

      const onError = () => {
        audio.removeEventListener('canplay', onCanPlay);
        audio.removeEventListener('error', onError);
        audio.removeEventListener('ended', onEnded);
        console.error('[Crossfade/iOS] Audio load error');
        resolve(false);
      };

      audio.addEventListener('canplay', onCanPlay);
      audio.addEventListener('error', onError);
      audio.load();
    });
  }, [createMediaElementSource, scheduleMediaElementCrossfade]);

  // iOS: Preload next track using native HTMLAudioElement
  const preloadNextMediaElement = useCallback(async (url: string): Promise<boolean> => {
    const newSource = createMediaElementSource(url);
    if (!newSource.audioElement) return false;

    return new Promise((resolve) => {
      const audio = newSource.audioElement!;
      audio.volume = 0; // Start muted
      
      const onCanPlay = () => {
        audio.removeEventListener('canplay', onCanPlay);
        audio.removeEventListener('error', onError);
        newSource.duration = audio.duration || 0;
        nextMediaRef.current = newSource;
        console.log('[Crossfade/iOS] Next track preloaded (native)');
        resolve(true);
      };

      const onError = () => {
        audio.removeEventListener('canplay', onCanPlay);
        audio.removeEventListener('error', onError);
        resolve(false);
      };

      audio.addEventListener('canplay', onCanPlay);
      audio.addEventListener('error', onError);
      audio.load();
    });
  }, [createMediaElementSource]);

  // ========== Standard Buffer Mode (non-iOS) ==========

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

  // Forward declaration for buffer mode
  const performCrossfadeRef = useRef<() => void>(() => {});

  const scheduleCrossfade = useCallback(() => {
    if (crossfadeTimeoutRef.current) {
      clearTimeout(crossfadeTimeoutRef.current);
      crossfadeTimeoutRef.current = null;
    }
    
    const current = currentRef.current;
    if (!current.buffer || current.duration <= 0) return;
    
    const ctx = audioContextRef.current;
    if (!ctx) return;
    
    const elapsed = ctx.currentTime - startTimeRef.current + pauseOffsetRef.current;
    const remaining = current.duration - elapsed;
    const crossfadeStartIn = Math.max(0, (remaining - fadeDuration) * 1000);
    
    console.log('[Crossfade] Scheduling crossfade in', (crossfadeStartIn / 1000).toFixed(2), 's');
    
    crossfadeTimeoutRef.current = setTimeout(() => {
      if (isPlayingRef.current) {
        performCrossfadeRef.current();
      }
    }, crossfadeStartIn);
  }, [fadeDuration]);

  const performCrossfade = useCallback(() => {
    const ctx = audioContextRef.current;
    const current = currentRef.current;
    const next = nextRef.current;
    
    if (!ctx) return;
    
    console.log('[Crossfade] Starting crossfade transition');
    onCrossfadeStartRef.current?.();
    
    const now = ctx.currentTime;
    
    if (current.gainNode) {
      current.gainNode.gain.setValueAtTime(current.gainNode.gain.value, now);
      current.gainNode.gain.linearRampToValueAtTime(0, now + fadeDuration);
    }
    
    if (next.buffer && next.gainNode) {
      next.gainNode.gain.setValueAtTime(0, now);
      next.gainNode.gain.linearRampToValueAtTime(1, now + fadeDuration);
      
      if (next.sourceNode) {
        try {
          next.sourceNode.start(0);
        } catch (e) {
          console.log('[Crossfade] Source already started:', e);
        }
      }
    }
    
    setTimeout(() => {
      if (current.sourceNode) {
        try {
          current.sourceNode.stop();
          current.sourceNode.disconnect();
        } catch (e) {}
      }
      if (current.gainNode) {
        current.gainNode.disconnect();
      }
      
      currentRef.current = { ...nextRef.current };
      startTimeRef.current = ctx.currentTime;
      pauseOffsetRef.current = 0;
      
      nextRef.current = {
        sourceNode: null,
        gainNode: null,
        buffer: null,
        duration: 0,
      };
      
      if (isPlayingRef.current && currentRef.current.buffer) {
        scheduleCrossfade();
      }
      
      onTrackEndRef.current?.();
    }, fadeDuration * 1000);
  }, [fadeDuration, scheduleCrossfade]);

  performCrossfadeRef.current = performCrossfade;

  // ========== Public API ==========

  const playFromBuffer = useCallback(async (buffer: AudioBuffer, startOffset: number = 0): Promise<boolean> => {
    if (useMediaElementMode) {
      console.log('[Crossfade] Buffer mode not available on iOS, use playFromUrl');
      return false;
    }

    const ctx = getOrCreateContext();
    if (!ctx) return false;
    
    if (currentRef.current.sourceNode) {
      try {
        currentRef.current.sourceNode.stop();
        currentRef.current.sourceNode.disconnect();
      } catch (e) {}
    }
    if (currentRef.current.gainNode) {
      currentRef.current.gainNode.disconnect();
    }
    
    if (crossfadeTimeoutRef.current) {
      clearTimeout(crossfadeTimeoutRef.current);
      crossfadeTimeoutRef.current = null;
    }
    
    const newSource = createSourceFromBuffer(buffer);
    if (!newSource.sourceNode || !newSource.gainNode) return false;
    
    currentRef.current = newSource;
    pauseOffsetRef.current = startOffset;
    
    newSource.gainNode.gain.setValueAtTime(0, ctx.currentTime);
    newSource.gainNode.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.1);
    
    try {
      newSource.sourceNode.start(0, startOffset);
      startTimeRef.current = ctx.currentTime;
      isPlayingRef.current = true;
      
      console.log('[Crossfade] Playback started, offset:', startOffset);
      scheduleCrossfade();
      
      return true;
    } catch (e) {
      console.error('[Crossfade] Failed to start playback:', e);
      return false;
    }
  }, [useMediaElementMode, getOrCreateContext, createSourceFromBuffer, scheduleCrossfade]);

  const playFromUrl = useCallback(async (url: string, startOffset: number = 0): Promise<boolean> => {
    if (!enabled) return false;
    
    if (useMediaElementMode) {
      return playFromUrlMediaElement(url, startOffset);
    }
    
    const buffer = await loadBuffer(url);
    if (!buffer) return false;
    
    return playFromBuffer(buffer, startOffset);
  }, [enabled, useMediaElementMode, playFromUrlMediaElement, loadBuffer, playFromBuffer]);

  const preloadNextFromBuffer = useCallback((buffer: AudioBuffer) => {
    if (useMediaElementMode) return;
    
    const newSource = createSourceFromBuffer(buffer);
    nextRef.current = newSource;
    console.log('[Crossfade] Next track preloaded, duration:', buffer.duration.toFixed(2));
  }, [useMediaElementMode, createSourceFromBuffer]);

  const preloadNext = useCallback(async (url: string): Promise<boolean> => {
    if (useMediaElementMode) {
      return preloadNextMediaElement(url);
    }
    
    const buffer = await loadBuffer(url);
    if (!buffer) return false;
    
    preloadNextFromBuffer(buffer);
    return true;
  }, [useMediaElementMode, preloadNextMediaElement, loadBuffer, preloadNextFromBuffer]);

  const crossfadeToNext = useCallback(() => {
    if (useMediaElementMode) {
      if (nextMediaRef.current.audioElement) {
        performMediaElementCrossfade();
      } else {
        stop();
        onTrackEndRef.current?.();
      }
      return;
    }
    
    if (nextRef.current.buffer) {
      performCrossfade();
    } else {
      stop();
      onTrackEndRef.current?.();
    }
  }, [useMediaElementMode, performMediaElementCrossfade, performCrossfade]);

  const stop = useCallback(() => {
    if (crossfadeTimeoutRef.current) {
      clearTimeout(crossfadeTimeoutRef.current);
      crossfadeTimeoutRef.current = null;
    }

    // Stop MediaElement sources and remove handlers
    if (currentMediaRef.current.audioElement) {
      if (currentMediaRef.current.endedHandler) {
        currentMediaRef.current.audioElement.removeEventListener('ended', currentMediaRef.current.endedHandler);
      }
      if (currentMediaRef.current.fadeInterval) {
        clearInterval(currentMediaRef.current.fadeInterval);
      }
      currentMediaRef.current.audioElement.pause();
      currentMediaRef.current.audioElement.src = '';
    }
    if (nextMediaRef.current.audioElement) {
      if (nextMediaRef.current.endedHandler) {
        nextMediaRef.current.audioElement.removeEventListener('ended', nextMediaRef.current.endedHandler);
      }
      if (nextMediaRef.current.fadeInterval) {
        clearInterval(nextMediaRef.current.fadeInterval);
      }
      nextMediaRef.current.audioElement.pause();
      nextMediaRef.current.audioElement.src = '';
    }
    currentMediaRef.current = { audioElement: null, url: '', duration: 0, fadeInterval: null, endedHandler: null };
    nextMediaRef.current = { audioElement: null, url: '', duration: 0, fadeInterval: null, endedHandler: null };
    
    // Stop buffer sources
    if (currentRef.current.sourceNode) {
      try {
        currentRef.current.sourceNode.stop();
        currentRef.current.sourceNode.disconnect();
      } catch (e) {}
    }
    if (currentRef.current.gainNode) {
      currentRef.current.gainNode.disconnect();
    }
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

  const pause = useCallback(() => {
    if (useMediaElementMode) {
      if (currentMediaRef.current.audioElement) {
        pauseOffsetRef.current = currentMediaRef.current.audioElement.currentTime;
        currentMediaRef.current.audioElement.pause();
      }
      isPlayingRef.current = false;
      if (crossfadeTimeoutRef.current) {
        clearTimeout(crossfadeTimeoutRef.current);
        crossfadeTimeoutRef.current = null;
      }
      console.log('[Crossfade/iOS] Paused');
      return;
    }

    const ctx = audioContextRef.current;
    if (!ctx || !isPlayingRef.current) return;
    
    const elapsed = ctx.currentTime - startTimeRef.current;
    pauseOffsetRef.current = pauseOffsetRef.current + elapsed;
    
    if (currentRef.current.sourceNode) {
      try {
        currentRef.current.sourceNode.stop();
        currentRef.current.sourceNode.disconnect();
      } catch (e) {}
      currentRef.current.sourceNode = null;
    }
    
    if (crossfadeTimeoutRef.current) {
      clearTimeout(crossfadeTimeoutRef.current);
      crossfadeTimeoutRef.current = null;
    }
    
    isPlayingRef.current = false;
    console.log('[Crossfade] Paused at offset:', pauseOffsetRef.current);
  }, [useMediaElementMode]);

  const resume = useCallback(async (): Promise<boolean> => {
    if (useMediaElementMode) {
      const audio = currentMediaRef.current.audioElement;
      if (!audio) return false;
      
      try {
        await audio.play();
        isPlayingRef.current = true;
        scheduleMediaElementCrossfade();
        console.log('[Crossfade/iOS] Resumed');
        return true;
      } catch (e) {
        console.error('[Crossfade/iOS] Resume failed:', e);
        return false;
      }
    }

    const ctx = getOrCreateContext();
    const buffer = currentRef.current.buffer;
    if (!ctx || !buffer) return false;
    
    const newSource = createSourceFromBuffer(buffer);
    if (!newSource.sourceNode || !newSource.gainNode) return false;
    
    currentRef.current.sourceNode = newSource.sourceNode;
    currentRef.current.gainNode = newSource.gainNode;
    
    newSource.gainNode.gain.setValueAtTime(1, ctx.currentTime);
    
    try {
      newSource.sourceNode.start(0, pauseOffsetRef.current);
      startTimeRef.current = ctx.currentTime;
      isPlayingRef.current = true;
      
      console.log('[Crossfade] Resumed from offset:', pauseOffsetRef.current);
      scheduleCrossfade();
      
      return true;
    } catch (e) {
      console.error('[Crossfade] Failed to resume:', e);
      return false;
    }
  }, [useMediaElementMode, scheduleMediaElementCrossfade, getOrCreateContext, createSourceFromBuffer, scheduleCrossfade]);

  const seek = useCallback(async (time: number): Promise<void> => {
    if (useMediaElementMode) {
      const audio = currentMediaRef.current.audioElement;
      if (audio && audio.duration) {
        audio.currentTime = Math.max(0, Math.min(time, audio.duration));
        pauseOffsetRef.current = audio.currentTime;
      }
      return;
    }

    const buffer = currentRef.current.buffer;
    if (!buffer) return;
    
    const wasPlaying = isPlayingRef.current;
    
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
  }, [useMediaElementMode, resume]);

  const getCurrentTime = useCallback((): number => {
    if (useMediaElementMode) {
      return currentMediaRef.current.audioElement?.currentTime || pauseOffsetRef.current;
    }

    const ctx = audioContextRef.current;
    if (!ctx || !isPlayingRef.current) return pauseOffsetRef.current;
    
    const elapsed = ctx.currentTime - startTimeRef.current;
    return pauseOffsetRef.current + elapsed;
  }, [useMediaElementMode]);

  const getDuration = useCallback((): number => {
    if (useMediaElementMode) {
      return currentMediaRef.current.audioElement?.duration || currentMediaRef.current.duration || 0;
    }
    return currentRef.current.duration || 0;
  }, [useMediaElementMode]);

  const isPlaying = useCallback((): boolean => {
    return isPlayingRef.current;
  }, []);

  const getAudioContext = useCallback((): AudioContext | null => {
    return audioContextRef.current;
  }, []);

  const getCurrentBuffer = useCallback((): AudioBuffer | null => {
    return currentRef.current.buffer;
  }, []);

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
