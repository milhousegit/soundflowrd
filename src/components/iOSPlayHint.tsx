import React, { useEffect, useState } from 'react';
import { isIOS } from '@/hooks/useIOSAudioSession';
import { ChevronDown, Play } from 'lucide-react';
import { usePlayer } from '@/contexts/PlayerContext';
import { useSettings } from '@/contexts/SettingsContext';

/**
 * Shows a hint to iPhone users on first app launch when audio needs a gesture.
 * The hint points to the miniplayer with an arrow and a message to press play.
 */
const IOSPlayHint: React.FC = () => {
  const [show, setShow] = useState(false);
  const { currentTrack, isPlaying, loadingPhase } = usePlayer();
  const { settings } = useSettings();
  
  useEffect(() => {
    // Only show on iPhone
    if (!isIOS()) {
      return;
    }
    
    // Check if we've already shown this hint
    const hasShownHint = sessionStorage.getItem('ios_play_hint_shown');
    if (hasShownHint) {
      return;
    }
    
    // Show hint when there's a track but not playing (first song on app start)
    if (currentTrack && !isPlaying && loadingPhase === 'idle') {
      setShow(true);
      sessionStorage.setItem('ios_play_hint_shown', 'true');
    }
  }, [currentTrack, isPlaying, loadingPhase]);
  
  // Hide when playback actually starts
  useEffect(() => {
    if (isPlaying) {
      setShow(false);
    }
  }, [isPlaying]);
  
  // Auto-hide after 10 seconds
  useEffect(() => {
    if (show) {
      const timeout = setTimeout(() => {
        setShow(false);
      }, 10000);
      return () => clearTimeout(timeout);
    }
  }, [show]);
  
  if (!show) return null;
  
  const isItalian = settings.language === 'it';
  
  return (
    <div 
      className="fixed z-[55] pointer-events-none animate-fade-in md:hidden"
      style={{ 
        bottom: 'calc(56px + 56px + env(safe-area-inset-bottom, 0px) + 8px)', // miniplayer height + navbar height + safe area + gap
        right: '16px' // Align with the play button on the right side of miniplayer
      }}
      onClick={() => setShow(false)}
    >
      {/* Message bubble */}
      <div className="bg-primary text-primary-foreground px-4 py-3 rounded-xl shadow-lg max-w-[240px] text-center pointer-events-auto">
        <div className="flex items-center justify-center gap-2 mb-1">
          <Play className="w-4 h-4" />
          <span className="font-medium text-sm">
            {isItalian ? 'Premi play per iniziare' : 'Press play to start'}
          </span>
        </div>
        <p className="text-xs opacity-90">
          {isItalian 
            ? 'iOS richiede un tocco per avviare l\'audio' 
            : 'iOS requires a tap to start audio'}
        </p>
      </div>
      
      {/* Arrow pointing down to the play button */}
      <div className="flex flex-col items-center mt-2 animate-bounce" style={{ marginRight: '24px' }}>
        <ChevronDown className="w-6 h-6 text-primary" />
        <ChevronDown className="w-6 h-6 text-primary -mt-3" />
      </div>
    </div>
  );
};

export default IOSPlayHint;
