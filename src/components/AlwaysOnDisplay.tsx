import React, { useEffect, useRef, useState } from 'react';
import { usePlayer } from '@/contexts/PlayerContext';
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';

interface AlwaysOnDisplayProps {
  onClose: () => void;
}

const AlwaysOnDisplay: React.FC<AlwaysOnDisplayProps> = ({ onClose }) => {
  const { currentTrack, isPlaying, toggle, next, previous } = usePlayer();
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // Triple tap tracking for each element
  const createTripleTapHandler = (action: () => void) => {
    let tapCount = 0;
    let lastTap = 0;

    return () => {
      const now = Date.now();
      if (now - lastTap < 400) {
        tapCount += 1;
        if (tapCount >= 3) {
          tapCount = 0;
          action();
        }
      } else {
        tapCount = 1;
      }
      lastTap = now;
    };
  };

  // Create handlers with refs to maintain state
  const coverTapRef = useRef(createTripleTapHandler(onClose));
  const prevTapRef = useRef(createTripleTapHandler(previous));
  const toggleTapRef = useRef(createTripleTapHandler(toggle));
  const nextTapRef = useRef(createTripleTapHandler(next));

  // Visual feedback for taps
  const [coverTaps, setCoverTaps] = useState(0);
  const [prevTaps, setPrevTaps] = useState(0);
  const [toggleTaps, setToggleTaps] = useState(0);
  const [nextTaps, setNextTaps] = useState(0);

  const handleCoverTap = () => {
    setCoverTaps(prev => (prev >= 2 ? 0 : prev + 1));
    coverTapRef.current();
    setTimeout(() => setCoverTaps(0), 500);
  };

  const handlePrevTap = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPrevTaps(prev => (prev >= 2 ? 0 : prev + 1));
    prevTapRef.current();
    setTimeout(() => setPrevTaps(0), 500);
  };

  const handleToggleTap = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setToggleTaps(prev => (prev >= 2 ? 0 : prev + 1));
    toggleTapRef.current();
    setTimeout(() => setToggleTaps(0), 500);
  };

  const handleNextTap = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setNextTaps(prev => (prev >= 2 ? 0 : prev + 1));
    nextTapRef.current();
    setTimeout(() => setNextTaps(0), 500);
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
