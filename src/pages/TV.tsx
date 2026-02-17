import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIsMobile } from '@/hooks/use-mobile';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePlayer } from '@/contexts/PlayerContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useTVConnection } from '@/contexts/TVConnectionContext';
import { Track } from '@/types/music';
import { QRCodeSVG } from 'qrcode.react';
import { Tv, Smartphone, Wifi, WifiOff, Music2, Loader2, Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, ScanLine, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

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
  const { settings } = useSettings();
  const isItalian = settings.language === 'it';
  const [roomCode, setRoomCode] = useState(() => generateRoomCode());
  const [connected, setConnected] = useState(false);
  const [remoteTrack, setRemoteTrack] = useState<Track | null>(null);
  const [remoteIsPlaying, setRemoteIsPlaying] = useState(false);
  const [remoteProgress, setRemoteProgress] = useState(0);
  const [lyrics, setLyrics] = useState<string | null>(null);
  const [syncedLines, setSyncedLines] = useState<SyncedLine[]>([]);
  const [currentLineIndex, setCurrentLineIndex] = useState(-1);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const lineRefs = useRef<(HTMLParagraphElement | null)[]>([]);
  const lastTrackIdRef = useRef<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const tvAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastStreamUrlRef = useRef<string | null>(null);

  const tvUrl = `${window.location.origin}/tv?room=${roomCode}`;

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
        if (typeof data.progress === 'number') setRemoteProgress(data.progress);
        // Handle audio stream URL
        if (data.streamUrl && data.streamUrl !== lastStreamUrlRef.current) {
          lastStreamUrlRef.current = data.streamUrl;
          if (tvAudioRef.current) {
            tvAudioRef.current.src = data.streamUrl;
            if (data.isPlaying) tvAudioRef.current.play().catch(() => {});
          }
        }
        // Sync play/pause
        if (tvAudioRef.current) {
          if (data.isPlaying && tvAudioRef.current.paused) {
            tvAudioRef.current.play().catch(() => {});
          } else if (!data.isPlaying && !tvAudioRef.current.paused) {
            tvAudioRef.current.pause();
          }
        }
        setConnected(true);
      })
      .on('broadcast', { event: 'phone-connected' }, () => {
        setConnected(true);
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomCode]);

  // Initialize TV audio element
  useEffect(() => {
    const audio = new Audio();
    audio.volume = 1;
    tvAudioRef.current = audio;
    return () => {
      audio.pause();
      audio.src = '';
    };
  }, []);

  // Fetch lyrics when track changes
  useEffect(() => {
    if (!remoteTrack || remoteTrack.id === lastTrackIdRef.current) return;
    lastTrackIdRef.current = remoteTrack.id;

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
  }, [remoteTrack]);

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
      {/* Background blurred cover */}
      {remoteTrack?.coverUrl && (
        <div className="absolute inset-0 z-0">
          <img
            src={remoteTrack.coverUrl}
            alt=""
            className="w-full h-full object-cover blur-3xl scale-110 opacity-20"
          />
          <div className="absolute inset-0 bg-black/60" />
        </div>
      )}

      {/* Connected indicator */}
      <div className="absolute top-6 right-6 z-10 flex items-center gap-2 text-green-400/70">
        <Wifi className="w-4 h-4" />
        <span className="text-xs">{isItalian ? 'Connesso' : 'Connected'}</span>
      </div>

      {/* Center: Lyrics */}
      <div className="flex-1 flex items-center justify-center z-10 px-8 py-24">
        {lyricsLoading ? (
          <Loader2 className="w-10 h-10 text-white/40 animate-spin" />
        ) : syncedLines.length > 0 ? (
          <ScrollArea className="h-[60vh] w-full max-w-4xl">
            <div className="space-y-6 py-12">
              {syncedLines.map((line, index) => (
                <p
                  key={index}
                  ref={(el) => (lineRefs.current[index] = el)}
                  className={cn(
                    "text-center transition-all duration-500",
                    index === currentLineIndex
                      ? "text-white text-4xl md:text-5xl font-bold scale-105"
                      : index < currentLineIndex
                      ? "text-white/25 text-2xl md:text-3xl"
                      : "text-white/40 text-2xl md:text-3xl"
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

      {/* Bottom: Track info */}
      {remoteTrack && (
        <div className="absolute bottom-0 left-0 right-0 z-10 p-6 bg-gradient-to-t from-black/90 to-transparent">
          <div className="flex items-center gap-4">
            {remoteTrack.coverUrl ? (
              <img
                src={remoteTrack.coverUrl}
                alt={remoteTrack.album}
                className="w-16 h-16 md:w-20 md:h-20 rounded-lg object-cover shadow-lg"
              />
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
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { isConnected, connectToRoom } = useTVConnection();
  const navigate = useNavigate();
  const [scanning, setScanning] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const scannerRef = useRef<any>(null);
  const startScannerOnMount = useRef(false);

  // Check URL for room param, otherwise auto-start scanner
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (room) {
      connectToRoom(room);
    } else if (!isConnected) {
      startScannerOnMount.current = true;
    }
  }, []);

  // When connected, navigate back to home so user can browse normally
  useEffect(() => {
    if (isConnected) {
      navigate('/', { replace: true });
    }
  }, [isConnected, navigate]);

  const handleConnect = useCallback((code: string) => {
    if (scannerRef.current) scannerRef.current.stop().catch(() => {});
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
          handleConnect(code);
        },
        () => {}
      );
    } catch (err) {
      console.error('Scanner error:', err);
      setScanning(false);
    }
  }, [handleConnect]);

  // Auto-start scanner after auth is ready
  useEffect(() => {
    if (startScannerOnMount.current && isAuthenticated && !authLoading && !isConnected) {
      startScannerOnMount.current = false;
      startScanner();
    }
  }, [isAuthenticated, authLoading, isConnected, startScanner]);

  // Cleanup scanner
  useEffect(() => {
    return () => {
      if (scannerRef.current) scannerRef.current.stop().catch(() => {});
    };
  }, []);

  const handleManualConnect = () => {
    const code = manualCode.trim().toUpperCase();
    if (code.length >= 4) handleConnect(code);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 gap-4">
        <Tv className="w-12 h-12 text-muted-foreground" />
        <p className="text-muted-foreground text-center">
          {isItalian ? 'Accedi per usare il telecomando TV' : 'Log in to use TV remote'}
        </p>
        <Button onClick={() => window.location.href = '/login'}>
          {isItalian ? 'Accedi' : 'Log in'}
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col p-6 gap-5" style={{ paddingTop: 'max(1.5rem, env(safe-area-inset-top))' }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Tv className="w-7 h-7 text-primary" />
          <h1 className="text-xl font-bold">{isItalian ? 'Collega alla TV' : 'Connect to TV'}</h1>
        </div>
        <Button variant="ghost" size="icon" onClick={() => navigate('/', { replace: true })} aria-label="Close">
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* Instructions */}
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

      {/* Scanner */}
      {scanning && (
        <div className="w-full space-y-3">
          <div id="qr-reader" className="w-full rounded-xl overflow-hidden" />
          <Button variant="outline" className="w-full" onClick={() => {
            if (scannerRef.current) scannerRef.current.stop().catch(() => {});
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

// ─── MAIN TV PAGE ───
const TV: React.FC = () => {
  const isMobile = useIsMobile();

  // On desktop/TV: show QR code and lyrics display
  // On mobile: show scanner and remote control
  return isMobile ? <MobileRemote /> : <TVDisplay />;
};

export default TV;
