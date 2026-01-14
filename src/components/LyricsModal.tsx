import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Loader2, ExternalLink, Music2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { Track } from '@/types/music';
import { useSettings } from '@/contexts/SettingsContext';
import { usePlayer } from '@/contexts/PlayerContext';
import { cn } from '@/lib/utils';

interface LyricsModalProps {
  isOpen: boolean;
  onClose: () => void;
  track: Track | null;
}

interface LyricsData {
  lyrics: string;
  syncedLyrics: string | null;
  songInfo: {
    title: string;
    artist: string;
    url?: string;
    thumbnailUrl?: string;
  };
}

interface SyncedLine {
  time: number; // in seconds
  text: string;
}

// Parse LRC format synced lyrics
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
    
    if (text) {
      lines.push({ time, text });
    }
  }

  return lines.sort((a, b) => a.time - b.time);
}

const LyricsModal: React.FC<LyricsModalProps> = ({ isOpen, onClose, track }) => {
  const { settings } = useSettings();
  const { progress } = usePlayer();
  const [lyrics, setLyrics] = useState<string | null>(null);
  const [syncedLines, setSyncedLines] = useState<SyncedLine[]>([]);
  const [songInfo, setSongInfo] = useState<LyricsData['songInfo'] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentLineIndex, setCurrentLineIndex] = useState(-1);
  const lyricsContainerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLParagraphElement | null)[]>([]);

  const fetchLyrics = useCallback(async () => {
    if (!track) return;
    
    setIsLoading(true);
    setError(null);
    setLyrics(null);
    setSyncedLines([]);
    setSongInfo(null);
    setCurrentLineIndex(-1);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('genius-lyrics', {
        body: { artist: track.artist, title: track.title },
      });

      if (fnError) {
        throw new Error(fnError.message);
      }

      if (data.error && !data.lyrics) {
        setError(data.error);
      } else if (data.lyrics) {
        setLyrics(data.lyrics);
        setSongInfo(data.songInfo);
        
        // Parse synced lyrics if available
        if (data.syncedLyrics) {
          const parsed = parseSyncedLyrics(data.syncedLyrics);
          setSyncedLines(parsed);
          lineRefs.current = new Array(parsed.length).fill(null);
        }
      }
    } catch (err) {
      console.error('Error fetching lyrics:', err);
      setError(settings.language === 'it' ? 'Impossibile recuperare il testo' : 'Could not fetch lyrics');
    } finally {
      setIsLoading(false);
    }
  }, [track, settings.language]);

  useEffect(() => {
    if (isOpen && track) {
      fetchLyrics();
    }
  }, [isOpen, track?.id, fetchLyrics]);

  // Update current line based on playback progress
  useEffect(() => {
    if (syncedLines.length === 0) return;

    let newIndex = -1;
    for (let i = syncedLines.length - 1; i >= 0; i--) {
      if (progress >= syncedLines[i].time) {
        newIndex = i;
        break;
      }
    }

    if (newIndex !== currentLineIndex) {
      setCurrentLineIndex(newIndex);
      
      // Auto-scroll to current line
      if (newIndex >= 0 && lineRefs.current[newIndex]) {
        lineRefs.current[newIndex]?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }
    }
  }, [progress, syncedLines, currentLineIndex]);

  if (!isOpen) return null;

  const hasSyncedLyrics = syncedLines.length > 0;

  return (
    <div className="fixed inset-0 z-[70] bg-background/95 backdrop-blur-sm flex flex-col animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center overflow-hidden flex-shrink-0">
            {track?.coverUrl ? (
              <img src={track.coverUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <Music2 className="w-5 h-5 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-foreground truncate">{track?.title || 'Lyrics'}</h3>
            <p className="text-sm text-muted-foreground truncate">{track?.artist}</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1 px-6 py-4">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-muted-foreground">
              {settings.language === 'it' ? 'Caricamento testo...' : 'Loading lyrics...'}
            </p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-center px-4">
            <AlertCircle className="w-12 h-12 text-muted-foreground" />
            <p className="text-muted-foreground">{error}</p>
            <Button variant="outline" onClick={fetchLyrics} className="mt-2">
              {settings.language === 'it' ? 'Riprova' : 'Retry'}
            </Button>
          </div>
        ) : lyrics ? (
          <div ref={lyricsContainerRef} className="max-w-2xl mx-auto">
            {hasSyncedLyrics ? (
              // Karaoke-style synced lyrics
              <div className="space-y-4 py-8">
                {syncedLines.map((line, index) => (
                  <p
                    key={index}
                    ref={(el) => (lineRefs.current[index] = el)}
                    className={cn(
                      "text-lg md:text-xl text-center transition-all duration-300",
                      index === currentLineIndex
                        ? "text-primary font-semibold scale-105"
                        : index < currentLineIndex
                        ? "text-muted-foreground/60"
                        : "text-foreground/70"
                    )}
                  >
                    {line.text}
                  </p>
                ))}
              </div>
            ) : (
              // Plain lyrics
              <pre className="whitespace-pre-wrap font-sans text-base leading-relaxed text-foreground/90">
                {lyrics}
              </pre>
            )}
            {songInfo?.url && (
              <div className="mt-8 pt-4 border-t border-border">
                <a
                  href={songInfo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  {settings.language === 'it' ? 'Visualizza su Genius' : 'View on Genius'}
                </a>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-center px-4">
            <Music2 className="w-12 h-12 text-muted-foreground" />
            <p className="text-muted-foreground">
              {settings.language === 'it' ? 'Nessun testo trovato' : 'No lyrics found'}
            </p>
          </div>
        )}
      </ScrollArea>

      {/* Footer attribution */}
      <div className="p-4 border-t border-border text-center">
        <span className="text-xs text-muted-foreground">
          {settings.language === 'it' ? 'Testi forniti da' : 'Lyrics provided by'}{' '}
          <a
            href="https://lrclib.net"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            LRCLIB
          </a>
          {' & '}
          <a
            href="https://genius.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Genius
          </a>
        </span>
      </div>
    </div>
  );
};

export default LyricsModal;
