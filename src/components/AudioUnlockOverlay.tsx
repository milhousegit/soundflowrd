import React, { useState, useEffect, useCallback } from 'react';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * This overlay appears on iOS devices when audio autoplay is blocked.
 * It prompts the user to tap once to unlock audio playback for the session.
 * After the first tap, all subsequent audio playback should work automatically.
 */
const AudioUnlockOverlay: React.FC = () => {
  const [showOverlay, setShowOverlay] = useState(false);
  const [hasUnlocked, setHasUnlocked] = useState(false);

  useEffect(() => {
    // Check if we've already unlocked audio in this session
    const unlocked = sessionStorage.getItem('audio_unlocked');
    if (unlocked) {
      setHasUnlocked(true);
      return;
    }

    // Detect iOS
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    
    // Also check for Safari on macOS which has similar restrictions
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    
    if (isIOS || isSafari) {
      // Show overlay after a short delay to give time for natural user interaction
      const timer = setTimeout(() => {
        if (!sessionStorage.getItem('audio_unlocked')) {
          setShowOverlay(true);
        }
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, []);

  const handleUnlock = useCallback(() => {
    // Create and play a silent audio to unlock the audio context
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Create a short silent buffer
    const buffer = audioContext.createBuffer(1, 1, 22050);
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    source.start(0);
    
    // Also try to resume any suspended audio contexts
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
    
    // Mark as unlocked
    sessionStorage.setItem('audio_unlocked', 'true');
    setHasUnlocked(true);
    setShowOverlay(false);
    
    console.log('Audio unlocked by user gesture');
  }, []);

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
