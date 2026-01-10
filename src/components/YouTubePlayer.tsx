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
  isMuted: () => boolean;
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
  onPaused?: () => void;
  onNeedsUserGesture?: () => void;
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
  onPaused,
  onNeedsUserGesture,
  volume = 100,
  autoplay = true,
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const timeUpdateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const currentVideoIdRef = useRef<string | null>(null);
  const hasStartedPlayingRef = useRef(false);
  const autoplayBlockedRef = useRef(false);
  const [isReady, setIsReady] = useState(false);

  useImperativeHandle(ref, () => ({
    play: () => {
      console.log('YouTubePlayer: play() called, player exists:', !!playerRef.current);
      try {
        // Attempt to unmute (may be ignored by iOS without a user gesture)
        if (playerRef.current?.isMuted?.()) {
          console.log('YouTubePlayer: play() unmuting before play');
          playerRef.current.unMute?.();
          playerRef.current.setVolume?.(volume);
        }
        playerRef.current?.playVideo?.();
      } catch (e) {
        console.error('YouTubePlayer: play() failed', e);
      }
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
    isMuted: () => !!playerRef.current?.isMuted?.(),
    destroy: () => {
      if (timeUpdateIntervalRef.current) {
        clearInterval(timeUpdateIntervalRef.current);
      }
      playerRef.current?.destroy?.();
      playerRef.current = null;
      setIsReady(false);
    },
  }));

  // Preload the YouTube IFrame API as soon as the component is mounted.
  // This improves first-play reliability on iOS where autoplay can be timing-sensitive.
  useEffect(() => {
    loadYouTubeAPI().catch(() => {
      // ignore
    });
  }, []);

  // Pre-create player on first user interaction (helps iOS autoplay)
  useEffect(() => {
    const warmUpPlayer = async () => {
      // Only warm up once, and only if no player exists
      if (playerRef.current || !containerRef.current) return;
      
      console.log('YouTubePlayer: Warming up player on user interaction');
      await loadYouTubeAPI();
      
      if (!containerRef.current || playerRef.current) return;
      
      const playerId = `yt-player-warmup-${Date.now()}`;
      containerRef.current.innerHTML = `<div id="${playerId}"></div>`;
      
      playerRef.current = new window.YT.Player(playerId, {
        height: '1',
        width: '1',
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
          webkit_playsinline: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            console.log('YouTubePlayer: Warm-up player ready');
            setIsReady(true);
            
            // Start time update interval
            if (timeUpdateIntervalRef.current) {
              clearInterval(timeUpdateIntervalRef.current);
            }
            timeUpdateIntervalRef.current = setInterval(() => {
              if (playerRef.current) {
                try {
                  const currentTime = playerRef.current.getCurrentTime?.() || 0;
                  const duration = playerRef.current.getDuration?.() || 0;
                  if (onTimeUpdate) {
                    onTimeUpdate(currentTime, duration);
                  }
                } catch (e) {
                  // Player might be destroyed
                }
              }
            }, 250);
          },
          onStateChange: (event: any) => {
            console.log('YouTubePlayer: State changed to', event.data);
            onStateChange?.(event.data);
            
            if (event.data === 1) {
              if (playerRef.current?.isMuted?.()) {
                console.log('YouTubePlayer: Attempting unmute after PLAYING');
                playerRef.current.unMute?.();
                playerRef.current.setVolume?.(volume);
                
                setTimeout(() => {
                  const stillMuted = !!playerRef.current?.isMuted?.();
                  if (stillMuted) {
                    console.log('YouTubePlayer: Still muted after unmute attempt; needs user gesture');
                    onNeedsUserGesture?.();
                  }
                }, 600);
              }
              
              autoplayBlockedRef.current = false;
              console.log('YouTubePlayer: Playback state PLAYING');
              onPlaybackStarted?.();
              hasStartedPlayingRef.current = true;
            }
            
            if (event.data === 2) {
              console.log('YouTubePlayer: Video paused');
              onPaused?.();
            }
            
            if (event.data === 0) {
              console.log('YouTubePlayer: Video ended');
              onEnded?.();
            }
            
            if (event.data === -1 || event.data === 5) {
              if (!autoplayBlockedRef.current && currentVideoIdRef.current) {
                console.log('YouTubePlayer: Video unstarted/cued, trying muted play');
                autoplayBlockedRef.current = true;
                playerRef.current?.mute?.();
                setTimeout(() => {
                  playerRef.current?.playVideo?.();
                }, 300);
              } else if (currentVideoIdRef.current) {
                console.log('YouTubePlayer: Autoplay definitely blocked, needs user gesture');
                onNeedsUserGesture?.();
              }
            }
          },
          onError: (event: any) => {
            console.error('YouTubePlayer: Error:', event.data);
            onError?.(event.data);
          },
        },
      });
    };
    
    // Listen for first user interaction to warm up player
    const handleInteraction = () => {
      warmUpPlayer();
      // Remove listeners after first interaction
      document.removeEventListener('touchstart', handleInteraction);
      document.removeEventListener('click', handleInteraction);
    };
    
    document.addEventListener('touchstart', handleInteraction, { once: true, passive: true });
    document.addEventListener('click', handleInteraction, { once: true });
    
    return () => {
      document.removeEventListener('touchstart', handleInteraction);
      document.removeEventListener('click', handleInteraction);
    };
  }, []);

  useEffect(() => {
    // When switching away from YouTube, explicitly pause the existing player.
    if (!videoId) {
      try {
        playerRef.current?.pauseVideo?.();
      } catch {
        // ignore
      }
      return;
    }
    
    // If player exists (warmed up or from previous video), use loadVideoById
    if (playerRef.current && isReady) {
      if (currentVideoIdRef.current !== videoId) {
        console.log('YouTubePlayer: Using loadVideoById for:', videoId);
        currentVideoIdRef.current = videoId;
        hasStartedPlayingRef.current = false;
        autoplayBlockedRef.current = false;
        
        try {
          playerRef.current.loadVideoById({
            videoId: videoId,
            startSeconds: 0,
          });
          return;
        } catch (e) {
          console.log('YouTubePlayer: loadVideoById failed', e);
        }
      } else {
        // Same video, reset to start
        console.log('YouTubePlayer: Same video, resetting to start');
        hasStartedPlayingRef.current = false;
        try {
          playerRef.current.seekTo?.(0, true);
          if (autoplay) {
            playerRef.current.playVideo?.();
          }
        } catch (e) {
          console.log('YouTubePlayer: seekTo failed', e);
        }
        return;
      }
    }
    
    // Fallback: create player if it doesn't exist yet
    currentVideoIdRef.current = videoId;
    hasStartedPlayingRef.current = false;
    autoplayBlockedRef.current = false;

    const initPlayer = async () => {
      console.log('YouTubePlayer: Creating new player for video:', videoId);
      await loadYouTubeAPI();

      if (playerRef.current) {
        if (timeUpdateIntervalRef.current) {
          clearInterval(timeUpdateIntervalRef.current);
          timeUpdateIntervalRef.current = null;
        }
        playerRef.current.destroy();
        playerRef.current = null;
      }

      if (!containerRef.current) return;

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
          webkit_playsinline: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (event: any) => {
            console.log('YouTubePlayer: onReady fired');
            setIsReady(true);
            onReady?.();
            
            if (timeUpdateIntervalRef.current) {
              clearInterval(timeUpdateIntervalRef.current);
            }
            timeUpdateIntervalRef.current = setInterval(() => {
              if (playerRef.current) {
                try {
                  const currentTime = playerRef.current.getCurrentTime?.() || 0;
                  const duration = playerRef.current.getDuration?.() || 0;
                  if (onTimeUpdate) {
                    onTimeUpdate(currentTime, duration);
                  }
                } catch (e) {
                  // Player might be destroyed
                }
              }
            }, 250);
            
            if (autoplay) {
              console.log('YouTubePlayer: Attempting muted autoplay for mobile compatibility');
              event.target.mute();
              event.target.playVideo();
              
              setTimeout(() => {
                const state = playerRef.current?.getPlayerState?.();
                console.log('YouTubePlayer: State after autoplay attempt:', state);
                if (state === -1 || state === 5 || state === 2) {
                  console.log('YouTubePlayer: Autoplay blocked, needs user gesture');
                  autoplayBlockedRef.current = true;
                  onNeedsUserGesture?.();
                }
              }, 1500);
            }
          },
          onStateChange: (event: any) => {
            console.log('YouTubePlayer: State changed to', event.data);
            onStateChange?.(event.data);
            
            if (event.data === 1) {
              if (playerRef.current?.isMuted?.()) {
                console.log('YouTubePlayer: Attempting unmute after PLAYING');
                playerRef.current.unMute?.();
                playerRef.current.setVolume?.(volume);

                setTimeout(() => {
                  const stillMuted = !!playerRef.current?.isMuted?.();
                  if (stillMuted) {
                    console.log('YouTubePlayer: Still muted after unmute attempt; needs user gesture');
                    onNeedsUserGesture?.();
                  }
                }, 600);
              }
              
              autoplayBlockedRef.current = false;
              console.log('YouTubePlayer: Playback state PLAYING');
              onPlaybackStarted?.();
              hasStartedPlayingRef.current = true;
            }
            
            if (event.data === 2) {
              console.log('YouTubePlayer: Video paused');
              onPaused?.();
            }
            
            if (event.data === 0) {
              console.log('YouTubePlayer: Video ended');
              onEnded?.();
            }
            
            if (event.data === -1 || event.data === 5) {
              if (!autoplayBlockedRef.current) {
                console.log('YouTubePlayer: Video unstarted/cued, trying muted play');
                autoplayBlockedRef.current = true;
                playerRef.current?.mute?.();
                setTimeout(() => {
                  playerRef.current?.playVideo?.();
                }, 300);
              } else {
                console.log('YouTubePlayer: Autoplay definitely blocked, needs user gesture');
                onNeedsUserGesture?.();
              }
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
  }, [videoId, autoplay, isReady]);

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