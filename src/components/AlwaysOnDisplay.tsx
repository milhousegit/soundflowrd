import React, { useEffect, useRef, useState, useCallback } from 'react';
import { usePlayer } from '@/contexts/PlayerContext';
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';

interface AlwaysOnDisplayProps {
  onClose: () => void;
}

const AlwaysOnDisplay: React.FC<AlwaysOnDisplayProps> = ({ onClose }) => {
  const { currentTrack, isPlaying, toggle, next, previous } = usePlayer();
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // Tap tracking state
  const [coverTaps, setCoverTaps] = useState(0);
  const [prevTaps, setPrevTaps] = useState(0);
  const [toggleTaps, setToggleTaps] = useState(0);
  const [nextTaps, setNextTaps] = useState(0);

  // Tap timing refs
  const coverLastTap = useRef(0);
  const prevLastTap = useRef(0);
  const toggleLastTap = useRef(0);
  const nextLastTap = useRef(0);

  const handleCoverTap = useCallback(() => {
    const now = Date.now();
    const timeDiff = now - coverLastTap.current;
    
    if (timeDiff < 400) {
      setCoverTaps(prev => {
        const newCount = prev + 1;
        if (newCount >= 3) {
          onClose();
          return 0;
        }
        return newCount;
      });
    } else {
      setCoverTaps(1);
    }
    coverLastTap.current = now;
    
    // Reset after timeout
    setTimeout(() => setCoverTaps(0), 500);
  }, [onClose]);

  const handlePrevTap = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const now = Date.now();
    const timeDiff = now - prevLastTap.current;
    
    if (timeDiff < 400) {
      setPrevTaps(prev => {
        const newCount = prev + 1;
        if (newCount >= 3) {
          previous();
          return 0;
        }
        return newCount;
      });
    } else {
      setPrevTaps(1);
    }
    prevLastTap.current = now;
    
    setTimeout(() => setPrevTaps(0), 500);
  }, [previous]);

  const handleToggleTap = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const now = Date.now();
    const timeDiff = now - toggleLastTap.current;
    
    if (timeDiff < 400) {
      setToggleTaps(prev => {
        const newCount = prev + 1;
        if (newCount >= 3) {
          console.log('[AlwaysOn] Triple tap detected, calling toggle()');
          toggle();
          return 0;
        }
        return newCount;
      });
    } else {
      setToggleTaps(1);
    }
    toggleLastTap.current = now;
    
    setTimeout(() => setToggleTaps(0), 500);
  }, [toggle]);

  const handleNextTap = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const now = Date.now();
    const timeDiff = now - nextLastTap.current;
    
    if (timeDiff < 400) {
      setNextTaps(prev => {
        const newCount = prev + 1;
        if (newCount >= 3) {
          next();
          return 0;
        }
        return newCount;
      });
    } else {
      setNextTaps(1);
    }
    nextLastTap.current = now;
    
    setTimeout(() => setNextTaps(0), 500);
  }, [next]);

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

  // Tap indicator dots
  const TapIndicator = ({ count }: { count: number }) => (
    <div className="flex gap-1 mt-2">
      {[0, 1, 2].map(i => (
        <div 
          key={i} 
          className={`w-1.5 h-1.5 rounded-full transition-all ${
            i < count ? 'bg-white/60 scale-110' : 'bg-white/20'
          }`}
        />
      ))}
    </div>
  );

  return (
    <div 
      className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center select-none touch-manipulation"
      style={{ 
        WebkitUserSelect: 'none',
        userSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {/* Instructions */}
      <div 
        className="absolute top-0 left-0 right-0 flex flex-col items-center text-center" 
        style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 24px)' }}
      >
        <p className="text-white/25 text-xs">Triplo tap sulla cover per chiudere</p>
        <p className="text-white/15 text-[10px] mt-1">Triplo tap sui comandi per usarli</p>
      </div>

      {/* Album cover - dimmed, tappable for triple-tap close */}
      <div className="flex flex-col items-center">
        <div 
          className={`w-56 h-56 rounded-2xl overflow-hidden transition-transform ${
            coverTaps > 0 ? 'scale-95' : ''
          }`}
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
        <TapIndicator count={coverTaps} />
      </div>

      {/* Track info - dimmed */}
      <div className="text-center mt-6 mb-8 px-8" style={{ filter: 'brightness(0.5)' }}>
        <h2 className="text-white text-lg font-semibold truncate max-w-[280px]">
          {currentTrack.title}
        </h2>
        <p className="text-white/50 text-sm truncate max-w-[280px] mt-1">
          {currentTrack.artist}
        </p>
      </div>

      {/* Controls - all require triple tap */}
      <div 
        className="flex items-start gap-6"
        style={{ filter: 'brightness(0.5)' }}
      >
        {/* Previous button */}
        <div className="flex flex-col items-center">
          <div
            className={`h-14 w-14 flex items-center justify-center rounded-full text-white/80 transition-all cursor-pointer touch-manipulation ${
              prevTaps > 0 ? 'bg-white/20 scale-90' : ''
            }`}
            onTouchEnd={handlePrevTap}
            onClick={handlePrevTap}
          >
            <SkipBack className="w-7 h-7" />
          </div>
          <TapIndicator count={prevTaps} />
        </div>

        {/* Play/Pause button */}
        <div className="flex flex-col items-center">
          <div
            className={`flex items-center justify-center rounded-full border border-white/30 text-white transition-all cursor-pointer touch-manipulation ${
              toggleTaps > 0 ? 'bg-white/20 scale-90' : ''
            }`}
            style={{ width: '72px', height: '72px' }}
            onTouchEnd={handleToggleTap}
            onClick={handleToggleTap}
          >
            {isPlaying ? (
              <Pause className="w-9 h-9" />
            ) : (
              <Play className="w-9 h-9 ml-1" />
            )}
          </div>
          <TapIndicator count={toggleTaps} />
        </div>

        {/* Next button */}
        <div className="flex flex-col items-center">
          <div
            className={`h-14 w-14 flex items-center justify-center rounded-full text-white/80 transition-all cursor-pointer touch-manipulation ${
              nextTaps > 0 ? 'bg-white/20 scale-90' : ''
            }`}
            onTouchEnd={handleNextTap}
            onClick={handleNextTap}
          >
            <SkipForward className="w-7 h-7" />
          </div>
          <TapIndicator count={nextTaps} />
        </div>
      </div>
    </div>
  );
};

export default AlwaysOnDisplay;
