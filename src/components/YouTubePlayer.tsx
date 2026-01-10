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

  useEffect(() => {
    // When switching away from YouTube, explicitly pause the existing player.
    // Otherwise audio can keep playing in background even if we stop rendering controls.
    if (!videoId) {
      try {
        playerRef.current?.pauseVideo?.();
      } catch {
        // ignore
      }
      return;
    }
    
    // If we have an existing player for a different video, use loadVideoById instead of destroying
    // This helps maintain the "user gesture" permission on iOS
    if (playerRef.current && currentVideoIdRef.current !== videoId) {
      console.log('YouTubePlayer: Loading new video without destroying player:', videoId);
      currentVideoIdRef.current = videoId;
      hasStartedPlayingRef.current = false;
      autoplayBlockedRef.current = false;
      
      try {
        // Ensure time update interval is running for the new video
        if (!timeUpdateIntervalRef.current) {
          timeUpdateIntervalRef.current = setInterval(() => {
            if (playerRef.current) {
              try {
                const currentTime = playerRef.current.getCurrentTime?.() || 0;
                const duration = playerRef.current.getDuration?.() || 0;
                if (onTimeUpdate && (currentTime > 0 || duration > 0)) {
                  onTimeUpdate(currentTime, duration);
                }
              } catch (e) {
                // Player might be destroyed
              }
            }
          }, 250);
        }
        
        // loadVideoById maintains the player instance and is more likely to autoplay on iOS
        playerRef.current.loadVideoById({
          videoId: videoId,
          startSeconds: 0,
        });
        return;
      } catch (e) {
        console.log('YouTubePlayer: loadVideoById failed, will recreate player', e);
        // Fall through to recreate player
      }
    }
    
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
    autoplayBlockedRef.current = false;
    setIsReady(false);

    const initPlayer = async () => {
      console.log('YouTubePlayer: Initializing for video:', videoId);
      await loadYouTubeAPI();

      // Destroy existing player only if we couldn't use loadVideoById
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
            setIsReady(true);
            onReady?.();
            
            // Start time update interval - always call onTimeUpdate even if duration is 0
            if (timeUpdateIntervalRef.current) {
              clearInterval(timeUpdateIntervalRef.current);
            }
            timeUpdateIntervalRef.current = setInterval(() => {
              if (playerRef.current) {
                try {
                  const currentTime = playerRef.current.getCurrentTime?.() || 0;
                  const duration = playerRef.current.getDuration?.() || 0;
                  // Always call onTimeUpdate to keep UI in sync
                  if (onTimeUpdate) {
                    onTimeUpdate(currentTime, duration);
                  }
                } catch (e) {
                  // Player might be destroyed
                }
              }
            }, 250);
            
            // Mobile-friendly autoplay: mute first, then play
            if (autoplay) {
              console.log('YouTubePlayer: Attempting muted autoplay for mobile compatibility');
              event.target.mute();
              event.target.playVideo();
              
              // Set a timeout to detect if autoplay was blocked
              setTimeout(() => {
                const state = playerRef.current?.getPlayerState?.();
                console.log('YouTubePlayer: State after autoplay attempt:', state);
                // States: -1=unstarted, 0=ended, 1=playing, 2=paused, 3=buffering, 5=cued
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
            
          // YT.PlayerState.PLAYING = 1
            if (event.data === 1) {
              // Unmute when playing starts (muted autoplay succeeded)
              if (playerRef.current?.isMuted?.()) {
                console.log('YouTubePlayer: Attempting unmute after PLAYING');
                playerRef.current.unMute?.();
                playerRef.current.setVolume?.(volume);

                // If still muted shortly after, require a user gesture (iOS Safari behavior)
                setTimeout(() => {
                  const stillMuted = !!playerRef.current?.isMuted?.();
                  if (stillMuted) {
                    console.log('YouTubePlayer: Still muted after unmute attempt; needs user gesture');
                    onNeedsUserGesture?.();
                  }
                }, 600);
              }
              
              // ALWAYS call onPlaybackStarted when state changes to PLAYING
              // This fixes the issue where resume after pause didn't update isPlaying state
              autoplayBlockedRef.current = false;
              console.log('YouTubePlayer: Playback state PLAYING, hasStartedBefore:', hasStartedPlayingRef.current);
              onPlaybackStarted?.();
              hasStartedPlayingRef.current = true;
            }
            
            // YT.PlayerState.PAUSED = 2
            if (event.data === 2) {
              console.log('YouTubePlayer: Video paused');
              onPaused?.();
            }
            
            // YT.PlayerState.ENDED = 0
            if (event.data === 0) {
              console.log('YouTubePlayer: Video ended');
              onEnded?.();
            }
            
            // YT.PlayerState.UNSTARTED = -1 or CUED = 5 on mobile (autoplay blocked)
            // Only retry once, then signal need for user gesture
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