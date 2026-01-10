import { useEffect, useRef } from 'react';
import { usePlayer } from '@/contexts/PlayerContext';

/**
 * This component plays a silent audio loop to keep the iOS audio session alive
 * when the screen is off. Without this, iOS will pause media playback when
 * the screen locks or the app goes to background.
 */
const SilentAudioKeepAlive: React.FC = () => {
  const { isPlaying, currentTrack } = usePlayer();
  const audioContextRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const isActiveRef = useRef(false);

  useEffect(() => {
    // Only start the silent audio when we have a track and it's playing
    if (isPlaying && currentTrack && !isActiveRef.current) {
      try {
        // Create audio context if it doesn't exist
        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }

        const audioContext = audioContextRef.current;

        // Resume audio context if suspended (required after user interaction)
        if (audioContext.state === 'suspended') {
          audioContext.resume();
        }

        // Create an oscillator that generates a very low frequency (inaudible)
        oscillatorRef.current = audioContext.createOscillator();
        oscillatorRef.current.type = 'sine';
        oscillatorRef.current.frequency.setValueAtTime(1, audioContext.currentTime); // 1Hz - inaudible

        // Create a gain node and set volume to essentially zero
        gainNodeRef.current = audioContext.createGain();
        gainNodeRef.current.gain.setValueAtTime(0.001, audioContext.currentTime); // Nearly silent

        // Connect oscillator -> gain -> destination
        oscillatorRef.current.connect(gainNodeRef.current);
        gainNodeRef.current.connect(audioContext.destination);

        // Start the oscillator
        oscillatorRef.current.start();
        isActiveRef.current = true;

        console.log('Silent audio keep-alive started');
      } catch (e) {
        console.log('Failed to start silent audio keep-alive:', e);
      }
    }

    // Stop the silent audio when not playing
    if (!isPlaying && isActiveRef.current) {
      try {
        oscillatorRef.current?.stop();
        oscillatorRef.current?.disconnect();
        gainNodeRef.current?.disconnect();
        oscillatorRef.current = null;
        gainNodeRef.current = null;
        isActiveRef.current = false;
        console.log('Silent audio keep-alive stopped');
      } catch (e) {
        // Ignore errors when stopping
      }
    }

    return () => {
      // Cleanup on unmount
      try {
        oscillatorRef.current?.stop();
        oscillatorRef.current?.disconnect();
        gainNodeRef.current?.disconnect();
        audioContextRef.current?.close();
      } catch (e) {
        // Ignore cleanup errors
      }
    };
  }, [isPlaying, currentTrack]);

  // Handle page visibility changes - resume audio context when page becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // This component doesn't render anything visible
  return null;
};

export default SilentAudioKeepAlive;
