// iOS Preload Indicator - Shows track preload status on iOS PWA
import React, { useState, useEffect } from 'react';
import { Loader2, Check, Music } from 'lucide-react';
import { isIOS, isPWA } from '@/hooks/useIOSAudioSession';

interface PreloadStatus {
  loaded: number;
  total: number;
  cached: number;
}

const IOSPreloadIndicator: React.FC = () => {
  const [preloadStatus, setPreloadStatus] = useState<PreloadStatus>({ loaded: 0, total: 0, cached: 0 });
  const [visible, setVisible] = useState(false);
  const [hideTimeout, setHideTimeout] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Only show on iOS PWA
    if (!isIOS() || !isPWA()) return;

    const handlePreloadUpdate = (e: CustomEvent<PreloadStatus>) => {
      setPreloadStatus(e.detail);
      setVisible(true);
      
      // Clear previous timeout
      if (hideTimeout) clearTimeout(hideTimeout);
      
      // Hide after 5 seconds if fully loaded
      if (e.detail.loaded >= e.detail.total && e.detail.total > 0) {
        const timeout = setTimeout(() => setVisible(false), 5000);
        setHideTimeout(timeout);
      }
    };

    window.addEventListener('ios-preload-update', handlePreloadUpdate as EventListener);
    
    return () => {
      window.removeEventListener('ios-preload-update', handlePreloadUpdate as EventListener);
      if (hideTimeout) clearTimeout(hideTimeout);
    };
  }, [hideTimeout]);

  // Don't render on non-iOS or non-PWA
  if (!isIOS() || !isPWA() || !visible || preloadStatus.total === 0) {
    return null;
  }

  const isComplete = preloadStatus.loaded >= preloadStatus.total;
  const progress = (preloadStatus.loaded / preloadStatus.total) * 100;

  return (
    <div 
      className="fixed z-50 animate-in slide-in-from-top-2 duration-300"
      style={{
        top: 'max(env(safe-area-inset-top, 0px), 8px)',
        left: '16px',
        right: '16px',
      }}
    >
      <div className="bg-card/95 backdrop-blur-lg border border-border/50 rounded-xl p-3 shadow-lg">
        <div className="flex items-center gap-3">
          {isComplete ? (
            <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
              <Check className="w-4 h-4 text-green-500" />
            </div>
          ) : (
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
              <Loader2 className="w-4 h-4 text-primary animate-spin" />
            </div>
          )}
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-foreground">
                {isComplete ? 'Tracce pronte' : 'Precaricamento...'}
              </span>
              <span className="text-xs text-muted-foreground">
                {preloadStatus.loaded}/{preloadStatus.total}
              </span>
            </div>
            
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-300 ${
                  isComplete ? 'bg-green-500' : 'bg-primary'
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
            
            {preloadStatus.cached > 0 && (
              <div className="flex items-center gap-1 mt-1">
                <Music className="w-3 h-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  {preloadStatus.cached} in cache
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default IOSPreloadIndicator;
