import React, { useEffect, useRef } from 'react';
import { useAutoMode } from './auto/AutoModeContext';

const LandscapeBlocker: React.FC = () => {
  const { 
    isAutoMode, 
    showAutoModePrompt, 
    setShowAutoModePrompt, 
    setPendingOrientation 
  } = useAutoMode();
  
  const lastOrientationRef = useRef<'portrait' | 'landscape' | null>(null);

  useEffect(() => {
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (!isTouchDevice) return;

    const checkOrientation = () => {
      const isLandscapeNow = window.innerWidth > window.innerHeight;
      const currentOrientation = isLandscapeNow ? 'landscape' : 'portrait';
      
      // Skip if orientation hasn't changed
      if (currentOrientation === lastOrientationRef.current) return;
      
      // Skip if prompt is already showing
      if (showAutoModePrompt) return;
      
      const previousOrientation = lastOrientationRef.current;
      lastOrientationRef.current = currentOrientation;
      
      // Don't show prompt on initial load, only on actual rotation
      if (previousOrientation === null) return;
      
      // Show prompt when orientation changes
      if (isLandscapeNow && !isAutoMode) {
        setPendingOrientation('landscape');
        setShowAutoModePrompt(true);
      } else if (!isLandscapeNow && isAutoMode) {
        setPendingOrientation('portrait');
        setShowAutoModePrompt(true);
      }
    };

    // Set initial orientation without triggering prompt
    const isLandscapeNow = window.innerWidth > window.innerHeight;
    lastOrientationRef.current = isLandscapeNow ? 'landscape' : 'portrait';

    // Create named handler for orientationchange so we can remove it properly
    const handleOrientationChange = () => {
      // Delay check for orientationchange to let dimensions update
      setTimeout(checkOrientation, 100);
    };

    // Listen for orientation changes
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', handleOrientationChange);

    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', handleOrientationChange);
    };
  }, [isAutoMode, showAutoModePrompt, setShowAutoModePrompt, setPendingOrientation]);

  return null;
};

export default LandscapeBlocker;
