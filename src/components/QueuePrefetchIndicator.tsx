// Non-invasive indicator showing queue prefetch progress for iOS
// Appears in safe area when prefetching is active

import React from 'react';
import { Download, Check, Loader2, HardDrive } from 'lucide-react';
import { QueuePrefetchState } from '@/hooks/useQueuePrefetch';
import { useSettings } from '@/contexts/SettingsContext';

interface QueuePrefetchIndicatorProps {
  state: QueuePrefetchState;
  isVisible: boolean;
}

export const QueuePrefetchIndicator: React.FC<QueuePrefetchIndicatorProps> = ({
  state,
  isVisible,
}) => {
  const { settings } = useSettings();
  const isItalian = settings.language === 'it';
  
  if (!isVisible || state.totalTracks === 0) {
    return null;
  }
  
  const isComplete = state.bufferReadyCount >= state.totalTracks && !state.currentlyFetching;
  const progress = state.totalTracks > 0 
    ? Math.round((state.bufferReadyCount / state.totalTracks) * 100) 
    : 0;
  
  return (
    <div 
      className="fixed top-[env(safe-area-inset-top)] left-0 right-0 z-50 flex justify-center pointer-events-none animate-fade-in"
      style={{ paddingTop: 'max(8px, env(safe-area-inset-top))' }}
    >
      <div className="bg-card/95 backdrop-blur-md border border-border/50 rounded-full px-3 py-1.5 shadow-lg flex items-center gap-2 pointer-events-auto">
        {isComplete ? (
          <>
            <Check className="w-3.5 h-3.5 text-green-500" />
            <span className="text-xs font-medium text-foreground">
              {state.bufferReadyCount}/{state.totalTracks} {isItalian ? 'pronte' : 'ready'}
            </span>
            {state.swCachedCount > 0 && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                <HardDrive className="w-2.5 h-2.5" />
                {state.swCachedCount}
              </span>
            )}
          </>
        ) : state.currentlyFetching ? (
          <>
            <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
            <span className="text-xs font-medium text-foreground">
              {state.bufferReadyCount}/{state.totalTracks}
            </span>
            <div className="w-12 h-1 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </>
        ) : (
          <>
            <Download className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              {state.fetchedCount}/{state.totalTracks}
            </span>
          </>
        )}
      </div>
    </div>
  );
};

export default QueuePrefetchIndicator;
