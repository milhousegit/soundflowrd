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
}

const YouTubePlayerContext = createContext<YouTubePlayerContextValue | undefined>(undefined);

const YouTubePlayerSurface: React.FC<{
  containerRef: React.RefObject<HTMLDivElement>;
  active: boolean;
}> = ({ containerRef, active }) => (
  <div
    className={active
      ? 'fixed bottom-24 right-4 z-40 w-[240px] h-[200px] overflow-hidden rounded-xl border border-border bg-black shadow-2xl'
      : 'fixed -left-[10000px] top-0 w-[240px] h-[200px] overflow-hidden'}
    aria-label={active ? 'YouTube player' : undefined}
  >
    <div ref={containerRef} className="h-[200px] w-[240px]" />
  </div>
);

export const YouTubePlayerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayerApi | null>(null);
  const pendingLoadRef = useRef<{ videoId: string; autoplay: boolean } | null>(null);
  const volumeRef = useRef(0.7);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [playerState, setPlayerState] = useState<YouTubePlayerState>(YOUTUBE_PLAYER_STATES.UNSTARTED);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [errorCode, setErrorCode] = useState<number | null>(null);
  const [isReady, setIsReady] = useState(false);

  const applyLoad = useCallback((request: { videoId: string; autoplay: boolean }) => {
    const player = playerRef.current;
    if (!player) return;

    setVideoId(request.videoId);
    setPlayerState(YOUTUBE_PLAYER_STATES.UNSTARTED);
    setCurrentTime(0);
    setDuration(0);
    setErrorCode(null);

    if (request.autoplay) player.loadVideoById(request.videoId);
    else player.cueVideoById(request.videoId);
  }, []);

  useEffect(() => {
    let cancelled = false;

    loadYouTubeIframeApi()
      .then(() => {
        if (cancelled || !containerRef.current || !window.YT?.Player || playerRef.current) return;

        playerRef.current = new window.YT.Player(containerRef.current, {
          width: '240',
          height: '200',
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
              }
            },
            onStateChange: (event) => {
              setPlayerState(event.data as YouTubePlayerState);
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
      playerRef.current?.destroy();
      playerRef.current = null;
      setIsReady(false);
    };
  }, [applyLoad]);

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
    setVideoId(nextVideoId);
    setPlayerState(YOUTUBE_PLAYER_STATES.UNSTARTED);
    setCurrentTime(0);
    setDuration(0);
    setErrorCode(null);

    if (playerRef.current && isReady) {
      applyLoad(request);
    } else {
      pendingLoadRef.current = request;
    }
  }, [applyLoad, isReady]);

  const play = useCallback(() => playerRef.current?.playVideo(), []);
  const pause = useCallback(() => playerRef.current?.pauseVideo(), []);

  const stop = useCallback(() => {
    pendingLoadRef.current = null;
    playerRef.current?.stopVideo();
    setVideoId(null);
    setPlayerState(YOUTUBE_PLAYER_STATES.UNSTARTED);
    setCurrentTime(0);
    setDuration(0);
    setErrorCode(null);
  }, []);

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
  }), [currentTime, duration, errorCode, isReady, loadVideo, pause, playerState, play, seek, setVolume, stop, videoId]);

  return (
    <YouTubePlayerContext.Provider value={value}>
      <YouTubePlayerSurface containerRef={containerRef} active={Boolean(videoId)} />
      {children}
    </YouTubePlayerContext.Provider>
  );
};

export const useYouTubePlayer = () => {
  const context = useContext(YouTubePlayerContext);
  if (!context) throw new Error('useYouTubePlayer must be used within YouTubePlayerProvider');
  return context;
};
