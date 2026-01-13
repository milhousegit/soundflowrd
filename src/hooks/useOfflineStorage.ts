import { useState, useEffect, useCallback } from 'react';
import { Track } from '@/types/music';

export interface OfflineTrack {
  id: string;
  track: Track;
  blob: Blob;
  downloadedAt: string;
  fileSize: number;
}

const DB_NAME = 'soundflow-offline';
const DB_VERSION = 1;
const STORE_NAME = 'tracks';

let dbPromise: Promise<IDBDatabase> | null = null;

const openDB = (): Promise<IDBDatabase> => {
  if (dbPromise) return dbPromise;
  
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('downloadedAt', 'downloadedAt', { unique: false });
      }
    };
  });
  
  return dbPromise;
};

export const useOfflineStorage = () => {
  const [offlineTracks, setOfflineTracks] = useState<OfflineTrack[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalSize, setTotalSize] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Listen for online/offline events
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Load all offline tracks
  const loadOfflineTracks = useCallback(async () => {
    setIsLoading(true);
    try {
      const db = await openDB();
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      
      return new Promise<OfflineTrack[]>((resolve, reject) => {
        request.onsuccess = () => {
          const tracks = request.result as OfflineTrack[];
          setOfflineTracks(tracks);
          setTotalSize(tracks.reduce((sum, t) => sum + t.fileSize, 0));
          setIsLoading(false);
          resolve(tracks);
        };
        request.onerror = () => {
          setIsLoading(false);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('Failed to load offline tracks:', error);
      setIsLoading(false);
      return [];
    }
  }, []);

  // Save a track offline
  const saveTrackOffline = useCallback(async (track: Track, audioBlob: Blob): Promise<boolean> => {
    try {
      const db = await openDB();
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      const offlineTrack: OfflineTrack = {
        id: track.id,
        track,
        blob: audioBlob,
        downloadedAt: new Date().toISOString(),
        fileSize: audioBlob.size,
      };
      
      return new Promise((resolve, reject) => {
        const request = store.put(offlineTrack);
        request.onsuccess = () => {
          loadOfflineTracks(); // Refresh the list
          resolve(true);
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Failed to save track offline:', error);
      return false;
    }
  }, [loadOfflineTracks]);

  // Get a single offline track
  const getOfflineTrack = useCallback(async (trackId: string): Promise<OfflineTrack | null> => {
    try {
      const db = await openDB();
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(trackId);
      
      return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Failed to get offline track:', error);
      return null;
    }
  }, []);

  // Check if a track is available offline
  const isTrackOffline = useCallback((trackId: string): boolean => {
    return offlineTracks.some(t => t.id === trackId);
  }, [offlineTracks]);

  // Delete an offline track
  const deleteOfflineTrack = useCallback(async (trackId: string): Promise<boolean> => {
    try {
      const db = await openDB();
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      return new Promise((resolve, reject) => {
        const request = store.delete(trackId);
        request.onsuccess = () => {
          loadOfflineTracks(); // Refresh the list
          resolve(true);
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Failed to delete offline track:', error);
      return false;
    }
  }, [loadOfflineTracks]);

  // Clear all offline tracks
  const clearAllOfflineTracks = useCallback(async (): Promise<boolean> => {
    try {
      const db = await openDB();
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      return new Promise((resolve, reject) => {
        const request = store.clear();
        request.onsuccess = () => {
          setOfflineTracks([]);
          setTotalSize(0);
          resolve(true);
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Failed to clear offline tracks:', error);
      return false;
    }
  }, []);

  // Get blob URL for playback
  const getOfflineTrackUrl = useCallback(async (trackId: string): Promise<string | null> => {
    const offlineTrack = await getOfflineTrack(trackId);
    if (offlineTrack) {
      return URL.createObjectURL(offlineTrack.blob);
    }
    return null;
  }, [getOfflineTrack]);

  // Format size for display
  const formatSize = useCallback((bytes: number): string => {
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }, []);

  // Load on mount
  useEffect(() => {
    loadOfflineTracks();
  }, [loadOfflineTracks]);

  return {
    offlineTracks,
    isLoading,
    isOnline,
    totalSize,
    formatSize,
    saveTrackOffline,
    getOfflineTrack,
    getOfflineTrackUrl,
    isTrackOffline,
    deleteOfflineTrack,
    clearAllOfflineTracks,
    refreshOfflineTracks: loadOfflineTracks,
  };
};
