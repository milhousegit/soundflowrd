import React, { useState, useEffect } from 'react';
import { useAutoMode } from './auto/AutoModeContext';
import { isIOS, isPWA, supportsOrientationLock } from '@/hooks/useIOSAudioSession';

const LandscapeBlocker: React.FC = () => {
  const { 
    isAutoMode, 
    showAutoModePrompt, 
    setShowAutoModePrompt, 
    setPendingOrientation 
  } = useAutoMode();
  
  const [lastOrientation, setLastOrientation] = useState<'portrait' | 'landscape'>('portrait');

  useEffect(() => {
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (!isTouchDevice) return;

    const checkOrientation = () => {
      const isLandscapeNow = window.innerWidth > window.innerHeight;
      const currentOrientation = isLandscapeNow ? 'landscape' : 'portrait';
      
      if (currentOrientation !== lastOrientation) {
        setLastOrientation(currentOrientation);
        
        // Show prompt when orientation changes
        if (isLandscapeNow && !isAutoMode) {
          setPendingOrientation('landscape');
          setShowAutoModePrompt(true);
        } else if (!isLandscapeNow && isAutoMode) {
          setPendingOrientation('portrait');
          setShowAutoModePrompt(true);
        }
      }
    };

    // Initial check
    const isLandscapeNow = window.innerWidth > window.innerHeight;
    setLastOrientation(isLandscapeNow ? 'landscape' : 'portrait');

    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);

    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, [lastOrientation, isAutoMode, setShowAutoModePrompt, setPendingOrientation]);

  return null;
};

export default LandscapeBlocker;
