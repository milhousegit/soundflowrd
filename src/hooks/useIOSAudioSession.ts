import { useRef, useCallback, useEffect } from 'react';

export interface IOSAudioLog {
  timestamp: Date;
  type: 'info' | 'success' | 'error' | 'warning';
  message: string;
  details?: string;
}

// Persistent log storage
const MAX_LOGS = 200;

export const getPersistedLogs = (): IOSAudioLog[] => {
  try {
    const stored = localStorage.getItem('ios_audio_logs');
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed.map((log: any) => ({
        ...log,
        timestamp: new Date(log.timestamp),
      }));
    }
  } catch {
    // ignore
  }
  return [];
};

export const clearPersistedLogs = () => {
  localStorage.removeItem('ios_audio_logs');
};

const persistLog = (log: IOSAudioLog) => {
  try {
    const logs = getPersistedLogs();
    logs.push(log);
    // Keep only last N logs
    const trimmed = logs.slice(-MAX_LOGS);
    localStorage.setItem('ios_audio_logs', JSON.stringify(trimmed));
  } catch {
    // ignore
  }
};

// Detect environment
export const isIOS = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
};

export const isSafari = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
};

export const isPWA = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true;
};

export const supportsOrientationLock = (): boolean => {
  if (typeof screen === 'undefined') return false;
  const orientation = screen.orientation as any;
  return typeof orientation?.lock === 'function';
};

export const supportsWakeLock = (): boolean => {
  return 'wakeLock' in navigator;
};

/**
 * Detect if audio is being routed to an external device (CarPlay, Bluetooth, AirPlay)
 * This helps us reduce interference with external audio routing
 */
const isExternalAudioRouting = (): boolean => {
  // Check for CarPlay/external display hints
  if (typeof window !== 'undefined') {
    // Multiple displays suggest CarPlay or external screen
    if (window.screen && (window as any).screen.availWidth > window.innerWidth * 2) {
      return true;
    }
  }
  return false;
};

/**
 * Hook to manage iOS audio session with robust logging and unlock mechanisms
 * Optimized for CarPlay compatibility - reduces keep-alive aggressiveness when
 * audio is routed externally
 */
export const useIOSAudioSession = () => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const silentAudioRef = useRef<HTMLAudioElement | null>(null);
  const isUnlockedRef = useRef(false);
  const logsRef = useRef<IOSAudioLog[]>(getPersistedLogs());
  const keepAliveIntervalRef = useRef<number | null>(null);
  const lastKeepAliveRef = useRef<number>(0);
  
  // Track external audio routing state with ref (no useState to avoid React issues)
  const isExternalDeviceRef = useRef(false);

  const addLog = useCallback((type: IOSAudioLog['type'], message: string, details?: string) => {
    const log: IOSAudioLog = {
      timestamp: new Date(),
      type,
      message,
      details,
    };
    logsRef.current.push(log);
    persistLog(log);
    
    const timeStr = log.timestamp.toLocaleTimeString('it-IT', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
    const ms = log.timestamp.getMilliseconds().toString().padStart(3, '0');
    console.log(`[iOS Audio ${timeStr}.${ms}] [${type.toUpperCase()}] ${message}`, details || '');
  }, []);

  const getLogs = useCallback(() => {
    return [...logsRef.current];
  }, []);

  const clearLogs = useCallback(() => {
    logsRef.current = [];
    clearPersistedLogs();
    addLog('info', 'Logs cleared');
  }, [addLog]);

  // Detect external audio devices (CarPlay, Bluetooth, AirPlay)
  useEffect(() => {
    const checkExternalRouting = () => {
      const external = isExternalAudioRouting();
      if (external !== isExternalDeviceRef.current) {
        isExternalDeviceRef.current = external;
        addLog('info', `External audio routing: ${external ? 'detected' : 'not detected'}`);
      }
    };

    // Check on device change events
    const handleDeviceChange = () => {
      addLog('info', 'Audio device change detected');
      checkExternalRouting();
    };

    // Initial check
    checkExternalRouting();

    // Listen for device changes
    if (navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    }

    // Also check periodically for CarPlay connection
    const interval = window.setInterval(checkExternalRouting, 5000);

    return () => {
      if (navigator.mediaDevices?.removeEventListener) {
        navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
      }
      window.clearInterval(interval);
    };
  }, [addLog]);

  /**
   * Initialize the audio context and silent audio element.
   * Call this early (e.g., on app mount).
   */
  const initialize = useCallback(() => {
    addLog('info', 'Initializing iOS audio session', `iOS: ${isIOS()}, Safari: ${isSafari()}, PWA: ${isPWA()}`);
    
    // Create AudioContext - use singleton pattern
    try {
      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx && !audioContextRef.current) {
        audioContextRef.current = new AudioCtx();
        addLog('info', 'AudioContext created', `state: ${audioContextRef.current.state}`);
      }
    } catch (e) {
      addLog('error', 'Failed to create AudioContext', e instanceof Error ? e.message : String(e));
    }

    // Create silent audio element for keep-alive
    if (!silentAudioRef.current) {
      silentAudioRef.current = document.createElement('audio');
      silentAudioRef.current.id = 'ios-silent-audio';
      silentAudioRef.current.loop = true;
      silentAudioRef.current.setAttribute('playsinline', '');
      silentAudioRef.current.preload = 'auto';
      // Use a data URI for a tiny silent MP3 (very small, ~100 bytes)
      silentAudioRef.current.src = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYNAAAAAAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYNAAAAAAAAAAAAAAAAAAAA';
      silentAudioRef.current.volume = 0.01; // Near-silent but not muted
      document.body.appendChild(silentAudioRef.current);
      addLog('info', 'Silent audio element created and added to DOM');
    }
  }, [addLog]);

  /**
   * Unlock audio session - MUST be called from a user gesture (tap/click).
   * Returns true if unlock succeeded.
   */
  const unlock = useCallback(async (): Promise<boolean> => {
    addLog('info', 'Attempting audio unlock (user gesture)');
    
    if (isUnlockedRef.current) {
      addLog('info', 'Already unlocked, skipping');
      return true;
    }

    let success = true;

    // 1. Resume AudioContext
    if (audioContextRef.current) {
      try {
        if (audioContextRef.current.state === 'suspended') {
          await audioContextRef.current.resume();
          addLog('success', 'AudioContext resumed', `state: ${audioContextRef.current.state}`);
        }
        
        // Play a silent buffer
        const buffer = audioContextRef.current.createBuffer(1, 1, 22050);
        const source = audioContextRef.current.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContextRef.current.destination);
        source.start(0);
        addLog('success', 'Silent buffer played via AudioContext');
      } catch (e) {
        addLog('error', 'AudioContext unlock failed', e instanceof Error ? e.message : String(e));
        success = false;
      }
    }

    // 2. Start silent audio element (only if not on external routing)
    if (silentAudioRef.current && !isExternalDeviceRef.current) {
      try {
        // Reset to start
        silentAudioRef.current.currentTime = 0;
        await silentAudioRef.current.play();
        addLog('success', 'Silent audio element playing', `paused: ${silentAudioRef.current.paused}`);
      } catch (e) {
        addLog('error', 'Silent audio play failed', e instanceof Error ? e.message : String(e));
        success = false;
      }
    }

    if (success) {
      isUnlockedRef.current = true;
      sessionStorage.setItem('audio_unlocked', 'true');
      addLog('success', 'Audio session unlocked successfully');
    }

    return success;
  }, [addLog]);

  /**
   * Quick synchronous unlock attempt - use at start of playTrack to maximize iOS autoplay chance.
   * Does not await promises.
   */
  const quickUnlock = useCallback(() => {
    if (sessionStorage.getItem('audio_unlocked')) return;
    
    addLog('info', 'Quick unlock attempt');
    
    try {
      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      const ctx: AudioContext = audioContextRef.current || new AudioCtx();
      if (!audioContextRef.current) audioContextRef.current = ctx;

      // Create and play silent buffer synchronously
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);

      if ((ctx as any).state === 'suspended') {
        (ctx as any).resume?.();
      }

      // Also try silent audio element (only if not external routing)
      if (silentAudioRef.current && !isExternalDeviceRef.current) {
        silentAudioRef.current.play().catch(() => {});
      }

      sessionStorage.setItem('audio_unlocked', 'true');
      isUnlockedRef.current = true;
      addLog('success', 'Quick unlock executed');
    } catch (e) {
      addLog('warning', 'Quick unlock exception', e instanceof Error ? e.message : String(e));
    }
  }, [addLog]);

  /**
   * Keep the audio session alive - call when playback starts
   * Throttled and CarPlay-aware to prevent audio stuttering
   */
  const keepAlive = useCallback(() => {
    const now = Date.now();
    
    // Throttle keep-alive calls to max once per 2 seconds
    if (now - lastKeepAliveRef.current < 2000) {
      return;
    }
    lastKeepAliveRef.current = now;

    // Skip aggressive keep-alive when external audio routing is active (CarPlay, Bluetooth)
    // The external system manages the audio session
    if (isExternalDeviceRef.current) {
      addLog('info', 'Keep-alive skipped (external audio routing active)');
      return;
    }

    addLog('info', 'Keep-alive: ensuring silent audio is playing');
    
    if (silentAudioRef.current && silentAudioRef.current.paused) {
      silentAudioRef.current.play().then(() => {
        addLog('success', 'Keep-alive: silent audio resumed');
      }).catch(e => {
        addLog('warning', 'Keep-alive: silent audio resume failed', e instanceof Error ? e.message : String(e));
      });
    }
    
    if (audioContextRef.current?.state === 'suspended') {
      audioContextRef.current.resume().then(() => {
        addLog('success', 'Keep-alive: AudioContext resumed');
      }).catch(() => {});
    }
  }, [addLog]);

  /**
   * Stop keep-alive (when playback stops completely)
   */
  const stopKeepAlive = useCallback(() => {
    addLog('info', 'Stopping keep-alive');
    
    // Clear any keep-alive interval
    if (keepAliveIntervalRef.current) {
      window.clearInterval(keepAliveIntervalRef.current);
      keepAliveIntervalRef.current = null;
    }
    
    // On external routing (CarPlay), pause the silent audio to not interfere
    if (isExternalDeviceRef.current && silentAudioRef.current) {
      silentAudioRef.current.pause();
      addLog('info', 'Silent audio paused (external routing)');
    }
  }, [addLog]);

  /**
   * Reset unlock state (for testing)
   */
  const resetUnlock = useCallback(() => {
    isUnlockedRef.current = false;
    sessionStorage.removeItem('audio_unlocked');
    addLog('info', 'Unlock state reset');
  }, [addLog]);

  /**
   * Test if we can play audio (useful for diagnostics)
   */
  const testAudioPlayback = useCallback(async (): Promise<boolean> => {
    addLog('info', 'Testing audio playback');
    
    const testAudio = new Audio();
    testAudio.src = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYNAAAAAAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYNAAAAAAAAAAAAAAAAAAAA';
    testAudio.volume = 0.01;
    
    try {
      await testAudio.play();
      testAudio.pause();
      addLog('success', 'Test audio playback succeeded');
      return true;
    } catch (e) {
      addLog('error', 'Test audio playback failed', e instanceof Error ? e.message : String(e));
      return false;
    }
  }, [addLog]);

  // Listen for visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      addLog('info', 'Visibility changed', `state: ${document.visibilityState}`);
      
      // Only call keep-alive if not on external routing and page is visible
      if (document.visibilityState === 'visible' && !isExternalDeviceRef.current) {
        keepAlive();
      }
    };

    const handlePageShow = (e: PageTransitionEvent) => {
      addLog('info', 'pageshow event', `persisted: ${e.persisted}`);
      if (e.persisted && !isExternalDeviceRef.current) {
        keepAlive();
      }
    };

    const handlePageHide = () => {
      addLog('info', 'pagehide event');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [addLog, keepAlive]);

  return {
    initialize,
    unlock,
    quickUnlock,
    keepAlive,
    stopKeepAlive,
    resetUnlock,
    testAudioPlayback,
    getLogs,
    clearLogs,
    addLog,
    isUnlocked: () => isUnlockedRef.current,
    isExternalDevice: () => isExternalDeviceRef.current,
    silentAudioRef,
    audioContextRef,
  };
};

export default useIOSAudioSession;
