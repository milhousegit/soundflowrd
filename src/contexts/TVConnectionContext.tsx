import React, { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { usePlayer } from '@/contexts/PlayerContext';

interface TVConnectionContextType {
  isConnected: boolean;
  roomCode: string | null;
  connectToRoom: (code: string) => void;
  disconnect: () => void;
}

const TVConnectionContext = createContext<TVConnectionContextType | undefined>(undefined);

export const useTVConnection = () => {
  const ctx = useContext(TVConnectionContext);
  if (!ctx) throw new Error('useTVConnection must be used within TVConnectionProvider');
  return ctx;
};

export const TVConnectionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { currentTrack, isPlaying, progress, volume, setVolume } = usePlayer();
  const [isConnected, setIsConnected] = useState(false);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const savedVolumeRef = useRef<number>(0.7);
  const volumeRef = useRef(volume);
  volumeRef.current = volume;

  const connectToRoom = useCallback((code: string) => {
    // Clean up any existing channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase.channel(`tv-room-${code}`, {
      config: { broadcast: { self: false } },
    });

    let acked = false;
    let retryInterval: ReturnType<typeof setInterval> | null = null;

    channel
      .on('broadcast', { event: 'tv-ack' }, () => {
        console.log('[TV-Phone] Received TV ack');
        acked = true;
        if (retryInterval) { clearInterval(retryInterval); retryInterval = null; }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[TV-Phone] Channel SUBSCRIBED for room:', code);
          setIsConnected(true);
          setRoomCode(code);
          // Mute phone audio
          savedVolumeRef.current = volumeRef.current;
          setVolume(0);
          // Send phone-connected repeatedly until TV acks
          const sendConnect = () => {
            if (acked) return;
            channel.send({ type: 'broadcast', event: 'phone-connected', payload: {} });
            console.log('[TV-Phone] Sent phone-connected');
          };
          setTimeout(sendConnect, 300);
          retryInterval = setInterval(sendConnect, 2000);
          // Stop retrying after 30s
          setTimeout(() => { if (retryInterval) { clearInterval(retryInterval); retryInterval = null; } }, 30000);
        }
      });

    channelRef.current = channel;
  }, [setVolume]);

  const disconnect = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    setVolume(savedVolumeRef.current || 0.7);
    setIsConnected(false);
    setRoomCode(null);
  }, [setVolume]);

  // Keep refs for current state to use in interval
  const currentTrackRef = useRef(currentTrack);
  const isPlayingRef = useRef(isPlaying);
  const progressRef = useRef(progress);
  currentTrackRef.current = currentTrack;
  isPlayingRef.current = isPlaying;
  progressRef.current = progress;

  // Send player state to TV on every change (no streamUrl - TV fetches its own)
  useEffect(() => {
    if (!isConnected || !channelRef.current) return;

    channelRef.current.send({
      type: 'broadcast',
      event: 'player-state',
      payload: {
        track: currentTrack,
        isPlaying,
        progress,
      },
    });
  }, [isConnected, currentTrack, isPlaying, progress]);

  // Also send state periodically to ensure TV stays in sync
  useEffect(() => {
    if (!isConnected || !channelRef.current) return;

    const interval = setInterval(() => {
      if (!channelRef.current) return;

      channelRef.current.send({
        type: 'broadcast',
        event: 'player-state',
        payload: {
          track: currentTrackRef.current,
          isPlaying: isPlayingRef.current,
          progress: progressRef.current,
        },
      });
    }, 2000);

    return () => clearInterval(interval);
  }, [isConnected]);



  return (
    <TVConnectionContext.Provider value={{ isConnected, roomCode, connectToRoom, disconnect }}>
      {children}
    </TVConnectionContext.Provider>
  );
};
