import React, { useEffect, useRef } from 'react';
import { usePlayer } from '@/contexts/PlayerContext';
import { Button } from '@/components/ui/button';
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';

interface AlwaysOnDisplayProps {
  onClose: () => void;
}

const AlwaysOnDisplay: React.FC<AlwaysOnDisplayProps> = ({ onClose }) => {
  const { currentTrack, isPlaying, toggle, next, previous } = usePlayer();
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // Triple tap to close
  const tapCountRef = useRef(0);
  const lastTapRef = useRef(0);

  const handleTripleTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 400) {
      tapCountRef.current += 1;
      if (tapCountRef.current >= 3) {
        tapCountRef.current = 0;
        onClose();
      }
    } else {
      tapCountRef.current = 1;
    }
    lastTapRef.current = now;
  };

  // Request Wake Lock to keep screen on
  useEffect(() => {
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
          console.log('[AlwaysOn] Wake Lock acquired');
        }
      } catch (err) {
        console.log('[AlwaysOn] Wake Lock request failed:', err);
      }
    };

    requestWakeLock();

    // Re-acquire wake lock on visibility change
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLockRef.current) {
        wakeLockRef.current.release();
        console.log('[AlwaysOn] Wake Lock released');
      }
    };
  }, []);

  if (!currentTrack) return null;

  return (
    <div 
      className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center select-none"
      style={{ 
        WebkitUserSelect: 'none',
        userSelect: 'none',
      }}
    >
      {/* Close hint */}
      <div className="absolute top-0 left-0 right-0 flex justify-center" style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 24px)' }}>
        <p className="text-white/15 text-xs">Triplo tap per chiudere</p>
      </div>

      {/* Album cover - dimmed, tappable */}
      <div 
        className="w-56 h-56 rounded-2xl overflow-hidden mb-8 cursor-pointer"
        style={{ filter: 'brightness(0.35)' }}
        onClick={handleTripleTap}
      >
        {currentTrack.coverUrl ? (
          <img 
            src={currentTrack.coverUrl} 
            alt={currentTrack.album} 
            className="w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full bg-white/10 flex items-center justify-center">
            <span className="text-white/30 text-6xl">♪</span>
          </div>
        )}
      </div>

      {/* Track info - dimmed */}
      <div className="text-center mb-10 px-8" style={{ filter: 'brightness(0.5)' }}>
        <h2 className="text-white text-lg font-semibold truncate max-w-[280px]">
          {currentTrack.title}
        </h2>
        <p className="text-white/50 text-sm truncate max-w-[280px] mt-1">
          {currentTrack.artist}
        </p>
      </div>

      {/* Controls - dimmed */}
      <div 
        className="flex items-center gap-10"
        style={{ filter: 'brightness(0.4)' }}
      >
        <Button
          variant="ghost"
          size="icon"
          className="h-14 w-14 text-white/70 hover:text-white hover:bg-white/5 active:bg-white/10"
          onClick={(e) => { e.stopPropagation(); previous(); }}
        >
          <SkipBack className="w-7 h-7" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-18 w-18 rounded-full border border-white/20 text-white hover:text-white hover:bg-white/5 active:bg-white/10"
          style={{ width: '72px', height: '72px' }}
          onClick={(e) => { e.stopPropagation(); toggle(); }}
        >
          {isPlaying ? (
            <Pause className="w-9 h-9" />
          ) : (
            <Play className="w-9 h-9 ml-1" />
          )}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-14 w-14 text-white/70 hover:text-white hover:bg-white/5 active:bg-white/10"
          onClick={(e) => { e.stopPropagation(); next(); }}
        >
          <SkipForward className="w-7 h-7" />
        </Button>
      </div>
    </div>
  );
};

export default AlwaysOnDisplay;
