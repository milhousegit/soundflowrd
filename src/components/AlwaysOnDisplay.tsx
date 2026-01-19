import React, { useEffect, useRef } from 'react';
import { usePlayer } from '@/contexts/PlayerContext';
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';

interface AlwaysOnDisplayProps {
  onClose: () => void;
}

const AlwaysOnDisplay: React.FC<AlwaysOnDisplayProps> = ({ onClose }) => {
  const { currentTrack, isPlaying, toggle, next, previous } = usePlayer();
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // Triple tap to close - only on cover
  const tapCountRef = useRef(0);
  const lastTapRef = useRef(0);

  const handleCoverTap = () => {
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

  // Simple touch handlers for iOS - these respond immediately
  const handlePrevious = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    previous();
  };

  const handleToggle = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggle();
  };

  const handleNext = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    next();
  };

  return (
    <div 
      className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center select-none touch-manipulation"
      style={{ 
        WebkitUserSelect: 'none',
        userSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {/* Close hint */}
      <div 
        className="absolute top-0 left-0 right-0 flex justify-center" 
        style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 24px)' }}
      >
        <p className="text-white/20 text-xs">Triplo tap sulla cover per chiudere</p>
      </div>

      {/* Album cover - dimmed, tappable for triple-tap close */}
      <div 
        className="w-56 h-56 rounded-2xl overflow-hidden mb-8 active:scale-95 transition-transform"
        style={{ filter: 'brightness(0.35)' }}
        onTouchEnd={handleCoverTap}
        onClick={handleCoverTap}
      >
        {currentTrack.coverUrl ? (
          <img 
            src={currentTrack.coverUrl} 
            alt={currentTrack.album} 
            className="w-full h-full object-cover pointer-events-none"
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

      {/* Controls - using native divs for better iOS touch response */}
      <div 
        className="flex items-center gap-8"
        style={{ filter: 'brightness(0.5)' }}
      >
        {/* Previous button */}
        <div
          className="h-14 w-14 flex items-center justify-center rounded-full text-white/80 active:text-white active:bg-white/20 active:scale-90 transition-all cursor-pointer touch-manipulation"
          onTouchEnd={handlePrevious}
          onClick={handlePrevious}
        >
          <SkipBack className="w-7 h-7" />
        </div>

        {/* Play/Pause button */}
        <div
          className="flex items-center justify-center rounded-full border border-white/30 text-white active:bg-white/20 active:scale-90 transition-all cursor-pointer touch-manipulation"
          style={{ width: '72px', height: '72px' }}
          onTouchEnd={handleToggle}
          onClick={handleToggle}
        >
          {isPlaying ? (
            <Pause className="w-9 h-9" />
          ) : (
            <Play className="w-9 h-9 ml-1" />
          )}
        </div>

        {/* Next button */}
        <div
          className="h-14 w-14 flex items-center justify-center rounded-full text-white/80 active:text-white active:bg-white/20 active:scale-90 transition-all cursor-pointer touch-manipulation"
          onTouchEnd={handleNext}
          onClick={handleNext}
        >
          <SkipForward className="w-7 h-7" />
        </div>
      </div>
    </div>
  );
};

export default AlwaysOnDisplay;
