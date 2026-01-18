// Hook for prefetching entire queue for iOS background playback
// Stores AudioBuffers for gapless transitions even when app is in background

import { useRef, useCallback, useEffect, useState } from 'react';
import { Track } from '@/types/music';
import { getTidalStream, mapQualityToTidal } from '@/lib/tidal';
import { useSettings } from '@/contexts/SettingsContext';

export interface PrefetchedTrack {
  trackId: string;
  url: string;
  buffer?: AudioBuffer;
  fetchedAt: number;
}

export interface QueuePrefetchState {
  totalTracks: number;
  fetchedCount: number;
  bufferReadyCount: number;
  currentlyFetching: string | null;
  lastFetchedIndex: number;
  isActive: boolean;
}

// Check if iOS device
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent);
const isPWA = () => window.matchMedia('(display-mode: standalone)').matches || 
                    (window.navigator as any).standalone === true;

export const useQueuePrefetch = () => {
  const { settings } = useSettings();
  
  // Prefetched tracks cache (persists across renders)
  const prefetchedTracksRef = useRef<Map<string, PrefetchedTrack>>(new Map());
  
  // AudioContext for buffer decoding
  const audioContextRef = useRef<AudioContext | null>(null);
  
  // Fetch state
  const isFetchingRef = useRef(false);
  const lastFetchedIndexRef = useRef(-1);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // State for UI
  const [state, setState] = useState<QueuePrefetchState>({
    totalTracks: 0,
    fetchedCount: 0,
    bufferReadyCount: 0,
    currentlyFetching: null,
    lastFetchedIndex: -1,
    isActive: false,
  });

  // Initialize AudioContext
  const initAudioContext = useCallback(async (): Promise<AudioContext | null> => {
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      if (audioContextRef.current.state === 'suspended') {
        try {
          await audioContextRef.current.resume();
        } catch (e) {
          console.log('[QueuePrefetch] Could not resume AudioContext:', e);
        }
      }
      return audioContextRef.current;
    }
    
    try {
      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return null;
      audioContextRef.current = new AudioCtx();
      console.log('[QueuePrefetch] AudioContext created');
      return audioContextRef.current;
    } catch (e) {
      console.log('[QueuePrefetch] Failed to create AudioContext:', e);
      return null;
    }
  }, []);

  // Fetch a single track URL and optionally decode to buffer
  const fetchTrack = useCallback(async (
    track: Track,
    decodeBuffer: boolean = true
  ): Promise<PrefetchedTrack | null> => {
    try {
      const tidalQuality = mapQualityToTidal(settings.audioQuality);
      const result = await getTidalStream(track.title, track.artist, tidalQuality);
      
      if (!('streamUrl' in result) || !result.streamUrl) {
        console.log('[QueuePrefetch] No stream URL for:', track.title);
        return null;
      }
      
      const prefetched: PrefetchedTrack = {
        trackId: track.id,
        url: result.streamUrl,
        fetchedAt: Date.now(),
      };
      
      // Decode to AudioBuffer for gapless playback
      if (decodeBuffer && isIOS() && isPWA()) {
        const ctx = await initAudioContext();
        if (ctx) {
          try {
            const response = await fetch(result.streamUrl);
            if (response.ok) {
              const arrayBuffer = await response.arrayBuffer();
              const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
              prefetched.buffer = audioBuffer;
              console.log('[QueuePrefetch] Buffer ready:', track.title, `(${audioBuffer.duration.toFixed(1)}s)`);
            }
          } catch (e) {
            console.log('[QueuePrefetch] Buffer decode failed:', track.title, e);
            // URL is still valid, just no buffer
          }
        }
      }
      
      return prefetched;
    } catch (e) {
      console.log('[QueuePrefetch] Fetch failed:', track.title, e);
      return null;
    }
  }, [settings.audioQuality, initAudioContext]);

  // Prefetch queue starting from a specific index
  const prefetchQueue = useCallback(async (
    queue: Track[],
    currentIndex: number,
    options?: { maxTracks?: number; forceRestart?: boolean }
  ) => {
    const maxTracks = options?.maxTracks ?? 20; // Default max 20 tracks ahead
    const forceRestart = options?.forceRestart ?? false;
    
    // Only on iOS PWA
    if (!isIOS() || !isPWA()) {
      return;
    }
    
    // Already fetching?
    if (isFetchingRef.current && !forceRestart) {
      console.log('[QueuePrefetch] Already fetching, skipping');
      return;
    }
    
    // Abort previous fetch if force restart
    if (forceRestart && abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Determine start index (resume from last or start fresh)
    const startIndex = forceRestart 
      ? currentIndex + 1 
      : Math.max(currentIndex + 1, lastFetchedIndexRef.current + 1);
    
    const endIndex = Math.min(startIndex + maxTracks, queue.length);
    
    if (startIndex >= queue.length) {
      console.log('[QueuePrefetch] Nothing to prefetch (queue end)');
      return;
    }
    
    console.log('[QueuePrefetch] Starting prefetch from index', startIndex, 'to', endIndex - 1);
    
    isFetchingRef.current = true;
    abortControllerRef.current = new AbortController();
    
    setState(prev => ({
      ...prev,
      totalTracks: endIndex - startIndex,
      isActive: true,
    }));
    
    let fetchedCount = 0;
    let bufferReadyCount = 0;
    
    // Count already cached tracks
    for (let i = startIndex; i < endIndex; i++) {
      const track = queue[i];
      const cached = prefetchedTracksRef.current.get(track.id);
      if (cached) {
        fetchedCount++;
        if (cached.buffer) bufferReadyCount++;
      }
    }
    
    setState(prev => ({
      ...prev,
      fetchedCount,
      bufferReadyCount,
    }));
    
    // Fetch remaining tracks
    for (let i = startIndex; i < endIndex; i++) {
      // Check if aborted
      if (abortControllerRef.current?.signal.aborted) {
        console.log('[QueuePrefetch] Aborted');
        break;
      }
      
      const track = queue[i];
      
      // Skip if already cached
      if (prefetchedTracksRef.current.has(track.id)) {
        lastFetchedIndexRef.current = i;
        continue;
      }
      
      setState(prev => ({
        ...prev,
        currentlyFetching: track.title,
      }));
      
      const prefetched = await fetchTrack(track, true);
      
      if (prefetched) {
        prefetchedTracksRef.current.set(track.id, prefetched);
        fetchedCount++;
        if (prefetched.buffer) bufferReadyCount++;
        
        setState(prev => ({
          ...prev,
          fetchedCount,
          bufferReadyCount,
          lastFetchedIndex: i,
        }));
      }
      
      lastFetchedIndexRef.current = i;
      
      // Small delay to not overwhelm network
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    isFetchingRef.current = false;
    setState(prev => ({
      ...prev,
      currentlyFetching: null,
      isActive: fetchedCount < (endIndex - startIndex),
    }));
    
    console.log('[QueuePrefetch] Complete:', fetchedCount, 'fetched,', bufferReadyCount, 'buffers ready');
  }, [fetchTrack]);

  // Get prefetched data for a track
  const getPrefetched = useCallback((trackId: string): PrefetchedTrack | null => {
    return prefetchedTracksRef.current.get(trackId) || null;
  }, []);

  // Check if a track has a ready buffer
  const hasBuffer = useCallback((trackId: string): boolean => {
    const cached = prefetchedTracksRef.current.get(trackId);
    return !!cached?.buffer;
  }, []);

  // Get the AudioBuffer for a track
  const getBuffer = useCallback((trackId: string): AudioBuffer | null => {
    const cached = prefetchedTracksRef.current.get(trackId);
    return cached?.buffer || null;
  }, []);

  // Clear cache for tracks before a certain index
  const clearOldTracks = useCallback((queue: Track[], currentIndex: number) => {
    // Keep only tracks from currentIndex-1 onwards
    const keepFromIndex = Math.max(0, currentIndex - 1);
    const keepIds = new Set(queue.slice(keepFromIndex).map(t => t.id));
    
    for (const trackId of prefetchedTracksRef.current.keys()) {
      if (!keepIds.has(trackId)) {
        prefetchedTracksRef.current.delete(trackId);
      }
    }
  }, []);

  // Stop prefetching
  const stopPrefetch = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    isFetchingRef.current = false;
    setState(prev => ({
      ...prev,
      isActive: false,
      currentlyFetching: null,
    }));
  }, []);

  // Reset all state
  const reset = useCallback(() => {
    stopPrefetch();
    prefetchedTracksRef.current.clear();
    lastFetchedIndexRef.current = -1;
    setState({
      totalTracks: 0,
      fetchedCount: 0,
      bufferReadyCount: 0,
      currentlyFetching: null,
      lastFetchedIndex: -1,
      isActive: false,
    });
  }, [stopPrefetch]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPrefetch();
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, [stopPrefetch]);

  return {
    prefetchQueue,
    getPrefetched,
    hasBuffer,
    getBuffer,
    clearOldTracks,
    stopPrefetch,
    reset,
    state,
    isIOS: isIOS(),
    isPWA: isPWA(),
  };
};

export default useQueuePrefetch;
