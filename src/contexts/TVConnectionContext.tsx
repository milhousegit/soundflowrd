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
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    console.log('[TV] Connecting to room:', code);

    const channel = supabase.channel(`tv-room-${code}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on('broadcast', { event: 'tv-ack' }, () => {
        console.log('[TV] Received TV ack');
      })
      .subscribe((status, err) => {
        console.log('[TV] Channel status:', status, err);
        if (status === 'SUBSCRIBED') {
          setIsConnected(true);
          setRoomCode(code);
          // Mute phone audio
          savedVolumeRef.current = volumeRef.current;
          setVolume(0);
          // Notify TV
          channel.send({ type: 'broadcast', event: 'phone-connected', payload: {} });
          console.log('[TV] Connected and sent phone-connected');
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

  // Send player state to TV continuously
  useEffect(() => {
    if (!isConnected || !channelRef.current) return;

    const audioEl = document.querySelector('audio');
    const streamUrl = audioEl?.src || null;

    channelRef.current.send({
      type: 'broadcast',
      event: 'player-state',
      payload: {
        track: currentTrack,
        isPlaying,
        progress,
        streamUrl,
      },
    });
  }, [isConnected, currentTrack, isPlaying, progress]);

  return (
    <TVConnectionContext.Provider value={{ isConnected, roomCode, connectToRoom, disconnect }}>
      {children}
    </TVConnectionContext.Provider>
  );
};
