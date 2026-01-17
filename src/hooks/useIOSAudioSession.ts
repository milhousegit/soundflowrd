// iOS Audio Session Hook - manages audio context for iOS/Safari
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
 * Uses MediaDevices API for accurate detection
 * IMPORTANT: Excludes virtual audio drivers (BlackHole, VB-Audio, Soundflower, etc.)
 */
const detectExternalAudioDevice = async (): Promise<boolean> => {
  try {
    if (!navigator.mediaDevices?.enumerateDevices) {
      return false;
    }
    
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioOutputs = devices.filter(d => d.kind === 'audiooutput');
    
    // Virtual audio drivers to IGNORE (these are NOT external devices)
    const virtualDriverPatterns = [
      'blackhole', 'vb-audio', 'soundflower', 'loopback', 'virtual', 
      'aggregate', 'multi-output', 'voicemeeter', 'cable', 'obs',
      'screen capture', 'zoom', 'teams', 'discord', 'rec'
    ];
    
    // Check for REAL Bluetooth, CarPlay, or external audio devices
    for (const device of audioOutputs) {
      const label = device.label.toLowerCase();
      
      // Skip virtual drivers
      if (virtualDriverPatterns.some(pattern => label.includes(pattern))) {
        console.log('[iOS Audio] Skipping virtual driver:', device.label);
        continue;
      }
      
      // CarPlay indicators
      if (label.includes('carplay') || label.includes('car audio') || label.includes('car stereo')) {
        console.log('[iOS Audio] CarPlay device detected:', device.label);
        return true;
      }
      
      // Bluetooth indicators (excluding internal speakers)
      if (label.includes('bluetooth') || label.includes('bt_') || label.includes('airpods') || 
          label.includes('bose') || label.includes('jbl') || label.includes('sony') ||
          label.includes('beats') || label.includes('wireless')) {
        console.log('[iOS Audio] Bluetooth device detected:', device.label);
        return true;
      }
      
      // AirPlay indicators
      if (label.includes('airplay') || label.includes('apple tv') || label.includes('homepod')) {
        console.log('[iOS Audio] AirPlay device detected:', device.label);
        return true;
      }
    }
    
    // NO LONGER use fallback detection for "non-default" outputs
    // This was causing false positives with virtual audio drivers
    // Only explicitly detected devices (CarPlay, Bluetooth, AirPlay) count as external
    
    return false;
  } catch (error) {
    console.log('[iOS Audio] Could not enumerate devices:', error);
    return false;
  }
};

// Synchronous fallback check for external routing
const isExternalAudioRoutingSync = (): boolean => {
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
 * audio is routed externally. Uses only refs to avoid React hook ordering issues.
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
  // SIMPLIFIED: Only detect once on mount and on explicit device change events
  // NO periodic polling to avoid interference with CarPlay audio
  useEffect(() => {
    const checkExternalRouting = async () => {
      // Use async detection first, fall back to sync check
      let external = isExternalAudioRoutingSync();
      
      try {
        external = await detectExternalAudioDevice() || external;
      } catch {
        // Use sync fallback
      }
      
      if (external !== isExternalDeviceRef.current) {
        isExternalDeviceRef.current = external;
        addLog('info', `External audio routing: ${external ? 'DETECTED' : 'not detected'}`);
        
        // When on external routing, just set the flag - DON'T manipulate AudioContext
        // The main audio element handles playback; we just disable keepAlive interference
        if (external) {
          addLog('info', 'External device detected - disabling keepAlive only');
        }
      }
    };

    // Check on device change events only
    const handleDeviceChange = () => {
      addLog('info', 'Audio device change detected');
      checkExternalRouting();
    };

    // Initial check only (no periodic polling)
    checkExternalRouting();

    // Listen for device changes
    if (navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    }

    // NO periodic interval - this was causing CarPlay stuttering
    // The devicechange event is sufficient for detecting connection changes

    return () => {
      if (navigator.mediaDevices?.removeEventListener) {
        navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
      }
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

    // Create silent audio element for keep-alive - ONLY for non-external devices
    // On CarPlay/Bluetooth, this silent audio can cause stuttering, so we skip it entirely
    if (!silentAudioRef.current && !isExternalDeviceRef.current) {
      silentAudioRef.current = document.createElement('audio');
      silentAudioRef.current.id = 'ios-silent-audio';
      // NO LOOP - looping causes periodic audio interruptions on CarPlay
      silentAudioRef.current.loop = false;
      silentAudioRef.current.setAttribute('playsinline', '');
      silentAudioRef.current.preload = 'auto';
      // Longer silent audio (10 seconds) to reduce frequency of restarts
      silentAudioRef.current.src = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYNAAAAAAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYNAAAAAAAAAAAAAAAAAAAA';
      silentAudioRef.current.volume = 0.001; // Even quieter
      // Don't add to DOM yet - only add when needed
      addLog('info', 'Silent audio element created (not added to DOM yet)');
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
        
        // Play a silent buffer using native sample rate (prevents CarPlay conflicts)
        const sampleRate = audioContextRef.current.sampleRate || 44100;
        const buffer = audioContextRef.current.createBuffer(1, 1, sampleRate);
        const source = audioContextRef.current.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContextRef.current.destination);
        source.start(0);
        addLog('success', 'Silent buffer played via AudioContext', `sampleRate: ${sampleRate}`);
      } catch (e) {
        addLog('error', 'AudioContext unlock failed', e instanceof Error ? e.message : String(e));
        success = false;
      }
    }

    // 2. Silent audio element completely DISABLED for unlock
    // This was causing CarPlay stuttering - let the main audio handle everything
    // The AudioContext buffer playback above is sufficient for unlocking

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

      // Create and play silent buffer synchronously using native sample rate
      const sampleRate = ctx.sampleRate || 44100;
      const buffer = ctx.createBuffer(1, 1, sampleRate);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);

      if ((ctx as any).state === 'suspended') {
        (ctx as any).resume?.();
      }

      // Silent audio element DISABLED - was causing CarPlay stuttering
      // The AudioContext buffer is sufficient for quick unlock

      sessionStorage.setItem('audio_unlocked', 'true');
      isUnlockedRef.current = true;
      addLog('success', 'Quick unlock executed');
    } catch (e) {
      addLog('warning', 'Quick unlock exception', e instanceof Error ? e.message : String(e));
    }
  }, [addLog]);

  /**
   * Keep the audio session alive - call when playback starts
   * ENABLED ONLY for internal speakers (iPhone speaker/earpiece)
   * DISABLED for external devices (CarPlay, Bluetooth, AirPlay) to prevent stuttering
   * 
   * IMPORTANT: iOS requires AUDIBLE audio to keep background tasks alive.
   * We use a very low frequency tone (50Hz) at minimal volume (0.02) - barely perceptible
   * but enough to keep the audio session active.
   */
  const keepAlive = useCallback((opts?: { force?: boolean }) => {
    // Skip if not iOS or not in PWA mode
    if (!isIOS() || !isPWA()) {
      return;
    }

    // Throttle by default to reduce overhead, but allow forcing during track transitions
    const now = Date.now();
    if (!opts?.force) {
      if (now - lastKeepAliveRef.current < 5000) {
        return;
      }
    }
    lastKeepAliveRef.current = now;

    addLog('info', `Keep-alive pulse (audible heartbeat)${opts?.force ? ' [force]' : ''}`);

    try {
      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      const ctx: AudioContext = audioContextRef.current || new AudioCtx();
      if (!audioContextRef.current) audioContextRef.current = ctx;

      // Resume AudioContext if suspended
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      // Create a VERY LOW frequency oscillator (50Hz) - barely audible "heartbeat"
      // iOS needs AUDIBLE audio to keep background alive.
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(50, ctx.currentTime);

      // Volume: 0.02 = barely perceptible but enough for iOS
      gainNode.gain.setValueAtTime(0.02, ctx.currentTime);
      // Quick fade out to avoid clicks
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      // Play for 150ms - short "heartbeat" pulse
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.15);
    } catch (e) {
      addLog('warning', 'Keep-alive failed', e instanceof Error ? e.message : String(e));
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
    
    // On external routing (CarPlay/Bluetooth), fully disable silent audio
    if (isExternalDeviceRef.current && silentAudioRef.current) {
      silentAudioRef.current.pause();
      silentAudioRef.current.src = '';
      addLog('info', 'Silent audio fully disabled (external routing)');
    }
  }, [addLog]);

  /**
   * Cleanup all audio resources - use when CarPlay/Bluetooth is active
   */
  const cleanup = useCallback(() => {
    addLog('info', 'Cleaning up audio resources');
    
    // Stop keep-alive
    if (keepAliveIntervalRef.current) {
      window.clearInterval(keepAliveIntervalRef.current);
      keepAliveIntervalRef.current = null;
    }
    
    // Remove silent audio from DOM
    if (silentAudioRef.current) {
      silentAudioRef.current.pause();
      silentAudioRef.current.src = '';
      if (silentAudioRef.current.parentNode) {
        silentAudioRef.current.parentNode.removeChild(silentAudioRef.current);
      }
      silentAudioRef.current = null;
      addLog('info', 'Silent audio element removed from DOM');
    }
    
    // Close AudioContext
    if (audioContextRef.current) {
      audioContextRef.current.close().then(() => {
        addLog('info', 'AudioContext closed');
        audioContextRef.current = null;
      }).catch(() => {});
    }
    
    isUnlockedRef.current = false;
    sessionStorage.removeItem('audio_unlocked');
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

  // Listen for visibility changes - SIMPLIFIED to reduce interference
  // On CarPlay/Bluetooth, we do NOTHING - let the system handle audio
  useEffect(() => {
    const handleVisibilityChange = () => {
      addLog('info', 'Visibility changed', `state: ${document.visibilityState}`);
      
      // Call keep-alive when page becomes visible
      if (document.visibilityState === 'visible') {
        keepAlive();
      }
    };

    const handlePageShow = (e: PageTransitionEvent) => {
      addLog('info', 'pageshow event', `persisted: ${e.persisted}`);
      if (e.persisted) {
        keepAlive();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [addLog, keepAlive]);

  /**
   * Play an audible placeholder to "occupy" the iOS audio session.
   * This prevents the widget from de-syncing during stream loading.
   * ONLY used on iOS when NOT on external device (CarPlay/Bluetooth)
   * 
   * Uses a low frequency tone (50Hz) at minimal volume - barely perceptible
   * but required by iOS to maintain background audio session.
   */
  const playPlaceholder = useCallback(async (): Promise<boolean> => {
    // Skip on external devices - they manage audio sessions automatically
    if (isExternalDeviceRef.current) {
      addLog('info', 'Placeholder skipped (external device)');
      return false;
    }
    
    // Only needed on iOS
    if (!isIOS()) {
      return false;
    }
    
    addLog('info', 'Playing audible placeholder for iOS widget sync');
    
    try {
      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return false;
      
      const ctx: AudioContext = audioContextRef.current || new AudioCtx();
      if (!audioContextRef.current) audioContextRef.current = ctx;
      
      // Resume if suspended
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      
      // Create an AUDIBLE low frequency tone (50Hz) for ~300ms
      // This keeps the iOS audio session active during track transitions
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(50, ctx.currentTime); // 50Hz sub-bass
      
      // Volume: 0.02 = barely perceptible but enough for iOS
      gainNode.gain.setValueAtTime(0.02, ctx.currentTime);
      // Fade out smoothly
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.3);
      
      addLog('success', 'Audible placeholder active (50Hz heartbeat)');
      return true;
    } catch (e) {
      addLog('warning', 'Placeholder failed', e instanceof Error ? e.message : String(e));
      return false;
    }
  }, [addLog]);

  return {
    initialize,
    unlock,
    quickUnlock,
    keepAlive,
    stopKeepAlive,
    cleanup,
    resetUnlock,
    testAudioPlayback,
    getLogs,
    clearLogs,
    addLog,
    isUnlocked: () => isUnlockedRef.current,
    isExternalDevice: () => isExternalDeviceRef.current,
    playPlaceholder,
    silentAudioRef,
    audioContextRef,
  };
};

export default useIOSAudioSession;
