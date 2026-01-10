import React, { useState, useEffect, useCallback } from 'react';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useIOSAudioSession, isIOS, isSafari, isPWA } from '@/hooks/useIOSAudioSession';

/**
 * This overlay appears on iOS devices when audio autoplay is blocked.
 * It prompts the user to tap once to unlock audio playback for the session.
 * After the first tap, all subsequent audio playback should work automatically.
 */
const AudioUnlockOverlay: React.FC = () => {
  const [showOverlay, setShowOverlay] = useState(false);
  const [hasUnlocked, setHasUnlocked] = useState(false);
  const iosAudio = useIOSAudioSession();

  useEffect(() => {
    // Initialize iOS audio session on mount
    iosAudio.initialize();

    // Check if we've already unlocked audio in this session
    const unlocked = sessionStorage.getItem('audio_unlocked');
    if (unlocked) {
      setHasUnlocked(true);
      iosAudio.addLog('info', 'Audio already unlocked (session)');
      return;
    }

    // Detect iOS or Safari
    const needsUnlock = isIOS() || isSafari();
    
    iosAudio.addLog('info', 'AudioUnlockOverlay check', `iOS: ${isIOS()}, Safari: ${isSafari()}, PWA: ${isPWA()}`);
    
    if (needsUnlock) {
      // Show overlay after a short delay to give time for natural user interaction
      const timer = setTimeout(() => {
        if (!sessionStorage.getItem('audio_unlocked')) {
          setShowOverlay(true);
          iosAudio.addLog('info', 'Showing unlock overlay');
        }
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, []);

  const handleUnlock = useCallback(async () => {
    iosAudio.addLog('info', 'User tapped unlock button');
    
    // Use the robust unlock mechanism
    const success = await iosAudio.unlock();
    
    if (success) {
      setHasUnlocked(true);
      setShowOverlay(false);
      iosAudio.addLog('success', 'Unlock overlay dismissed');
    } else {
      // Even if some parts failed, mark as attempted and dismiss
      setHasUnlocked(true);
      setShowOverlay(false);
      iosAudio.addLog('warning', 'Unlock partially failed, dismissing anyway');
    }
  }, [iosAudio]);

  // Also listen for any user interaction to auto-dismiss
  useEffect(() => {
    if (!showOverlay) return;
    
    const handleAnyInteraction = () => {
      handleUnlock();
    };
    
    // These events should trigger audio unlock
    document.addEventListener('touchstart', handleAnyInteraction, { once: true });
    document.addEventListener('click', handleAnyInteraction, { once: true });
    
    return () => {
      document.removeEventListener('touchstart', handleAnyInteraction);
      document.removeEventListener('click', handleAnyInteraction);
    };
  }, [showOverlay, handleUnlock]);

  if (!showOverlay || hasUnlocked) return null;

  return (
    <div 
      className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-sm flex flex-col items-center justify-center p-8 animate-fade-in"
      onClick={handleUnlock}
    >
      <div className="text-center space-y-6">
        <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center mx-auto animate-pulse">
          <Play className="w-12 h-12 text-primary ml-1" />
        </div>
        
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-foreground">Tocca per attivare l'audio</h2>
          <p className="text-muted-foreground max-w-xs mx-auto">
            Su questo dispositivo è necessario un tocco per abilitare la riproduzione audio
          </p>
        </div>
        
        <Button 
          size="lg" 
          className="mt-4"
          onClick={handleUnlock}
        >
          <Play className="w-5 h-5 mr-2" />
          Attiva Audio
        </Button>
      </div>
    </div>
  );
};

export default AudioUnlockOverlay;
