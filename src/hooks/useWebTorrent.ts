import { useRef, useCallback, useState } from 'react';
import WebTorrent, { Torrent, TorrentFile } from 'webtorrent';

export interface WebTorrentState {
  isLoading: boolean;
  progress: number;
  downloadSpeed: number;
  peers: number;
  error: string | null;
}

export interface StreamingFile {
  name: string;
  size: number;
  path: string;
  getBlobURL: () => Promise<string>;
}

// Audio file extensions
const AUDIO_EXTENSIONS = ['.mp3', '.flac', '.m4a', '.wav', '.aac', '.ogg', '.opus'];

const isAudioFile = (filename: string): boolean => {
  const lower = filename.toLowerCase();
  return AUDIO_EXTENSIONS.some(ext => lower.endsWith(ext));
};

export const useWebTorrent = () => {
  const clientRef = useRef<WebTorrent.Instance | null>(null);
  const currentTorrentRef = useRef<Torrent | null>(null);
  const [state, setState] = useState<WebTorrentState>({
    isLoading: false,
    progress: 0,
    downloadSpeed: 0,
    peers: 0,
    error: null,
  });

  // Initialize client lazily
  const getClient = useCallback(() => {
    if (!clientRef.current) {
      clientRef.current = new WebTorrent({
        // Use WebRTC trackers for browser-to-browser connections
        tracker: {
          announce: [
            'wss://tracker.openwebtorrent.com',
            'wss://tracker.btorrent.xyz',
            'wss://tracker.fastcast.nz',
          ],
        },
      });
    }
    return clientRef.current;
  }, []);

  // Stream a magnet link and find audio files
  const streamMagnet = useCallback(async (
    magnetUri: string,
    onAudioFilesFound?: (files: StreamingFile[]) => void
  ): Promise<StreamingFile[]> => {
    const client = getClient();
    
    // Cancel any existing torrent
    if (currentTorrentRef.current) {
      currentTorrentRef.current.destroy();
      currentTorrentRef.current = null;
    }
    
    setState(prev => ({ ...prev, isLoading: true, error: null, progress: 0 }));
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        setState(prev => ({ ...prev, isLoading: false, error: 'Timeout - no peers found' }));
        reject(new Error('Timeout - no peers found'));
      }, 60000); // 60 second timeout
      
      try {
        const torrent = client.add(magnetUri, {
          // Don't download everything, just metadata first
          announce: [
            'wss://tracker.openwebtorrent.com',
            'wss://tracker.btorrent.xyz',
            'wss://tracker.fastcast.nz',
            'udp://tracker.opentrackr.org:1337/announce',
            'udp://open.demonii.com:1337/announce',
          ],
        });
        
        currentTorrentRef.current = torrent;
        
        torrent.on('error', (err) => {
          clearTimeout(timeout);
          setState(prev => ({ ...prev, isLoading: false, error: err.message }));
          reject(err);
        });
        
        // Update progress
        const progressInterval = setInterval(() => {
          if (torrent.progress !== undefined) {
            setState(prev => ({
              ...prev,
              progress: Math.round(torrent.progress * 100),
              downloadSpeed: Math.round(torrent.downloadSpeed / 1024), // KB/s
              peers: torrent.numPeers || 0,
            }));
          }
        }, 500);
        
        torrent.on('ready', () => {
          clearTimeout(timeout);
          
          // Find audio files
          const audioFiles: StreamingFile[] = torrent.files
            .filter((file: TorrentFile) => isAudioFile(file.name))
            .map((file: TorrentFile) => ({
              name: file.name,
              size: file.length,
              path: file.path,
              getBlobURL: () => new Promise<string>((res, rej) => {
                file.getBlobURL((err, url) => {
                  if (err) rej(err);
                  else res(url || '');
                });
              }),
            }));
          
          setState(prev => ({ ...prev, isLoading: false }));
          
          if (audioFiles.length === 0) {
            clearInterval(progressInterval);
            reject(new Error('No audio files found in torrent'));
            return;
          }
          
          onAudioFilesFound?.(audioFiles);
          resolve(audioFiles);
        });
        
        torrent.on('done', () => {
          clearInterval(progressInterval);
          setState(prev => ({ ...prev, progress: 100 }));
        });
        
      } catch (err) {
        clearTimeout(timeout);
        const error = err instanceof Error ? err.message : 'Unknown error';
        setState(prev => ({ ...prev, isLoading: false, error }));
        reject(err);
      }
    });
  }, [getClient]);

  // Stream a specific file from the current torrent
  const streamFile = useCallback(async (fileName: string): Promise<string> => {
    const torrent = currentTorrentRef.current;
    if (!torrent) {
      throw new Error('No active torrent');
    }
    
    const file = torrent.files.find((f: TorrentFile) => 
      f.name === fileName || f.path === fileName
    );
    
    if (!file) {
      throw new Error(`File not found: ${fileName}`);
    }
    
    return new Promise((resolve, reject) => {
      file.getBlobURL((err, url) => {
        if (err) reject(err);
        else resolve(url || '');
      });
    });
  }, []);

  // Get streaming URL for a file (for <audio> element)
  const getStreamUrl = useCallback((file: TorrentFile): string => {
    // WebTorrent creates blob URLs that can be used directly
    // For streaming, we use renderTo or getBlobURL
    return '';
  }, []);

  // Stop all torrents and cleanup
  const destroy = useCallback(() => {
    if (currentTorrentRef.current) {
      currentTorrentRef.current.destroy();
      currentTorrentRef.current = null;
    }
    if (clientRef.current) {
      clientRef.current.destroy();
      clientRef.current = null;
    }
    setState({
      isLoading: false,
      progress: 0,
      downloadSpeed: 0,
      peers: 0,
      error: null,
    });
  }, []);

  // Cancel current download
  const cancel = useCallback(() => {
    if (currentTorrentRef.current) {
      currentTorrentRef.current.destroy();
      currentTorrentRef.current = null;
    }
    setState(prev => ({ ...prev, isLoading: false, progress: 0 }));
  }, []);

  return {
    state,
    streamMagnet,
    streamFile,
    cancel,
    destroy,
  };
};
