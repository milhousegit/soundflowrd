import React, { useState, useEffect } from 'react';
import { RotateCcw, Smartphone } from 'lucide-react';
import { isIOS, isPWA, supportsOrientationLock } from '@/hooks/useIOSAudioSession';

/**
 * Fallback overlay that blocks app usage in landscape when orientation lock fails.
 * Only shows on mobile/tablet devices.
 */
const LandscapeBlocker: React.FC = () => {
  const [isLandscape, setIsLandscape] = useState(false);
  const [shouldShow, setShouldShow] = useState(false);

  useEffect(() => {
    // Only show on touch devices (mobile/tablet)
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (!isTouchDevice) return;

    const checkOrientation = () => {
      const isLandscapeNow = window.innerWidth > window.innerHeight;
      setIsLandscape(isLandscapeNow);
      
      // Only show if:
      // 1. We're in landscape
      // 2. Orientation lock is not supported OR we're on iOS PWA (where lock often fails)
      const showBlocker = isLandscapeNow && (!supportsOrientationLock() || (isIOS() && isPWA()));
      setShouldShow(showBlocker);
    };

    checkOrientation();

    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);

    // Also try to lock orientation on iOS when we detect landscape
    const tryLock = () => {
      if (supportsOrientationLock()) {
        const orientation = screen.orientation as any;
        orientation.lock('portrait').catch(() => {});
      }
    };

    if (isLandscape) {
      tryLock();
    }

    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, [isLandscape]);

  if (!shouldShow) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-background flex flex-col items-center justify-center p-8">
      <div className="text-center space-y-6">
        <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center mx-auto">
          <div className="relative">
            <Smartphone className="w-12 h-12 text-primary rotate-90" />
            <RotateCcw className="w-6 h-6 text-primary absolute -right-2 -bottom-2 animate-spin" style={{ animationDuration: '3s' }} />
          </div>
        </div>
        
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-foreground">Ruota il dispositivo</h2>
          <p className="text-muted-foreground max-w-xs mx-auto">
            Questa app funziona solo in modalità verticale (portrait)
          </p>
        </div>
      </div>
    </div>
  );
};

export default LandscapeBlocker;
