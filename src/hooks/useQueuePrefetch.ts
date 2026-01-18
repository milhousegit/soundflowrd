// Hook for prefetching entire queue for iOS background playback
// Uses Service Worker cache + AudioBuffers for gapless transitions

import { useRef, useCallback, useEffect, useState } from 'react';
import { Track } from '@/types/music';
import { getTidalStream, mapQualityToTidal } from '@/lib/tidal';
import { useSettings } from '@/contexts/SettingsContext';

export interface PrefetchedTrack {
  trackId: string;
  url: string;
  buffer?: AudioBuffer;
  swCached?: boolean;
  fetchedAt: number;
}

export interface QueuePrefetchState {
  totalTracks: number;
  fetchedCount: number;
  bufferReadyCount: number;
  swCachedCount: number;
  currentlyFetching: string | null;
  lastFetchedIndex: number;
  isActive: boolean;
}

// Check if iOS device
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent);
const isPWA = () => window.matchMedia('(display-mode: standalone)').matches || 
                    (window.navigator as any).standalone === true;

// Audio cache name (must match sw.js)
const AUDIO_CACHE = 'soundflow-audio-v1';

// Helper to cache audio in Service Worker
const cacheAudioInSW = async (url: string, trackId: string): Promise<boolean> => {
  try {
    // Check if SW is available
    if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
      return false;
    }
    
    // Send message to SW to cache
    navigator.serviceWorker.controller.postMessage({
      type: 'CACHE_AUDIO',
      url,
      trackId,
    });
    
    return true;
  } catch (e) {
    console.log('[QueuePrefetch] SW cache failed:', e);
    return false;
  }
};

// Helper to check if audio is cached in SW
const isAudioCachedInSW = async (url: string): Promise<boolean> => {
  try {
    const cache = await caches.open(AUDIO_CACHE);
    const cached = await cache.match(url);
    return !!cached;
  } catch (e) {
    return false;
  }
};

// Helper to load audio from SW cache directly
const loadFromSWCache = async (url: string): Promise<ArrayBuffer | null> => {
  try {
    const cache = await caches.open(AUDIO_CACHE);
    const cached = await cache.match(url);
    if (cached) {
      return await cached.arrayBuffer();
    }
    return null;
  } catch (e) {
    return null;
  }
};

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
    swCachedCount: 0,
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

  // Fetch a single track URL and decode to buffer + cache in SW
  const fetchTrack = useCallback(async (
    track: Track
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
      
      // On iOS PWA: fetch, cache in SW, and decode to AudioBuffer
      if (isIOS() && isPWA()) {
        const ctx = await initAudioContext();
        
        try {
          // First check if already in SW cache
          let arrayBuffer = await loadFromSWCache(result.streamUrl);
          
          if (!arrayBuffer) {
            // Fetch from network
            const response = await fetch(result.streamUrl);
            if (response.ok) {
              arrayBuffer = await response.arrayBuffer();
              
              // Cache in SW (async, don't wait)
              cacheAudioInSW(result.streamUrl, track.id).then(cached => {
                if (cached) {
                  console.log('[QueuePrefetch] Cached in SW:', track.title);
                  prefetched.swCached = true;
                }
              });
            }
          } else {
            console.log('[QueuePrefetch] Loaded from SW cache:', track.title);
            prefetched.swCached = true;
          }
          
          // Decode to AudioBuffer
          if (arrayBuffer && ctx) {
            // Clone arrayBuffer for decoding (it gets neutered after decode)
            const bufferCopy = arrayBuffer.slice(0);
            const audioBuffer = await ctx.decodeAudioData(bufferCopy);
            prefetched.buffer = audioBuffer;
            console.log('[QueuePrefetch] Buffer ready:', track.title, `(${audioBuffer.duration.toFixed(1)}s)`);
          }
        } catch (e) {
          console.log('[QueuePrefetch] Buffer decode failed:', track.title, e);
          // URL is still valid, just no buffer
        }
      }
      
      return prefetched;
    } catch (e) {
      console.log('[QueuePrefetch] Fetch failed:', track.title, e);
      return null;
    }
  }, [settings.audioQuality, initAudioContext]);

  // Prefetch queue with parallel fetching (2 at a time)
  const prefetchQueue = useCallback(async (
    queue: Track[],
    currentIndex: number,
    options?: { maxTracks?: number; forceRestart?: boolean; parallelCount?: number }
  ) => {
    const maxTracks = options?.maxTracks ?? 15;
    const forceRestart = options?.forceRestart ?? false;
    const parallelCount = options?.parallelCount ?? 2; // Fetch 2 tracks at a time
    
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
    
    console.log('[QueuePrefetch] Starting prefetch from index', startIndex, 'to', endIndex - 1, `(${parallelCount} parallel)`);
    
    isFetchingRef.current = true;
    abortControllerRef.current = new AbortController();
    
    // Build list of tracks to fetch
    const tracksToFetch: { track: Track; index: number }[] = [];
    let fetchedCount = 0;
    let bufferReadyCount = 0;
    let swCachedCount = 0;
    
    for (let i = startIndex; i < endIndex; i++) {
      const track = queue[i];
      const cached = prefetchedTracksRef.current.get(track.id);
      
      if (cached) {
        fetchedCount++;
        if (cached.buffer) bufferReadyCount++;
        if (cached.swCached) swCachedCount++;
      } else {
        tracksToFetch.push({ track, index: i });
      }
    }
    
    setState(prev => ({
      ...prev,
      totalTracks: endIndex - startIndex,
      fetchedCount,
      bufferReadyCount,
      swCachedCount,
      isActive: true,
    }));
    
    // Fetch in parallel batches
    for (let i = 0; i < tracksToFetch.length; i += parallelCount) {
      // Check if aborted
      if (abortControllerRef.current?.signal.aborted) {
        console.log('[QueuePrefetch] Aborted');
        break;
      }
      
      const batch = tracksToFetch.slice(i, i + parallelCount);
      const titles = batch.map(b => b.track.title).join(', ');
      
      setState(prev => ({
        ...prev,
        currentlyFetching: batch.length > 1 ? `${batch[0].track.title} +${batch.length - 1}` : batch[0].track.title,
      }));
      
      console.log('[QueuePrefetch] Fetching batch:', titles);
      
      // Fetch all in batch simultaneously
      const results = await Promise.allSettled(
        batch.map(({ track }) => fetchTrack(track))
      );
      
      // Process results
      results.forEach((result, idx) => {
        const { track, index } = batch[idx];
        
        if (result.status === 'fulfilled' && result.value) {
          prefetchedTracksRef.current.set(track.id, result.value);
          fetchedCount++;
          if (result.value.buffer) bufferReadyCount++;
          if (result.value.swCached) swCachedCount++;
        }
        
        lastFetchedIndexRef.current = Math.max(lastFetchedIndexRef.current, index);
      });
      
      setState(prev => ({
        ...prev,
        fetchedCount,
        bufferReadyCount,
        swCachedCount,
        lastFetchedIndex: lastFetchedIndexRef.current,
      }));
      
      // Small delay between batches to not overwhelm
      if (i + parallelCount < tracksToFetch.length) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    
    isFetchingRef.current = false;
    setState(prev => ({
      ...prev,
      currentlyFetching: null,
      isActive: fetchedCount < (endIndex - startIndex),
    }));
    
    console.log('[QueuePrefetch] Complete:', fetchedCount, 'fetched,', bufferReadyCount, 'buffers,', swCachedCount, 'SW cached');
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

  // Get URL for a track (from cache)
  const getUrl = useCallback((trackId: string): string | null => {
    const cached = prefetchedTracksRef.current.get(trackId);
    return cached?.url || null;
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
      swCachedCount: 0,
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
    getUrl,
    clearOldTracks,
    stopPrefetch,
    reset,
    state,
    isIOS: isIOS(),
    isPWA: isPWA(),
  };
};

export default useQueuePrefetch;
