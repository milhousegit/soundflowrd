import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Video, CheckCircle, XCircle, Search, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Textarea } from '@/components/ui/textarea';

interface AdminCanvasManagerProps {
  language: string;
}

const AdminCanvasManager: React.FC<AdminCanvasManagerProps> = ({ language }) => {
  const { toast } = useToast();
  const [trackSearch, setTrackSearch] = useState('');
  const [canvasUrl, setCanvasUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [bulkInput, setBulkInput] = useState('');
  const [isBulkSaving, setIsBulkSaving] = useState(false);
  const [stats, setStats] = useState<{ total: number } | null>(null);

  // Load stats
  React.useEffect(() => {
    supabase.from('track_canvases').select('id', { count: 'exact', head: true }).then(({ count }) => {
      setStats({ total: count || 0 });
    });
  }, []);

  const handleSaveSingle = async () => {
    if (!trackSearch.trim() || !canvasUrl.trim()) return;
    setIsSaving(true);
    try {
      // trackSearch can be a Deezer track ID
      const trackId = trackSearch.trim();
      const { error } = await supabase
        .from('track_canvases')
        .upsert(
          { track_id: trackId, canvas_url: canvasUrl.trim(), updated_at: new Date().toISOString() },
          { onConflict: 'track_id' }
        );
      if (error) throw error;
      toast({ title: '✅ Canvas salvato', description: `Track ID: ${trackId}` });
      setTrackSearch('');
      setCanvasUrl('');
      setStats(s => s ? { total: s.total + 1 } : null);
    } catch (err) {
      toast({ title: 'Errore', description: String(err), variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleBulkImport = async () => {
    if (!bulkInput.trim()) return;
    setIsBulkSaving(true);
    try {
      // Format: one per line, "deezer_track_id|canvas_url"
      const lines = bulkInput.trim().split('\n').filter(l => l.includes('|'));
      let saved = 0;
      for (const line of lines) {
        const [trackId, url] = line.split('|').map(s => s.trim());
        if (trackId && url) {
          const { error } = await supabase
            .from('track_canvases')
            .upsert(
              { track_id: trackId, canvas_url: url, updated_at: new Date().toISOString() },
              { onConflict: 'track_id' }
            );
          if (!error) saved++;
        }
      }
      toast({ title: '✅ Import completato', description: `${saved}/${lines.length} canvas salvati` });
      setBulkInput('');
      setStats(s => s ? { total: s.total + saved } : null);
    } catch (err) {
      toast({ title: 'Errore', description: String(err), variant: 'destructive' });
    } finally {
      setIsBulkSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {stats && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Video className="w-3.5 h-3.5" />
          <span>{stats.total} canvas salvati nel database</span>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {language === 'it'
          ? 'Usa canvasdownloader.com per ottenere il video URL dal link Spotify della traccia, poi inseriscilo qui con il Deezer Track ID.'
          : 'Use canvasdownloader.com to get the video URL from the Spotify track link, then enter it here with the Deezer Track ID.'}
      </p>

      {/* Single canvas add */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-foreground">
          {language === 'it' ? 'Aggiungi singolo' : 'Add single'}
        </h4>
        <Input
          placeholder="Deezer Track ID (es. 908604)"
          value={trackSearch}
          onChange={e => setTrackSearch(e.target.value)}
          className="text-sm"
        />
        <Input
          placeholder="Canvas URL (https://canvaz.scdn.co/...mp4)"
          value={canvasUrl}
          onChange={e => setCanvasUrl(e.target.value)}
          className="text-sm"
        />
        <Button onClick={handleSaveSingle} disabled={isSaving || !trackSearch || !canvasUrl} size="sm" className="w-full gap-2">
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          {language === 'it' ? 'Salva Canvas' : 'Save Canvas'}
        </Button>
      </div>

      {/* Bulk import */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-foreground">
          {language === 'it' ? 'Import multiplo' : 'Bulk import'}
        </h4>
        <Textarea
          placeholder={"deezer_id|canvas_url\n908604|https://canvaz.scdn.co/.../video.mp4\n123456|https://canvaz.scdn.co/.../video2.mp4"}
          value={bulkInput}
          onChange={e => setBulkInput(e.target.value)}
          className="text-xs font-mono min-h-[80px]"
        />
        <Button onClick={handleBulkImport} disabled={isBulkSaving || !bulkInput.trim()} size="sm" variant="secondary" className="w-full gap-2">
          {isBulkSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
          {language === 'it' ? 'Importa Canvas' : 'Import Canvas'}
        </Button>
      </div>
    </div>
  );
};

export default AdminCanvasManager;
