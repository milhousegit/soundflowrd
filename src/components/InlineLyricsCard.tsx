import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Maximize2, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Track } from '@/types/music';
import { usePlayer } from '@/contexts/PlayerContext';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { cn } from '@/lib/utils';

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

interface InlineLyricsCardProps {
  track: Track;
  onTap: () => void;
}

const InlineLyricsCard: React.FC<InlineLyricsCardProps> = ({ track, onTap }) => {
  const { progress } = usePlayer();
  const { user } = useAuth();
  const { settings } = useSettings();
  const [syncedLines, setSyncedLines] = useState<SyncedLine[]>([]);
  const [plainLyrics, setPlainLyrics] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [currentLineIndex, setCurrentLineIndex] = useState(-1);
  const lastTrackIdRef = useRef<string | null>(null);

  // Fetch lyrics automatically when track changes
  useEffect(() => {
    if (!track || track.id === lastTrackIdRef.current) return;
    lastTrackIdRef.current = track.id;

    const fetchLyrics = async () => {
      setIsLoading(true);
      setSyncedLines([]);
      setPlainLyrics(null);
      setCurrentLineIndex(-1);

      try {
        // Load offset
        if (user?.id) {
          const { data } = await supabase
            .from('lyrics_offsets')
            .select('offset_seconds')
            .eq('user_id', user.id)
            .eq('track_id', track.id)
            .maybeSingle();
          if (data) setOffset(Number(data.offset_seconds));
          else setOffset(0);
        }

        const response = await supabase.functions.invoke('genius-lyrics', {
          body: { artist: track.artist, title: track.title },
        });

        const data = response.data;
        if (data?.syncedLyrics) {
          const parsed = parseSyncedLyrics(data.syncedLyrics);
          setSyncedLines(parsed);
        } else if (data?.lyrics) {
          setPlainLyrics(data.lyrics);
        }
      } catch (err) {
        console.warn('Inline lyrics fetch failed:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLyrics();
  }, [track?.id, user?.id]);

  // Update current line
  useEffect(() => {
    if (syncedLines.length === 0) return;
    const adjustedProgress = progress + offset;
    let newIndex = -1;
    for (let i = syncedLines.length - 1; i >= 0; i--) {
      if (adjustedProgress >= syncedLines[i].time) {
        newIndex = i;
        break;
      }
    }
    if (newIndex !== currentLineIndex) setCurrentLineIndex(newIndex);
  }, [progress, syncedLines, currentLineIndex, offset]);

  const hasSynced = syncedLines.length > 0;
  const hasAnyLyrics = hasSynced || !!plainLyrics;

  // Get visible lines around current
  const getVisibleLines = () => {
    if (!hasSynced) return [];
    const start = Math.max(0, currentLineIndex - 1);
    const end = Math.min(syncedLines.length - 1, currentLineIndex + 2);
    const lines: { line: SyncedLine; index: number }[] = [];
    for (let i = start; i <= end; i++) {
      lines.push({ line: syncedLines[i], index: i });
    }
    return lines;
  };

  return (
    <button
      onClick={onTap}
      className="w-full rounded-2xl border border-border bg-secondary/40 p-4 text-left md:hover:bg-secondary/60 transition-colors relative overflow-hidden min-h-[140px]"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Lyrics</span>
        <Sparkles className="w-5 h-5 text-muted-foreground" />
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-4">
          <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
          <span className="text-sm text-muted-foreground">
            {settings.language === 'it' ? 'Caricamento...' : 'Loading...'}
          </span>
        </div>
      ) : hasSynced ? (
        <div className="space-y-1">
          {getVisibleLines().map(({ line, index }) => (
            <p
              key={index}
              className={cn(
                "text-sm transition-all duration-300",
                index === currentLineIndex
                  ? "text-foreground font-semibold text-base"
                  : index < currentLineIndex
                  ? "text-muted-foreground/50"
                  : "text-muted-foreground/70"
              )}
            >
              {line.text}
            </p>
          ))}
          {currentLineIndex < 0 && syncedLines.length > 0 && (
            <p className="text-sm text-muted-foreground/70">{syncedLines[0].text}</p>
          )}
        </div>
      ) : plainLyrics ? (
        <p className="text-sm text-foreground/80 line-clamp-3">{plainLyrics.slice(0, 150)}</p>
      ) : (
        <p className="text-sm text-muted-foreground">
          {settings.language === 'it' ? 'Nessun testo trovato' : 'No lyrics found'}
        </p>
      )}
    </button>
  );
};

export default InlineLyricsCard;
