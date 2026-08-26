import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export const YOUTUBE_PLAYER_STATES = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const;

type YouTubePlayerState = (typeof YOUTUBE_PLAYER_STATES)[keyof typeof YOUTUBE_PLAYER_STATES];

interface YouTubePlayerApi {
  loadVideoById: (videoId: string) => void;
  cueVideoById: (videoId: string) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  stopVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  setVolume: (volume: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  destroy: () => void;
}

interface YouTubePlayerEvent {
  target: YouTubePlayerApi;
  data: number;
}

interface YouTubePlayerOptions {
  width: string;
  height: string;
  videoId?: string;
  playerVars: Record<string, number | string>;
  events: {
    onReady: (event: YouTubePlayerEvent) => void;
    onStateChange: (event: YouTubePlayerEvent) => void;
    onError: (event: YouTubePlayerEvent) => void;
  };
}

interface YouTubeNamespace {
  Player: new (element: HTMLElement, options: YouTubePlayerOptions) => YouTubePlayerApi;
}

declare global {
  interface Window {
    YT?: YouTubeNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<void> | null = null;

function loadYouTubeIframeApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('YouTube is only available in a browser'));
  if (window.YT?.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<void>((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      resolve();
    };

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://www.youtube.com/iframe_api"]',
    );
    if (existingScript) {
      existingScript.addEventListener('error', () => reject(new Error('Unable to load YouTube IFrame API')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => reject(new Error('Unable to load YouTube IFrame API'));
    document.head.appendChild(script);
  });

  return apiPromise;
}

interface YouTubePlayerContextValue {
  videoId: string | null;
  playerState: YouTubePlayerState;
  currentTime: number;
  duration: number;
  errorCode: number | null;
  isReady: boolean;
  loadVideo: (videoId: string, autoplay?: boolean) => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  setMobilePlayerExpanded: (expanded: boolean) => void;
  setYoutubeVisualVisible: (visible: boolean) => void;
}

const YouTubePlayerContext = createContext<YouTubePlayerContextValue | undefined>(undefined);

const YouTubePlayerSurface: React.FC<{
  containerRef: React.RefObject<HTMLDivElement>;
  active: boolean;
  mobileExpanded: boolean;
}> = ({ containerRef, active, mobileExpanded }) => (
  <div
    className={active
      ? mobileExpanded
        ? 'youtube-background-surface is-active is-mobile fixed inset-0 z-[55] overflow-hidden bg-black pointer-events-none md:hidden'
        : 'youtube-background-surface is-active is-desktop fixed -left-[10000px] top-0 h-px w-px overflow-hidden md:left-auto md:right-0 md:top-14 md:bottom-0 md:h-auto md:w-[380px] md:block md:z-[30]'
      : 'youtube-background-surface fixed -left-[10000px] top-0 h-px w-px overflow-hidden'}
    aria-label={active ? 'YouTube player' : undefined}
  >
    <div ref={containerRef} className="h-full w-full" />
    <div
      aria-hidden="true"
      className="youtube-player-contrast youtube-player-contrast-top"
    />
    <div
      aria-hidden="true"
      className="youtube-player-contrast youtube-player-contrast-bottom"
    />
  </div>
);

export const YouTubePlayerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayerApi | null>(null);
  const pendingLoadRef = useRef<{ videoId: string; autoplay: boolean } | null>(null);
  const playerStateRef = useRef<YouTubePlayerState>(YOUTUBE_PLAYER_STATES.UNSTARTED);
  const pendingPlayRef = useRef(false);
  const playRetryTimeoutsRef = useRef<number[]>([]);
  const volumeRef = useRef(0.7);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [playerState, setPlayerState] = useState<YouTubePlayerState>(YOUTUBE_PLAYER_STATES.UNSTARTED);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [errorCode, setErrorCode] = useState<number | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [mobilePlayerExpanded, setMobilePlayerExpanded] = useState(false);
  const [youtubeVisualVisible, setYoutubeVisualVisible] = useState(true);

  const clearPlayRetries = useCallback(() => {
    playRetryTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    playRetryTimeoutsRef.current = [];
  }, []);

  const attemptPlay = useCallback(() => {
    const player = playerRef.current;
    if (!player || playerStateRef.current === YOUTUBE_PLAYER_STATES.PLAYING) return;

    try {
      player.playVideo();
    } catch {
      // The iframe can still be initializing; the scheduled attempts will retry.
    }
  }, []);

  const schedulePlayRetries = useCallback(() => {
    clearPlayRetries();
    attemptPlay();

    // The first call is synchronous (important for an actual iOS tap). The
    // follow-up calls cover the short window in which the iframe is buffering
    // or has just completed a pending load.
    [120, 350, 800, 1500].forEach((delay) => {
      const timeoutId = window.setTimeout(() => {
        if (pendingPlayRef.current && playerStateRef.current !== YOUTUBE_PLAYER_STATES.PLAYING) {
          attemptPlay();
        }
      }, delay);
      playRetryTimeoutsRef.current.push(timeoutId);
    });
  }, [attemptPlay, clearPlayRetries]);

  const applyLoad = useCallback((request: { videoId: string; autoplay: boolean }) => {
    const player = playerRef.current;
    if (!player) return;

    clearPlayRetries();
    pendingPlayRef.current = request.autoplay;
    setVideoId(request.videoId);
    playerStateRef.current = YOUTUBE_PLAYER_STATES.UNSTARTED;
    setPlayerState(YOUTUBE_PLAYER_STATES.UNSTARTED);
    setCurrentTime(0);
    setDuration(0);
    setErrorCode(null);

    if (request.autoplay) {
      player.loadVideoById(request.videoId);
      schedulePlayRetries();
    } else {
      pendingPlayRef.current = false;
      player.cueVideoById(request.videoId);
    }
  }, [clearPlayRetries, schedulePlayRetries]);

  useEffect(() => {
    let cancelled = false;

    loadYouTubeIframeApi()
      .then(() => {
        if (cancelled || !containerRef.current || !window.YT?.Player || playerRef.current) return;

        playerRef.current = new window.YT.Player(containerRef.current, {
          width: '100%',
          height: '100%',
          playerVars: {
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            enablejsapi: 1,
            fs: 0,
            origin: window.location.origin,
            playsinline: 1,
            rel: 0,
          },
          events: {
            onReady: () => {
              setIsReady(true);
              playerRef.current?.setVolume(Math.round(volumeRef.current * 100));
              if (pendingLoadRef.current) {
                const request = pendingLoadRef.current;
                pendingLoadRef.current = null;
                applyLoad(request);
              } else if (pendingPlayRef.current) {
                schedulePlayRetries();
              }
            },
            onStateChange: (event) => {
              const nextState = event.data as YouTubePlayerState;
              playerStateRef.current = nextState;
              setPlayerState(nextState);
              if (nextState === YOUTUBE_PLAYER_STATES.PLAYING) {
                pendingPlayRef.current = false;
                clearPlayRetries();
              }
            },
            onError: (event) => {
              setErrorCode(event.data);
            },
          },
        });
      })
      .catch((error) => {
        console.error('[YouTubePlayer] IFrame API error:', error);
      });

    return () => {
      cancelled = true;
      clearPlayRetries();
      pendingPlayRef.current = false;
      playerRef.current?.destroy();
      playerRef.current = null;
      setIsReady(false);
    };
  }, [applyLoad, clearPlayRetries, schedulePlayRetries]);

  useEffect(() => {
    if (!isReady || !videoId) return;

    const interval = window.setInterval(() => {
      const player = playerRef.current;
      if (!player) return;

      try {
        const nextTime = Number(player.getCurrentTime()) || 0;
        const nextDuration = Number(player.getDuration()) || 0;
        setCurrentTime(nextTime);
        if (nextDuration > 0) setDuration(nextDuration);
      } catch {
        // The iframe can disappear while the app is navigating; ignore that tick.
      }
    }, 250);

    return () => window.clearInterval(interval);
  }, [isReady, videoId]);

  const loadVideo = useCallback((nextVideoId: string, autoplay = true) => {
    if (!nextVideoId) return;

    const request = { videoId: nextVideoId, autoplay };
    clearPlayRetries();
    pendingPlayRef.current = autoplay;
    setVideoId(nextVideoId);
    playerStateRef.current = YOUTUBE_PLAYER_STATES.UNSTARTED;
    setPlayerState(YOUTUBE_PLAYER_STATES.UNSTARTED);
    setCurrentTime(0);
    setDuration(0);
    setErrorCode(null);

    if (playerRef.current && isReady) {
      applyLoad(request);
    } else {
      pendingLoadRef.current = request;
    }
  }, [applyLoad, clearPlayRetries, isReady]);

  const play = useCallback(() => {
    pendingPlayRef.current = true;
    schedulePlayRetries();
  }, [schedulePlayRetries]);

  const pause = useCallback(() => {
    pendingPlayRef.current = false;
    clearPlayRetries();
    playerRef.current?.pauseVideo();
  }, [clearPlayRetries]);

  const stop = useCallback(() => {
    pendingLoadRef.current = null;
    pendingPlayRef.current = false;
    clearPlayRetries();
    playerRef.current?.stopVideo();
    setVideoId(null);
    playerStateRef.current = YOUTUBE_PLAYER_STATES.UNSTARTED;
    setPlayerState(YOUTUBE_PLAYER_STATES.UNSTARTED);
    setCurrentTime(0);
    setDuration(0);
    setErrorCode(null);
  }, [clearPlayRetries]);

  const seek = useCallback((time: number) => {
    if (!playerRef.current) return;
    playerRef.current.seekTo(Math.max(0, time), true);
    setCurrentTime(Math.max(0, time));
  }, []);

  const setVolume = useCallback((volume: number) => {
    volumeRef.current = Math.max(0, Math.min(1, volume));
    playerRef.current?.setVolume(Math.round(volumeRef.current * 100));
  }, []);

  const value = useMemo<YouTubePlayerContextValue>(() => ({
    videoId,
    playerState,
    currentTime,
    duration,
    errorCode,
    isReady,
    loadVideo,
    play,
    pause,
    stop,
    seek,
    setVolume,
    setMobilePlayerExpanded,
    setYoutubeVisualVisible,
  }), [currentTime, duration, errorCode, isReady, loadVideo, mobilePlayerExpanded, pause, playerState, play, seek, setVolume, setYoutubeVisualVisible, stop, videoId, youtubeVisualVisible]);

  return (
    <YouTubePlayerContext.Provider value={value}>
      <YouTubePlayerSurface
        containerRef={containerRef}
        active={Boolean(videoId && youtubeVisualVisible)}
        mobileExpanded={mobilePlayerExpanded}
      />
      {children}
    </YouTubePlayerContext.Provider>
  );
};

export const useYouTubePlayer = () => {
  const context = useContext(YouTubePlayerContext);
  if (!context) throw new Error('useYouTubePlayer must be used within YouTubePlayerProvider');
  return context;
};
