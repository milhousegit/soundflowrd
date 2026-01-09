import React, { useRef, useEffect, forwardRef, useImperativeHandle, useState } from 'react';

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
  onPlaybackStarted?: () => void;
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
  onPlaybackStarted,
  volume = 100,
  autoplay = true,
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const timeUpdateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const currentVideoIdRef = useRef<string | null>(null);
  const hasStartedPlayingRef = useRef(false);
  const [isReady, setIsReady] = useState(false);

  useImperativeHandle(ref, () => ({
    play: () => {
      console.log('YouTubePlayer: play() called, player exists:', !!playerRef.current);
      playerRef.current?.playVideo?.();
    },
    pause: () => {
      console.log('YouTubePlayer: pause() called');
      playerRef.current?.pauseVideo?.();
    },
    seekTo: (seconds: number) => {
      console.log('YouTubePlayer: seekTo()', seconds);
      playerRef.current?.seekTo?.(seconds, true);
    },
    setVolume: (vol: number) => playerRef.current?.setVolume?.(vol),
    getDuration: () => playerRef.current?.getDuration?.() || 0,
    getCurrentTime: () => playerRef.current?.getCurrentTime?.() || 0,
    destroy: () => {
      if (timeUpdateIntervalRef.current) {
        clearInterval(timeUpdateIntervalRef.current);
      }
      playerRef.current?.destroy?.();
      playerRef.current = null;
      setIsReady(false);
    },
  }));

  useEffect(() => {
    if (!videoId) return;
    
    // Don't reload if same video
    if (currentVideoIdRef.current === videoId && playerRef.current) {
      console.log('YouTubePlayer: Same video, just playing');
      if (autoplay) {
        playerRef.current.playVideo?.();
      }
      return;
    }

    currentVideoIdRef.current = videoId;
    hasStartedPlayingRef.current = false;
    setIsReady(false);

    const initPlayer = async () => {
      console.log('YouTubePlayer: Initializing for video:', videoId);
      await loadYouTubeAPI();

      // Destroy existing player
      if (playerRef.current) {
        if (timeUpdateIntervalRef.current) {
          clearInterval(timeUpdateIntervalRef.current);
          timeUpdateIntervalRef.current = null;
        }
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
          // Mobile-specific
          webkit_playsinline: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (event: any) => {
            console.log('YouTubePlayer: onReady fired');
            event.target.setVolume(volume);
            setIsReady(true);
            onReady?.();
            
            // Start time update interval
            if (timeUpdateIntervalRef.current) {
              clearInterval(timeUpdateIntervalRef.current);
            }
            timeUpdateIntervalRef.current = setInterval(() => {
              if (playerRef.current) {
                try {
                  const currentTime = playerRef.current.getCurrentTime?.() || 0;
                  const duration = playerRef.current.getDuration?.() || 0;
                  if (duration > 0 && onTimeUpdate) {
                    onTimeUpdate(currentTime, duration);
                  }
                } catch (e) {
                  // Player might be destroyed
                }
              }
            }, 250); // More frequent updates for smoother progress bar
            
            // Auto-play if needed
            if (autoplay) {
              console.log('YouTubePlayer: Attempting autoplay');
              event.target.playVideo();
            }
          },
          onStateChange: (event: any) => {
            console.log('YouTubePlayer: State changed to', event.data);
            onStateChange?.(event.data);
            
            // YT.PlayerState.PLAYING = 1
            if (event.data === 1) {
              if (!hasStartedPlayingRef.current) {
                hasStartedPlayingRef.current = true;
                console.log('YouTubePlayer: Playback actually started');
                onPlaybackStarted?.();
              }
            }
            
            // YT.PlayerState.ENDED = 0
            if (event.data === 0) {
              console.log('YouTubePlayer: Video ended');
              onEnded?.();
            }
            
            // YT.PlayerState.UNSTARTED = -1 or CUED = 5 on mobile (autoplay blocked)
            // Try to play again after a short delay
            if (event.data === -1 || event.data === 5) {
              console.log('YouTubePlayer: Video unstarted/cued, retrying play');
              setTimeout(() => {
                playerRef.current?.playVideo?.();
              }, 500);
            }
          },
          onError: (event: any) => {
            console.error('YouTubePlayer: Error:', event.data);
            onError?.(event.data);
          },
        },
      });
    };

    initPlayer();

    return () => {
      if (timeUpdateIntervalRef.current) {
        clearInterval(timeUpdateIntervalRef.current);
        timeUpdateIntervalRef.current = null;
      }
    };
  }, [videoId, autoplay]);

  // Update volume when prop changes
  useEffect(() => {
    if (isReady && playerRef.current) {
      playerRef.current.setVolume?.(volume);
    }
  }, [volume, isReady]);

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