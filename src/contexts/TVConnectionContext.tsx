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
  const { currentTrack, isPlaying, progress } = usePlayer();
  const [isConnected, setIsConnected] = useState(false);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

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
          // Phone keeps playing normally - TV has its own audio stream
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
  }, []);

  const disconnect = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    setIsConnected(false);
    setRoomCode(null);
  }, []);

  // Keep refs for current state to use in interval
  const currentTrackRef = useRef(currentTrack);
  const isPlayingRef = useRef(isPlaying);
  const progressRef = useRef(progress);
  const lastBroadcastProgressRef = useRef(progress);
  currentTrackRef.current = currentTrack;
  isPlayingRef.current = isPlaying;
  progressRef.current = progress;

  // Detect seek: if progress jumps by more than 2s between updates, it's a user seek
  const detectSeeked = useCallback((newProgress: number, oldProgress: number): boolean => {
    const diff = Math.abs(newProgress - oldProgress);
    return diff > 2;
  }, []);

  // Send player state to TV on every change (no streamUrl - TV fetches its own)
  useEffect(() => {
    if (!isConnected || !channelRef.current) return;

    const seeked = detectSeeked(progress, lastBroadcastProgressRef.current);
    lastBroadcastProgressRef.current = progress;

    channelRef.current.send({
      type: 'broadcast',
      event: 'player-state',
      payload: {
        track: currentTrack,
        isPlaying,
        progress,
        seeked,
      },
    });
  }, [isConnected, currentTrack, isPlaying, progress, detectSeeked]);

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
          seeked: false,
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
