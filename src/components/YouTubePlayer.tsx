import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

export interface YouTubePlayerRef {
  play: () => void;
  pause: () => void;
  seekTo: (seconds: number) => void;
  setVolume: (volume: number) => void;
  getDuration: () => number;
  getCurrentTime: () => number;
  destroy: () => void;
}

interface YouTubePlayerProps {
  videoId: string | null;
  onReady?: () => void;
  onStateChange?: (state: number) => void;
  onError?: (error: number) => void;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onEnded?: () => void;
  volume?: number;
  autoplay?: boolean;
}

// Load YouTube IFrame API
let apiLoaded = false;
let apiLoading = false;
const apiReadyCallbacks: (() => void)[] = [];

function loadYouTubeAPI(): Promise<void> {
  return new Promise((resolve) => {
    if (apiLoaded && window.YT && window.YT.Player) {
      resolve();
      return;
    }

    apiReadyCallbacks.push(resolve);

    if (apiLoading) return;
    apiLoading = true;

    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

    window.onYouTubeIframeAPIReady = () => {
      apiLoaded = true;
      apiReadyCallbacks.forEach(cb => cb());
      apiReadyCallbacks.length = 0;
    };
  });
}

export const YouTubePlayer = forwardRef<YouTubePlayerRef, YouTubePlayerProps>(({
  videoId,
  onReady,
  onStateChange,
  onError,
  onTimeUpdate,
  onEnded,
  volume = 100,
  autoplay = true,
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const timeUpdateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const currentVideoIdRef = useRef<string | null>(null);

  useImperativeHandle(ref, () => ({
    play: () => playerRef.current?.playVideo?.(),
    pause: () => playerRef.current?.pauseVideo?.(),
    seekTo: (seconds: number) => playerRef.current?.seekTo?.(seconds, true),
    setVolume: (vol: number) => playerRef.current?.setVolume?.(vol),
    getDuration: () => playerRef.current?.getDuration?.() || 0,
    getCurrentTime: () => playerRef.current?.getCurrentTime?.() || 0,
    destroy: () => {
      if (timeUpdateIntervalRef.current) {
        clearInterval(timeUpdateIntervalRef.current);
      }
      playerRef.current?.destroy?.();
      playerRef.current = null;
    },
  }));

  useEffect(() => {
    if (!videoId) return;
    
    // Don't reload if same video
    if (currentVideoIdRef.current === videoId && playerRef.current) {
      if (autoplay) {
        playerRef.current.playVideo?.();
      }
      return;
    }

    currentVideoIdRef.current = videoId;

    const initPlayer = async () => {
      await loadYouTubeAPI();

      // Destroy existing player
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }

      if (!containerRef.current) return;

      // Create unique container for player
      const playerId = `yt-player-${Date.now()}`;
      containerRef.current.innerHTML = `<div id="${playerId}"></div>`;

      playerRef.current = new window.YT.Player(playerId, {
        height: '1',
        width: '1',
        videoId: videoId,
        playerVars: {
          autoplay: autoplay ? 1 : 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
          // Mobile-specific: allow inline playback
          webkit_playsinline: 1,
        },
        events: {
          onReady: (event: any) => {
            event.target.setVolume(volume);
            onReady?.();
            
            // Start time update interval
            if (timeUpdateIntervalRef.current) {
              clearInterval(timeUpdateIntervalRef.current);
            }
            timeUpdateIntervalRef.current = setInterval(() => {
              if (playerRef.current && onTimeUpdate) {
                const currentTime = playerRef.current.getCurrentTime?.() || 0;
                const duration = playerRef.current.getDuration?.() || 0;
                if (duration > 0) {
                  onTimeUpdate(currentTime, duration);
                }
              }
            }, 500);
          },
          onStateChange: (event: any) => {
            onStateChange?.(event.data);
            
            // YT.PlayerState.ENDED = 0
            if (event.data === 0) {
              onEnded?.();
            }
          },
          onError: (event: any) => {
            console.error('YouTube player error:', event.data);
            onError?.(event.data);
          },
        },
      });
    };

    initPlayer();

    return () => {
      if (timeUpdateIntervalRef.current) {
        clearInterval(timeUpdateIntervalRef.current);
      }
    };
  }, [videoId, autoplay, volume, onReady, onStateChange, onError, onTimeUpdate, onEnded]);

  // Update volume when prop changes
  useEffect(() => {
    playerRef.current?.setVolume?.(volume);
  }, [volume]);

  return (
    <div 
      ref={containerRef} 
      style={{ 
        position: 'absolute',
        width: '1px',
        height: '1px',
        overflow: 'hidden',
        opacity: 0,
        pointerEvents: 'none',
      }} 
    />
  );
});

YouTubePlayer.displayName = 'YouTubePlayer';