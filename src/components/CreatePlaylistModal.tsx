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
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { usePlaylists } from '@/hooks/usePlaylists';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Music, Upload, Link, Plus, Crown, Globe, Lock } from 'lucide-react';
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
  const { profile, isAdmin, simulateFreeUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'manual' | 'import'>('manual');
  const [showPremiumModal, setShowPremiumModal] = useState(false);

  // Check if user has active premium (respect simulation mode)
  const isPremium = !simulateFreeUser && (isAdmin || (profile?.is_premium && 
    (!profile?.premium_expires_at || new Date(profile.premium_expires_at) > new Date())));
  
  // Manual creation state
  const [manualName, setManualName] = useState('');
  const [manualCoverUrl, setManualCoverUrl] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  
  // Import state
  const [spotifyUrl, setSpotifyUrl] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importedPlaylist, setImportedPlaylist] = useState<ImportedPlaylist | null>(null);
  const [editedName, setEditedName] = useState('');
  const [editedCoverUrl, setEditedCoverUrl] = useState('');
  const [importIsPublic, setImportIsPublic] = useState(false);

  const resetState = () => {
    setManualName('');
    setManualCoverUrl('');
    setIsPublic(false);
    setSpotifyUrl('');
    setImportedPlaylist(null);
    setEditedName('');
    setEditedCoverUrl('');
    setImportIsPublic(false);
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
      const playlist = await createPlaylist(
        manualName.trim(), 
        manualCoverUrl || undefined,
        undefined,
        undefined,
        undefined,
        isPublic
      );
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
        spotifyUrl,
        undefined,
        importIsPublic
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

        <Tabs value={activeTab} onValueChange={(v) => {
          if (v === 'import' && !isPremium) {
            setShowPremiumModal(true);
            return;
          }
          setActiveTab(v as 'manual' | 'import');
        }}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="manual" className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Nuova
            </TabsTrigger>
            <TabsTrigger value="import" className="flex items-center gap-2 relative">
              <Upload className="w-4 h-4" />
              Importa
              {!isPremium && (
                <span className="absolute -top-1.5 -right-1.5 px-1 py-0.5 text-[8px] font-bold bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] text-white rounded">
                  PRO
                </span>
              )}
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

            {/* Public/Private toggle */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border">
              <div className="flex items-center gap-3">
                {isPublic ? (
                  <Globe className="w-5 h-5 text-primary" />
                ) : (
                  <Lock className="w-5 h-5 text-muted-foreground" />
                )}
                <div>
                  <Label htmlFor="public-toggle" className="font-medium">
                    {isPublic ? 'Pubblica' : 'Privata'}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {isPublic 
                      ? 'Chiunque può vedere questa playlist' 
                      : 'Solo tu puoi vedere questa playlist'}
                  </p>
                </div>
              </div>
              <Switch
                id="public-toggle"
                checked={isPublic}
                onCheckedChange={setIsPublic}
              />
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

                {/* Public/Private toggle for import */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border">
                  <div className="flex items-center gap-3">
                    {importIsPublic ? (
                      <Globe className="w-5 h-5 text-primary" />
                    ) : (
                      <Lock className="w-5 h-5 text-muted-foreground" />
                    )}
                    <div>
                      <Label htmlFor="import-public-toggle" className="font-medium">
                        {importIsPublic ? 'Pubblica' : 'Privata'}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {importIsPublic 
                          ? 'Chiunque può vedere questa playlist' 
                          : 'Solo tu puoi vedere questa playlist'}
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="import-public-toggle"
                    checked={importIsPublic}
                    onCheckedChange={setImportIsPublic}
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

        {/* Premium Modal */}
        <Dialog open={showPremiumModal} onOpenChange={setShowPremiumModal}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Crown className="w-5 h-5 text-[#8B5CF6]" />
                <span className="bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] bg-clip-text text-transparent">Funzione Premium</span>
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <Upload className="w-5 h-5 text-[#8B5CF6]" />
                <div>
                  <p className="font-medium">Importa Playlist</p>
                  <p className="text-sm text-muted-foreground">
                    Importa le tue playlist da Spotify direttamente nell'app
                  </p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground text-center">
                Sblocca questa e altre funzionalità esclusive con Premium
              </p>
              <Button
                className="w-full bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] hover:opacity-90 border-0"
                onClick={() => {
                  setShowPremiumModal(false);
                  handleClose();
                  window.location.href = '/profile';
                }}
              >
                <Crown className="w-4 h-4 mr-2" />
                Sblocca Premium
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
};

export default CreatePlaylistModal;