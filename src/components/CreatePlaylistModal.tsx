import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePlaylists } from '@/hooks/usePlaylists';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Music, Upload, Link, Plus, Image as ImageIcon } from 'lucide-react';
import { Track } from '@/types/music';

interface SpotifyTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  albumId: string;
  coverUrl: string;
  duration: number;
}

interface ImportedPlaylist {
  name: string;
  description: string;
  coverUrl: string;
  tracks: SpotifyTrack[];
}

interface CreatePlaylistModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPlaylistCreated?: (playlistId: string) => void;
}

const CreatePlaylistModal: React.FC<CreatePlaylistModalProps> = ({
  open,
  onOpenChange,
  onPlaylistCreated,
}) => {
  const { createPlaylist, addTracksToPlaylist } = usePlaylists();
  const [activeTab, setActiveTab] = useState<'manual' | 'import'>('manual');
  
  // Manual creation state
  const [manualName, setManualName] = useState('');
  const [manualCoverUrl, setManualCoverUrl] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  
  // Import state
  const [spotifyUrl, setSpotifyUrl] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importedPlaylist, setImportedPlaylist] = useState<ImportedPlaylist | null>(null);
  const [editedName, setEditedName] = useState('');
  const [editedCoverUrl, setEditedCoverUrl] = useState('');

  const resetState = () => {
    setManualName('');
    setManualCoverUrl('');
    setSpotifyUrl('');
    setImportedPlaylist(null);
    setEditedName('');
    setEditedCoverUrl('');
    setActiveTab('manual');
  };

  const handleClose = () => {
    resetState();
    onOpenChange(false);
  };

  const handleManualCreate = async () => {
    if (!manualName.trim()) {
      toast.error('Inserisci un nome per la playlist');
      return;
    }

    setIsCreating(true);
    try {
      const playlist = await createPlaylist(manualName.trim(), manualCoverUrl || undefined);
      if (playlist) {
        toast.success('Playlist creata!');
        onPlaylistCreated?.(playlist.id);
        handleClose();
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleImportFromSpotify = async () => {
    if (!spotifyUrl.trim()) {
      toast.error('Inserisci un link Spotify');
      return;
    }

    setIsImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke('spotify-import', {
        body: { url: spotifyUrl.trim() },
      });

      if (error) throw error;

      if (data.error) {
        toast.error(data.error);
        return;
      }

      setImportedPlaylist(data);
      setEditedName(data.name);
      setEditedCoverUrl(data.coverUrl || '');
      toast.success(`Trovate ${data.tracks.length} tracce!`);
    } catch (error) {
      console.error('Import error:', error);
      toast.error('Errore durante l\'importazione. Verifica il link.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!importedPlaylist || !editedName.trim()) {
      toast.error('Inserisci un nome per la playlist');
      return;
    }

    setIsCreating(true);
    try {
      const playlist = await createPlaylist(
        editedName.trim(),
        editedCoverUrl || undefined,
        importedPlaylist.description || undefined,
        spotifyUrl
      );

      if (playlist) {
        // Convert to Track format and add to playlist
        const tracks: Track[] = importedPlaylist.tracks.map(t => ({
          id: t.id,
          title: t.title,
          artist: t.artist,
          album: t.album,
          albumId: t.albumId,
          coverUrl: t.coverUrl,
          duration: t.duration,
          artistId: '',
        }));

        await addTracksToPlaylist(playlist.id, tracks);
        toast.success(`Playlist importata con ${tracks.length} tracce!`);
        onPlaylistCreated?.(playlist.id);
        handleClose();
      }
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Crea Playlist</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'manual' | 'import')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="manual" className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Nuova
            </TabsTrigger>
            <TabsTrigger value="import" className="flex items-center gap-2">
              <Upload className="w-4 h-4" />
              Importa
            </TabsTrigger>
          </TabsList>

          {/* Manual Creation */}
          <TabsContent value="manual" className="space-y-4 mt-4">
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">Nome playlist *</label>
              <Input
                placeholder="La mia playlist"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
              />
            </div>

            <div>
              <label className="text-sm text-muted-foreground mb-2 block">
                URL copertina (opzionale)
              </label>
              <div className="flex gap-2">
                <Input
                  placeholder="https://..."
                  value={manualCoverUrl}
                  onChange={(e) => setManualCoverUrl(e.target.value)}
                />
                {manualCoverUrl && (
                  <div className="w-10 h-10 rounded bg-secondary overflow-hidden flex-shrink-0">
                    <img
                      src={manualCoverUrl}
                      alt="Cover"
                      className="w-full h-full object-cover"
                      onError={(e) => (e.currentTarget.style.display = 'none')}
                    />
                  </div>
                )}
              </div>
            </div>

            <Button
              className="w-full"
              onClick={handleManualCreate}
              disabled={isCreating || !manualName.trim()}
            >
              {isCreating ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              Crea Playlist
            </Button>
          </TabsContent>

          {/* Import from Spotify */}
          <TabsContent value="import" className="space-y-4 mt-4">
            {!importedPlaylist ? (
              <>
                <div>
                  <label className="text-sm text-muted-foreground mb-2 block">
                    Link Spotify Playlist
                  </label>
                  <Input
                    placeholder="https://open.spotify.com/playlist/..."
                    value={spotifyUrl}
                    onChange={(e) => setSpotifyUrl(e.target.value)}
                  />
                </div>

                <Button
                  className="w-full"
                  onClick={handleImportFromSpotify}
                  disabled={isImporting || !spotifyUrl.trim()}
                >
                  {isImporting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Analizzando...
                    </>
                  ) : (
                    <>
                      <Link className="w-4 h-4 mr-2" />
                      Analizza Link
                    </>
                  )}
                </Button>
              </>
            ) : (
              <>
                {/* Preview imported playlist */}
                <div className="flex gap-4 items-start">
                  <div className="w-20 h-20 rounded-lg bg-secondary overflow-hidden flex-shrink-0">
                    {editedCoverUrl ? (
                      <img
                        src={editedCoverUrl}
                        alt="Cover"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Music className="w-8 h-8 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-muted-foreground">
                      {importedPlaylist.tracks.length} tracce trovate
                    </p>
                  </div>
                </div>

                <div>
                  <label className="text-sm text-muted-foreground mb-2 block">Nome playlist</label>
                  <Input
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-sm text-muted-foreground mb-2 block">
                    URL copertina
                  </label>
                  <Input
                    placeholder="https://..."
                    value={editedCoverUrl}
                    onChange={(e) => setEditedCoverUrl(e.target.value)}
                  />
                </div>

                {/* Track preview */}
                <div className="max-h-48 overflow-y-auto space-y-1 rounded-lg bg-secondary/50 p-2">
                  {importedPlaylist.tracks.slice(0, 10).map((track, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm py-1">
                      <span className="text-muted-foreground w-5 text-right">{i + 1}</span>
                      <span className="truncate flex-1">{track.title}</span>
                      <span className="text-muted-foreground truncate max-w-[100px]">
                        {track.artist}
                      </span>
                    </div>
                  ))}
                  {importedPlaylist.tracks.length > 10 && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      ...e altre {importedPlaylist.tracks.length - 10} tracce
                    </p>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setImportedPlaylist(null)}
                  >
                    Annulla
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleConfirmImport}
                    disabled={isCreating || !editedName.trim()}
                  >
                    {isCreating ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Plus className="w-4 h-4 mr-2" />
                    )}
                    Importa
                  </Button>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default CreatePlaylistModal;