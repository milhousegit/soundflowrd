import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, Navigate, useSearchParams } from 'react-router-dom';
import { useIsMobile } from '@/hooks/use-mobile';
import { supabase } from '@/integrations/supabase/client';
import { usePlayer } from '@/contexts/PlayerContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useTVConnection } from '@/contexts/TVConnectionContext';
import { Track } from '@/types/music';
import { QRCodeSVG } from 'qrcode.react';
import { Tv, Smartphone, Wifi, WifiOff, Music2, Loader2, Pause, ScanLine, X, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getTidalStream, mapQualityToTidal } from '@/lib/tidal';
import { getMonochromeStream } from '@/lib/monochrome';

// Generate a short room code
const generateRoomCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
};

interface SyncedLine {
  time: number;
  text: string;
}

function parseSyncedLyrics(syncedLyrics: string): SyncedLine[] {
  const lines: SyncedLine[] = [];
  const regex = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/g;
  let match;
  while ((match = regex.exec(syncedLyrics)) !== null) {
    const minutes = parseInt(match[1], 10);
    const seconds = parseInt(match[2], 10);
    const milliseconds = parseInt(match[3].padEnd(3, '0'), 10);
    const time = minutes * 60 + seconds + milliseconds / 1000;
    const text = match[4].trim();
    if (text) lines.push({ time, text });
  }
  return lines.sort((a, b) => a.time - b.time);
}

// ─── TV DISPLAY (Desktop/TV) ───
const TVDisplay: React.FC = () => {
  const { settings, selectedScrapingSource } = useSettings();
  const isItalian = settings.language === 'it';
  const [roomCode] = useState(() => generateRoomCode());
  const [connected, setConnected] = useState(false);
  const [remoteTrack, setRemoteTrack] = useState<Track | null>(null);
  const [remoteIsPlaying, setRemoteIsPlaying] = useState(false);
  const [remoteProgress, setRemoteProgress] = useState(0);
  const [lyrics, setLyrics] = useState<string | null>(null);
  const [syncedLines, setSyncedLines] = useState<SyncedLine[]>([]);
  const [currentLineIndex, setCurrentLineIndex] = useState(-1);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [tvMuted, setTvMuted] = useState(true);
  const tvMutedRef = useRef(true);
  const audioUnlockedRef = useRef(false);
  const lineRefs = useRef<(HTMLParagraphElement | null)[]>([]);
  const lastTrackIdRef = useRef<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const tvAudioRef = useRef<HTMLAudioElement | null>(null);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [streamLoading, setStreamLoading] = useState(false);
  const fetchingTrackIdRef = useRef<string | null>(null);
  const remoteCurrentTimeRef = useRef<number>(0);
  const playbackStartedAtRef = useRef<number>(0);

  const tvUrl = `${window.location.origin}/tv?room=${roomCode}`;

  // Fetch stream URL independently when track changes
  const fetchStreamForTrack = useCallback(async (track: Track) => {
    if (fetchingTrackIdRef.current === track.id) return;
    fetchingTrackIdRef.current = track.id;
    setStreamLoading(true);

    const audio = tvAudioRef.current;
    if (!audio) { setStreamLoading(false); return; }

    // Stop current playback
    audio.pause();
    audio.src = '';

    const tidalQuality = mapQualityToTidal(settings.audioQuality);
    const streamFn = selectedScrapingSource === 'monochrome' ? getMonochromeStream : getTidalStream;

    console.log(`[TV-Audio] Fetching stream for "${track.title}" by ${track.artist} via ${selectedScrapingSource}`);

    try {
      const result = await streamFn(track.title, track.artist, tidalQuality);

      // Check if we're still on the same track
      if (fetchingTrackIdRef.current !== track.id) return;

      if ('streamUrl' in result && result.streamUrl) {
        console.log('[TV-Audio] Got stream URL, loading...');
        audio.src = result.streamUrl;
        audio.load();

        // Auto-play if audio is unlocked
        if (audioUnlockedRef.current) {
          audio.muted = tvMutedRef.current;
          audio.play().then(() => {
            playbackStartedAtRef.current = Date.now();
          }).catch(() => {});
        }
      } else {
        const errorMsg = 'error' in result ? result.error : 'No stream found';
        console.warn('[TV-Audio] Stream fetch failed:', errorMsg);
      }
    } catch (err) {
      console.error('[TV-Audio] Fetch error:', err);
    } finally {
      setStreamLoading(false);
    }
  }, [settings.audioQuality, selectedScrapingSource]);

  // Subscribe to broadcast channel
  useEffect(() => {
    const channel = supabase.channel(`tv-room-${roomCode}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on('broadcast', { event: 'player-state' }, (payload) => {
        const data = payload.payload;
        if (data.track) setRemoteTrack(data.track);
        if (typeof data.isPlaying === 'boolean') setRemoteIsPlaying(data.isPlaying);
        if (typeof data.progress === 'number') {
          setRemoteProgress(data.progress);
          remoteCurrentTimeRef.current = data.progress;
        }

        const audio = tvAudioRef.current;
        if (!audio || !audio.src) return;

        // Sync currentTime from phone's progress (skip first 5s after playback starts)
        if (typeof data.progress === 'number') {
          const elapsed = Date.now() - playbackStartedAtRef.current;
          if (elapsed > 5000) {
            const diff = Math.abs(audio.currentTime - data.progress);
            if (diff > 3) audio.currentTime = data.progress;
          }
        }

        // Sync play/pause if audio is unlocked
        if (audioUnlockedRef.current) {
          if (data.isPlaying && audio.paused) {
            audio.play().catch(() => {});
          } else if (!data.isPlaying && !audio.paused) {
            audio.pause();
          }
        }

        setConnected(true);
      })
      .on('broadcast', { event: 'phone-connected' }, () => {
        console.log('[TV] Received phone-connected, sending tv-ack');
        setConnected(true);
        channel.send({ type: 'broadcast', event: 'tv-ack', payload: {} });
      })
      .subscribe((status) => {
        console.log('[TV] Channel status:', status);
      });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomCode]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (tvAudioRef.current) {
        tvAudioRef.current.pause();
        tvAudioRef.current.src = '';
      }
    };
  }, []);

  // Fetch lyrics AND stream when track changes
  useEffect(() => {
    if (!remoteTrack || remoteTrack.id === lastTrackIdRef.current) return;
    lastTrackIdRef.current = remoteTrack.id;

    // Fetch stream independently
    fetchStreamForTrack(remoteTrack);

    // Fetch lyrics
    const fetchLyrics = async () => {
      setLyricsLoading(true);
      setLyrics(null);
      setSyncedLines([]);
      setCurrentLineIndex(-1);
      try {
        const response = await supabase.functions.invoke('genius-lyrics', {
          body: { artist: remoteTrack.artist, title: remoteTrack.title },
        });
        const data = response.data;
        if (data?.lyrics) {
          setLyrics(data.lyrics);
          if (data.syncedLyrics) {
            const parsed = parseSyncedLyrics(data.syncedLyrics);
            setSyncedLines(parsed);
            lineRefs.current = new Array(parsed.length).fill(null);
          }
        }
      } catch {
        // silently fail
      } finally {
        setLyricsLoading(false);
      }
    };
    fetchLyrics();
  }, [remoteTrack, fetchStreamForTrack]);

  // Update current line based on progress
  useEffect(() => {
    if (syncedLines.length === 0) return;
    let newIndex = -1;
    for (let i = syncedLines.length - 1; i >= 0; i--) {
      if (remoteProgress >= syncedLines[i].time) {
        newIndex = i;
        break;
      }
    }
    if (newIndex !== currentLineIndex) {
      setCurrentLineIndex(newIndex);
      if (newIndex >= 0 && lineRefs.current[newIndex]) {
        lineRefs.current[newIndex]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [remoteProgress, syncedLines, currentLineIndex]);

  if (!connected) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-8 p-8">
        <div className="flex items-center gap-3 mb-4">
          <Tv className="w-10 h-10 text-primary" />
          <h1 className="text-3xl font-bold text-white">SoundFlow TV</h1>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-2xl">
          <QRCodeSVG value={tvUrl} size={240} level="M" />
        </div>
        <div className="text-center space-y-3 max-w-md">
          <p className="text-white/80 text-lg">
            {isItalian
              ? 'Scansiona il QR code con il tuo telefono per collegare la riproduzione'
              : 'Scan the QR code with your phone to connect playback'}
          </p>
          <div className="flex items-center justify-center gap-2 text-white/40 text-sm">
            <Smartphone className="w-4 h-4" />
            <span>{isItalian ? 'Apri SoundFlow sul telefono → TV' : 'Open SoundFlow on phone → TV'}</span>
          </div>
          <div className="bg-white/10 rounded-lg px-4 py-2 mt-4">
            <p className="text-white/50 text-xs mb-1">{isItalian ? 'Codice stanza' : 'Room code'}</p>
            <p className="text-white text-2xl font-mono tracking-[0.3em]">{roomCode}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-white/30 animate-pulse">
          <WifiOff className="w-4 h-4" />
          <span className="text-sm">{isItalian ? 'In attesa di connessione...' : 'Waiting for connection...'}</span>
        </div>
      </div>
    );
  }

  // Connected - show lyrics and track info
  return (
    <div className="min-h-screen bg-black flex flex-col relative overflow-hidden">
      {remoteTrack?.coverUrl && (
        <div className="absolute inset-0 z-0">
          <img src={remoteTrack.coverUrl} alt="" className="w-full h-full object-cover blur-3xl scale-110 opacity-20" />
          <div className="absolute inset-0 bg-black/60" />
        </div>
      )}
      <div className="absolute top-6 right-6 z-10 flex items-center gap-2 text-green-400/70">
        <Wifi className="w-4 h-4" />
        <span className="text-xs">{isItalian ? 'Connesso' : 'Connected'}</span>
      </div>
      {/* Hidden audio element in DOM - required for browser autoplay policy */}
      <audio ref={tvAudioRef} muted crossOrigin="anonymous" />
      {/* Mute/Unmute toggle - bottom right */}
      {connected && (
        <div className="absolute bottom-28 right-6 z-50">
          <Button
            size="icon"
            variant="secondary"
            className="w-12 h-12 rounded-full shadow-2xl"
            onClick={() => {
              const audio = tvAudioRef.current;
              if (!audio) return;
              if (!audioUnlockedRef.current) {
                // First click: unlock audio with user gesture
                audio.muted = false;
                audio.play().then(() => {
                  audioUnlockedRef.current = true;
                  tvMutedRef.current = false;
                  setAudioUnlocked(true);
                  setTvMuted(false);
                }).catch(() => {
                  // Even if play fails (no src yet), mark as unlocked
                  audioUnlockedRef.current = true;
                  audio.muted = false;
                  tvMutedRef.current = false;
                  setAudioUnlocked(true);
                  setTvMuted(false);
                });
              } else {
                // Subsequent clicks: toggle mute
                const newMuted = !tvMutedRef.current;
                audio.muted = newMuted;
                tvMutedRef.current = newMuted;
                setTvMuted(newMuted);
                if (!newMuted && audio.paused) {
                  audio.play().catch(() => {});
                }
              }
            }}
          >
            {streamLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : tvMuted ? (
              <VolumeX className="w-5 h-5" />
            ) : (
              <Volume2 className="w-5 h-5" />
            )}
          </Button>
        </div>
      )}
      <div className="flex-1 flex items-center justify-center z-10 px-16 py-32">
        {lyricsLoading ? (
          <Loader2 className="w-10 h-10 text-white/40 animate-spin" />
        ) : syncedLines.length > 0 ? (
          <ScrollArea className="h-[70vh] w-full max-w-5xl">
            <div className="space-y-5 py-16 px-8">
              {syncedLines.map((line, index) => (
                <p
                  key={index}
                  ref={(el) => (lineRefs.current[index] = el)}
                  className={cn(
                    "text-center transition-all duration-500 px-4",
                    index === currentLineIndex
                      ? "text-white text-2xl md:text-3xl lg:text-4xl font-bold scale-105"
                      : index < currentLineIndex
                      ? "text-white/25 text-lg md:text-xl lg:text-2xl"
                      : "text-white/40 text-lg md:text-xl lg:text-2xl"
                  )}
                >
                  {line.text}
                </p>
              ))}
            </div>
          </ScrollArea>
        ) : lyrics ? (
          <ScrollArea className="h-[60vh] w-full max-w-3xl">
            <pre className="whitespace-pre-wrap font-sans text-2xl leading-relaxed text-white/70 text-center">
              {lyrics}
            </pre>
          </ScrollArea>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <Music2 className="w-16 h-16 text-white/20" />
            <p className="text-white/30 text-xl">
              {remoteTrack
                ? isItalian ? 'Nessun testo trovato' : 'No lyrics found'
                : isItalian ? 'In attesa della riproduzione...' : 'Waiting for playback...'}
            </p>
          </div>
        )}
      </div>
      {remoteTrack && (
        <div className="absolute bottom-0 left-0 right-0 z-10 p-6 bg-gradient-to-t from-black/90 to-transparent">
          <div className="flex items-center gap-4">
            {remoteTrack.coverUrl ? (
              <img src={remoteTrack.coverUrl} alt={remoteTrack.album} className="w-16 h-16 md:w-20 md:h-20 rounded-lg object-cover shadow-lg" />
            ) : (
              <div className="w-16 h-16 md:w-20 md:h-20 rounded-lg bg-white/10 flex items-center justify-center">
                <Music2 className="w-8 h-8 text-white/30" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h2 className="text-white text-xl md:text-2xl font-semibold truncate">{remoteTrack.title}</h2>
              <p className="text-white/60 text-base md:text-lg truncate">{remoteTrack.artist}</p>
            </div>
            <div className="flex items-center gap-2">
              {remoteIsPlaying ? (
                <div className="flex items-end gap-1 h-6">
                  {[1,2,3].map(i => (
                    <div key={i} className="w-1 bg-primary rounded-full animate-pulse" style={{ height: `${8 + i * 6}px`, animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
              ) : (
                <Pause className="w-5 h-5 text-white/40" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── MOBILE REMOTE ───
const MobileRemote: React.FC = () => {
  const { settings } = useSettings();
  const isItalian = settings.language === 'it';
  const { isConnected, connectToRoom } = useTVConnection();
  const navigate = useNavigate();
  const [scanning, setScanning] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const scannerRef = useRef<any>(null);
  const autoStarted = useRef(false);

  // Check URL for room param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (room) {
      connectToRoom(room);
    }
  }, [connectToRoom]);

  // When connected, navigate back to home
  useEffect(() => {
    if (isConnected) {
      // Stop scanner if running
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
      }
      navigate('/', { replace: true });
    }
  }, [isConnected, navigate]);

  const handleConnect = useCallback((code: string) => {
    if (scannerRef.current) {
      scannerRef.current.stop().catch(() => {});
      scannerRef.current = null;
    }
    setScanning(false);
    connectToRoom(code);
  }, [connectToRoom]);

  // QR Scanner
  const startScanner = useCallback(async () => {
    setScanning(true);
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      await new Promise(r => setTimeout(r, 300));
      const scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          let code = decodedText;
          try {
            const url = new URL(decodedText);
            const room = url.searchParams.get('room');
            if (room) code = room;
          } catch {
            // not a URL
          }
          scanner.stop().catch(() => {});
          scannerRef.current = null;
          handleConnect(code);
        },
        () => {}
      );
    } catch (err) {
      console.error('Scanner error:', err);
      setScanning(false);
    }
  }, [handleConnect]);

  // Auto-start scanner if no room param
  useEffect(() => {
    if (autoStarted.current || isConnected) return;
    const params = new URLSearchParams(window.location.search);
    if (!params.get('room')) {
      autoStarted.current = true;
      startScanner();
    }
  }, [isConnected, startScanner]);

  // Cleanup scanner on unmount
  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
      }
    };
  }, []);

  const handleManualConnect = () => {
    const code = manualCode.trim().toUpperCase();
    if (code.length >= 4) handleConnect(code);
  };

  return (
    <div className="fixed inset-0 z-[80] bg-background flex flex-col p-6 gap-5 overflow-y-auto" style={{ paddingTop: 'max(1.5rem, env(safe-area-inset-top))' }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Tv className="w-7 h-7 text-primary" />
          <h1 className="text-xl font-bold">{isItalian ? 'Collega alla TV' : 'Connect to TV'}</h1>
        </div>
        <Button variant="ghost" size="icon" onClick={() => navigate('/', { replace: true })} aria-label="Close">
          <X className="w-5 h-5" />
        </Button>
      </div>

      <div className="bg-secondary/50 rounded-xl p-4 space-y-2">
        <p className="text-sm font-medium text-foreground">
          {isItalian ? 'Come collegare:' : 'How to connect:'}
        </p>
        <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal list-inside">
          <li>{isItalian ? 'Apri il browser sulla TV o PC' : 'Open browser on your TV or PC'}</li>
          <li>{isItalian ? 'Vai su ' : 'Go to '}<span className="font-mono text-primary font-medium">soundflow.online/tv</span></li>
          <li>{isItalian ? 'Scansiona il QR code mostrato sullo schermo' : 'Scan the QR code shown on screen'}</li>
          <li>{isItalian ? 'Oppure inserisci il codice stanza qui sotto' : 'Or enter the room code below'}</li>
        </ol>
      </div>

      {scanning && (
        <div className="w-full space-y-3">
          <div id="qr-reader" className="w-full rounded-xl overflow-hidden" />
          <Button variant="outline" className="w-full" onClick={() => {
            if (scannerRef.current) { scannerRef.current.stop().catch(() => {}); scannerRef.current = null; }
            setScanning(false);
          }}>
            {isItalian ? 'Chiudi fotocamera' : 'Close camera'}
          </Button>
        </div>
      )}

      {!scanning && (
        <Button className="w-full gap-2 h-12" onClick={startScanner}>
          <ScanLine className="w-5 h-5" />
          {isItalian ? 'Apri fotocamera' : 'Open camera'}
        </Button>
      )}

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs text-muted-foreground">{isItalian ? 'oppure inserisci il codice' : 'or enter code'}</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      <div className="space-y-3">
        <input
          type="text"
          placeholder={isItalian ? 'Codice stanza' : 'Room code'}
          value={manualCode}
          onChange={(e) => setManualCode(e.target.value.toUpperCase())}
          maxLength={6}
          className="w-full h-14 px-4 rounded-xl bg-secondary text-foreground font-mono text-2xl tracking-[0.3em] text-center border border-border focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <Button className="w-full h-12 text-base" onClick={handleManualConnect} disabled={manualCode.length < 4}>
          {isItalian ? 'Connetti' : 'Connect'}
        </Button>
      </div>
    </div>
  );
};

// ─── MAIN TV PAGE (unprotected, outside Layout) ───
const TV: React.FC = () => {
  const isMobile = useIsMobile();
  // On mobile, redirect to /remote (inside Layout) to keep player alive
  if (isMobile) {
    const search = window.location.search;
    return <Navigate to={`/remote${search}`} replace />;
  }
  return <TVDisplay />;
};

// ─── MOBILE REMOTE PAGE (protected, inside Layout) ───
export const MobileRemotePage: React.FC = () => {
  return <MobileRemote />;
};

export default TV;
