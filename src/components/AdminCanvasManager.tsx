import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Video, CheckCircle, XCircle, Play } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';

interface TrackToProcess {
  deezer_id: string;
  title: string;
  artist: string;
}

interface AdminCanvasManagerProps {
  language: string;
}

const AdminCanvasManager: React.FC<AdminCanvasManagerProps> = ({ language }) => {
  const { toast } = useToast();
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, found: 0, errors: 0 });
  const [log, setLog] = useState<string[]>([]);

  const addLog = (msg: string) => {
    setLog(prev => [...prev.slice(-50), msg]);
  };

  const collectAllTracks = async (): Promise<TrackToProcess[]> => {
    const trackMap = new Map<string, TrackToProcess>();

    // 1. Favorites (tracks from all users)
    addLog('Raccolta brani dai preferiti...');
    const { data: favs } = await supabase
      .from('favorites')
      .select('item_id, item_title, item_artist')
      .eq('item_type', 'track');
    
    if (favs) {
      for (const f of favs) {
        if (f.item_id && f.item_title && f.item_artist) {
          trackMap.set(f.item_id, { deezer_id: f.item_id, title: f.item_title, artist: f.item_artist });
        }
      }
    }

    // 2. Playlist tracks
    addLog('Raccolta brani dalle playlist...');
    const { data: ptracks } = await supabase
      .from('playlist_tracks')
      .select('track_id, track_title, track_artist');
    
    if (ptracks) {
      for (const t of ptracks) {
        if (t.track_id && t.track_title && t.track_artist) {
          trackMap.set(t.track_id, { deezer_id: t.track_id, title: t.track_title, artist: t.track_artist });
        }
      }
    }

    // 3. Recently played
    addLog('Raccolta brani riprodotti di recente...');
    const { data: recent } = await supabase
      .from('recently_played')
      .select('track_id, track_title, track_artist');
    
    if (recent) {
      for (const r of recent) {
        if (r.track_id && r.track_title && r.track_artist) {
          trackMap.set(r.track_id, { deezer_id: r.track_id, title: r.track_title, artist: r.track_artist });
        }
      }
    }

    // 4. User track stats
    addLog('Raccolta brani dalle statistiche...');
    const { data: stats } = await supabase
      .from('user_track_stats')
      .select('track_id, track_title, track_artist');
    
    if (stats) {
      for (const s of stats) {
        if (s.track_id && s.track_title && s.track_artist) {
          trackMap.set(s.track_id, { deezer_id: s.track_id, title: s.track_title, artist: s.track_artist });
        }
      }
    }

    return Array.from(trackMap.values());
  };

  const filterAlreadyProcessed = async (tracks: TrackToProcess[]): Promise<TrackToProcess[]> => {
    // Get all existing canvas track IDs
    const { data: existing } = await supabase
      .from('track_canvases')
      .select('track_id');
    
    const existingIds = new Set(existing?.map(e => e.track_id) || []);
    return tracks.filter(t => !existingIds.has(t.deezer_id));
  };

  const startBulkProcess = async () => {
    setIsRunning(true);
    setLog([]);
    setProgress({ current: 0, total: 0, found: 0, errors: 0 });

    try {
      // Collect all tracks
      const allTracks = await collectAllTracks();
      addLog(`Trovati ${allTracks.length} brani totali unici`);

      // Filter already processed
      const toProcess = await filterAlreadyProcessed(allTracks);
      addLog(`${toProcess.length} brani da processare (${allTracks.length - toProcess.length} già hanno canvas)`);

      if (toProcess.length === 0) {
        addLog('✅ Tutti i brani sono già stati processati!');
        setIsRunning(false);
        return;
      }

      setProgress(p => ({ ...p, total: toProcess.length }));

      // Process in batches of 20
      const BATCH_SIZE = 20;
      let totalFound = 0;
      let totalErrors = 0;

      for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
        const batch = toProcess.slice(i, i + BATCH_SIZE);
        addLog(`Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(toProcess.length / BATCH_SIZE)} (${batch.length} brani)...`);

        try {
          const { data, error } = await supabase.functions.invoke('spotify-canvas', {
            body: { tracks: batch },
          });

          if (error) {
            addLog(`❌ Errore batch: ${error.message}`);
            totalErrors += batch.length;
          } else if (data) {
            const found = data.found || 0;
            totalFound += found;
            addLog(`✅ Trovati ${found}/${batch.length} canvas`);

            if (data.results) {
              for (const r of data.results) {
                addLog(`  🎬 ${batch.find(t => t.deezer_id === r.deezer_id)?.title || r.deezer_id}`);
              }
            }
          }
        } catch (err) {
          addLog(`❌ Errore: ${err instanceof Error ? err.message : 'Sconosciuto'}`);
          totalErrors += batch.length;
        }

        setProgress(p => ({
          ...p,
          current: Math.min(i + BATCH_SIZE, toProcess.length),
          found: totalFound,
          errors: totalErrors,
        }));

        // Delay between batches to avoid rate limiting
        if (i + BATCH_SIZE < toProcess.length) {
          await new Promise(r => setTimeout(r, 2000));
        }
      }

      addLog(`\n🏁 Completato! ${totalFound} canvas trovati su ${toProcess.length} brani`);
      toast({
        title: 'Canvas Fetch Completato',
        description: `${totalFound} canvas trovati su ${toProcess.length} brani`,
      });
    } catch (error) {
      addLog(`❌ Errore fatale: ${error instanceof Error ? error.message : 'Sconosciuto'}`);
      toast({
        title: 'Errore',
        description: 'Errore durante il fetch dei canvas',
        variant: 'destructive',
      });
    } finally {
      setIsRunning(false);
    }
  };

  const progressPercent = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {language === 'it'
          ? 'Cerca automaticamente i video Canvas di Spotify per tutti i brani salvati, playlist e classifiche.'
          : 'Automatically search Spotify Canvas videos for all saved tracks, playlists and charts.'}
      </p>

      <Button
        onClick={startBulkProcess}
        disabled={isRunning}
        size="sm"
        className="w-full gap-2"
      >
        {isRunning ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            {language === 'it' ? 'In corso...' : 'Processing...'}
          </>
        ) : (
          <>
            <Video className="w-4 h-4" />
            {language === 'it' ? 'Avvia Fetch Canvas' : 'Start Canvas Fetch'}
          </>
        )}
      </Button>

      {progress.total > 0 && (
        <div className="space-y-2">
          <Progress value={progressPercent} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{progress.current}/{progress.total}</span>
            <div className="flex gap-3">
              <span className="flex items-center gap-1">
                <CheckCircle className="w-3 h-3 text-green-500" /> {progress.found}
              </span>
              {progress.errors > 0 && (
                <span className="flex items-center gap-1">
                  <XCircle className="w-3 h-3 text-destructive" /> {progress.errors}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {log.length > 0 && (
        <div className="max-h-48 overflow-y-auto rounded-lg bg-muted/50 p-3 text-xs font-mono space-y-0.5">
          {log.map((line, i) => (
            <div key={i} className="text-muted-foreground">{line}</div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminCanvasManager;
