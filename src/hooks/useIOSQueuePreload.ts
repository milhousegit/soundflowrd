// useIOSQueuePreload - iOS-specific queue preloading with Service Worker integration
// Preloads multiple tracks when playback starts for seamless background playback

import { useRef, useCallback, useEffect } from 'react';
import { isIOS, isPWA } from './useIOSAudioSession';
import { Track } from '@/types/music';
import { getTidalStream, mapQualityToTidal } from '@/lib/tidal';

interface PreloadStatus {
  loaded: number;
  total: number;
  cached: number;
}

interface UseIOSQueuePreloadOptions {
  queue: Track[];
  currentIndex: number;
  isPlaying: boolean;
  audioQuality: 'high' | 'medium' | 'low';
  enabled?: boolean;
}

export const useIOSQueuePreload = (options: UseIOSQueuePreloadOptions) => {
  const { queue, currentIndex, isPlaying, audioQuality, enabled = true } = options;
  
  // Only active on iOS PWA
  const isIOSPWA = isIOS() && isPWA();
  
  const isPreloadingRef = useRef(false);
  const preloadedTrackIdsRef = useRef<Set<string>>(new Set());
  const cachedCountRef = useRef(0);
  
  // Dispatch preload status update to UI
  const dispatchPreloadStatus = useCallback((loaded: number, total: number, cached: number) => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ios-preload-update', {
        detail: { loaded, total, cached } as PreloadStatus
      }));
    }
  }, []);
  
  // Send message to Service Worker
  const sendToServiceWorker = useCallback((message: any) => {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage(message);
    }
  }, []);
  
  // Preload a single track URL
  const preloadTrackUrl = useCallback(async (track: Track): Promise<string | null> => {
    if (preloadedTrackIdsRef.current.has(track.id)) {
      return null; // Already preloaded
    }
    
    try {
      const tidalQuality = mapQualityToTidal(audioQuality);
      const result = await getTidalStream(track.title, track.artist, tidalQuality);
      
      if ('streamUrl' in result && result.streamUrl) {
        preloadedTrackIdsRef.current.add(track.id);
        return result.streamUrl;
      }
    } catch (error) {
      console.log('[iOSPreload] Failed to get stream for:', track.title, error);
    }
    
    return null;
  }, [audioQuality]);
  
  // Batch preload upcoming tracks
  const preloadQueue = useCallback(async () => {
    if (!isIOSPWA || !enabled || isPreloadingRef.current) return;
    if (queue.length === 0 || currentIndex < 0) return;
    
    isPreloadingRef.current = true;
    
    // Get next N tracks to preload (max 5 for performance)
    const maxPreload = 5;
    const startIndex = currentIndex + 1;
    const endIndex = Math.min(startIndex + maxPreload, queue.length);
    const tracksToPreload = queue.slice(startIndex, endIndex);
    
    if (tracksToPreload.length === 0) {
      isPreloadingRef.current = false;
      return;
    }
    
    console.log('[iOSPreload] Starting batch preload for', tracksToPreload.length, 'tracks');
    dispatchPreloadStatus(0, tracksToPreload.length, cachedCountRef.current);
    
    const urlsToCache: string[] = [];
    let loaded = 0;
    
    // Preload in parallel (2 at a time to avoid overwhelming the network)
    const batchSize = 2;
    for (let i = 0; i < tracksToPreload.length; i += batchSize) {
      const batch = tracksToPreload.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (track) => {
        const url = await preloadTrackUrl(track);
        if (url) {
          urlsToCache.push(url);
          loaded++;
          dispatchPreloadStatus(loaded, tracksToPreload.length, cachedCountRef.current);
        }
      }));
    }
    
    // Send URLs to Service Worker for caching
    if (urlsToCache.length > 0) {
      sendToServiceWorker({
        type: 'PRELOAD_AUDIO',
        urls: urlsToCache
      });
    }
    
    cachedCountRef.current += urlsToCache.length;
    dispatchPreloadStatus(loaded, tracksToPreload.length, cachedCountRef.current);
    
    console.log('[iOSPreload] Batch preload complete:', loaded, '/', tracksToPreload.length);
    isPreloadingRef.current = false;
  }, [isIOSPWA, enabled, queue, currentIndex, preloadTrackUrl, sendToServiceWorker, dispatchPreloadStatus]);
  
  // Listen for Service Worker preload progress updates
  useEffect(() => {
    if (!isIOSPWA) return;
    
    const handleSWMessage = (event: MessageEvent) => {
      if (event.data?.type === 'AUDIO_PRELOAD_PROGRESS') {
        console.log('[iOSPreload] SW progress:', event.data.loaded, '/', event.data.total);
      }
      if (event.data?.type === 'AUDIO_CACHE_SIZE') {
        cachedCountRef.current = event.data.count;
      }
    };
    
    navigator.serviceWorker?.addEventListener('message', handleSWMessage);
    
    // Request initial cache size
    sendToServiceWorker({ type: 'GET_AUDIO_CACHE_SIZE' });
    
    return () => {
      navigator.serviceWorker?.removeEventListener('message', handleSWMessage);
    };
  }, [isIOSPWA, sendToServiceWorker]);
  
  // Trigger preload when playback starts or queue changes
  useEffect(() => {
    if (!isIOSPWA || !enabled || !isPlaying) return;
    
    // Delay preload to not interfere with current track loading
    const timeout = setTimeout(() => {
      preloadQueue();
    }, 3000);
    
    return () => clearTimeout(timeout);
  }, [isIOSPWA, enabled, isPlaying, currentIndex, preloadQueue]);
  
  // Clear preloaded set when queue changes significantly
  useEffect(() => {
    // If queue changed, clear the preloaded set to allow re-preloading
    preloadedTrackIdsRef.current.clear();
  }, [queue.length]);
  
  // Manual trigger for preloading
  const triggerPreload = useCallback(() => {
    preloadQueue();
  }, [preloadQueue]);
  
  // Clear audio cache
  const clearCache = useCallback(() => {
    sendToServiceWorker({ type: 'CLEAR_AUDIO_CACHE' });
    preloadedTrackIdsRef.current.clear();
    cachedCountRef.current = 0;
    dispatchPreloadStatus(0, 0, 0);
  }, [sendToServiceWorker, dispatchPreloadStatus]);
  
  return {
    isActive: isIOSPWA && enabled,
    triggerPreload,
    clearCache,
    cachedCount: cachedCountRef.current,
  };
};

export default useIOSQueuePreload;
