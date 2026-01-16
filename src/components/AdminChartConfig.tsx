import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Save, Check, Music } from 'lucide-react';
import { toast } from 'sonner';

interface ChartConfig {
  id: string;
  country_code: string;
  playlist_id: string;
  playlist_title: string | null;
}

interface AdminChartConfigProps {
  language: string;
}

const COUNTRY_LABELS: Record<string, { it: string; en: string }> = {
  'IT': { it: 'Italia', en: 'Italy' },
  'US': { it: 'Stati Uniti', en: 'United States' },
  'ES': { it: 'Spagna', en: 'Spain' },
  'FR': { it: 'Francia', en: 'France' },
  'DE': { it: 'Germania', en: 'Germany' },
  'PT': { it: 'Portogallo', en: 'Portugal' },
  'GB': { it: 'Regno Unito', en: 'United Kingdom' },
  'BR': { it: 'Brasile', en: 'Brazil' },
};

const AdminChartConfig: React.FC<AdminChartConfigProps> = ({ language }) => {
  const [configs, setConfigs] = useState<ChartConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftPlaylistId, setDraftPlaylistId] = useState('');
  const [draftPlaylistTitle, setDraftPlaylistTitle] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchConfigs();
  }, []);

  const fetchConfigs = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('chart_configurations')
        .select('*')
        .order('country_code');
      
      if (error) throw error;
      setConfigs(data || []);
    } catch (error) {
      console.error('Failed to load chart configurations:', error);
      toast.error(language === 'it' ? 'Errore caricamento configurazioni' : 'Failed to load configurations');
    } finally {
      setIsLoading(false);
    }
  };

  const startEditing = (config: ChartConfig) => {
    setEditingId(config.id);
    setDraftPlaylistId(config.playlist_id);
    setDraftPlaylistTitle(config.playlist_title || '');
  };

  const cancelEditing = () => {
    setEditingId(null);
    setDraftPlaylistId('');
    setDraftPlaylistTitle('');
  };

  const saveConfig = async (config: ChartConfig) => {
    if (!draftPlaylistId.trim()) {
      toast.error(language === 'it' ? 'ID playlist richiesto' : 'Playlist ID required');
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('chart_configurations')
        .update({
          playlist_id: draftPlaylistId.trim(),
          playlist_title: draftPlaylistTitle.trim() || null,
        })
        .eq('id', config.id);

      if (error) throw error;

      // Update local state
      setConfigs(prev => prev.map(c => 
        c.id === config.id 
          ? { ...c, playlist_id: draftPlaylistId.trim(), playlist_title: draftPlaylistTitle.trim() || null }
          : c
      ));

      toast.success(language === 'it' ? 'Configurazione salvata' : 'Configuration saved');
      cancelEditing();
    } catch (error: any) {
      console.error('Failed to save configuration:', error);
      toast.error(error.message || (language === 'it' ? 'Errore salvataggio' : 'Failed to save'));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {language === 'it' 
          ? 'Configura le playlist Deezer da usare per le classifiche nazionali. Usa l\'ID della playlist Deezer (es. 1234567890).'
          : 'Configure Deezer playlists for country charts. Use Deezer playlist IDs (e.g. 1234567890).'}
      </p>
      
      <div className="space-y-2">
        {configs.map((config) => {
          const isEditing = editingId === config.id;
          const label = COUNTRY_LABELS[config.country_code]?.[language === 'it' ? 'it' : 'en'] || config.country_code;

          return (
            <div 
              key={config.id}
              className="p-3 rounded-lg bg-muted/50 border border-border"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded bg-primary/20 flex items-center justify-center">
                  <span className="text-xs font-bold text-primary">{config.country_code}</span>
                </div>
                <span className="text-sm font-medium text-foreground">{label}</span>
              </div>

              {isEditing ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      placeholder={language === 'it' ? 'ID Playlist Deezer' : 'Deezer Playlist ID'}
                      value={draftPlaylistId}
                      onChange={(e) => setDraftPlaylistId(e.target.value)}
                      className="h-8 text-sm flex-1"
                    />
                  </div>
                  <Input
                    placeholder={language === 'it' ? 'Titolo (opzionale)' : 'Title (optional)'}
                    value={draftPlaylistTitle}
                    onChange={(e) => setDraftPlaylistTitle(e.target.value)}
                    className="h-8 text-sm"
                  />
                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      className="h-7 flex-1"
                      onClick={() => saveConfig(config)}
                      disabled={isSaving}
                    >
                      {isSaving ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <>
                          <Save className="w-3.5 h-3.5 mr-1" />
                          {language === 'it' ? 'Salva' : 'Save'}
                        </>
                      )}
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="h-7"
                      onClick={cancelEditing}
                      disabled={isSaving}
                    >
                      {language === 'it' ? 'Annulla' : 'Cancel'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div 
                  className="flex items-center justify-between cursor-pointer hover:bg-muted/80 -mx-3 -mb-3 p-3 rounded-b-lg transition-colors"
                  onClick={() => startEditing(config)}
                >
                  <div className="flex items-center gap-2">
                    <Music className="w-3.5 h-3.5 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-foreground">
                        {config.playlist_title || (language === 'it' ? 'Top ' + label : label + ' Top')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        ID: {config.playlist_id}
                      </p>
                    </div>
                  </div>
                  <Check className="w-4 h-4 text-green-500" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AdminChartConfig;
