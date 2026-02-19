import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ListPlus,
  Radio,
  Download,
  Copy,
  Share2,
  Settings2,
  Loader2,
  Music,
  X,
  Plus,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Track } from '@/types/music';
import { usePlaylists } from '@/hooks/usePlaylists';
import { usePlayer } from '@/contexts/PlayerContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useToast } from '@/hooks/use-toast';
import { getTrackRadio } from '@/lib/deezer';
import { cn } from '@/lib/utils';
import CreatePlaylistModal from './CreatePlaylistModal';

interface TrackActionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  track: Track;
  onOpenDebugModal: () => void;
  onDownload?: () => void;
  isDownloading?: boolean;
  canDownload?: boolean;
  currentStreamUrl?: string;
}

const TrackActionsModal: React.FC<TrackActionsModalProps> = ({
  isOpen,
  onClose,
  track,
  onOpenDebugModal,
  onDownload,
  isDownloading,
  canDownload,
  currentStreamUrl,
}) => {
  const { playlists, addTrackToPlaylist, isLoading: playlistsLoading } = usePlaylists();
  const { playTrack } = usePlayer();
  const { settings } = useSettings();
  const { toast } = useToast();
  const isIt = settings.language === 'it';

  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false);
  const [showCreatePlaylist, setShowCreatePlaylist] = useState(false);
  const [addingToPlaylist, setAddingToPlaylist] = useState<string | null>(null);
  const [addedToPlaylist, setAddedToPlaylist] = useState<string | null>(null);
  const [isLoadingRadio, setIsLoadingRadio] = useState(false);

  // Reset internal state when modal closes
  React.useEffect(() => {
    if (!isOpen) {
      setShowPlaylistPicker(false);
      setShowCreatePlaylist(false);
      setAddedToPlaylist(null);
      setAddingToPlaylist(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAddToPlaylist = async (playlistId: string) => {
    setAddingToPlaylist(playlistId);
    const success = await addTrackToPlaylist(playlistId, track);
    setAddingToPlaylist(null);
    if (success) {
      setAddedToPlaylist(playlistId);
      setTimeout(() => {
        setAddedToPlaylist(null);
        setShowPlaylistPicker(false);
        onClose();
      }, 600);
    }
  };

  const handleRadio = async () => {
    setIsLoadingRadio(true);
    try {
      const radioTracks = await getTrackRadio(track.id);
      if (radioTracks.length > 0) {
        playTrack(radioTracks[0], radioTracks);
        toast({
          title: isIt ? 'Radio avviata' : 'Radio started',
          description: isIt
            ? `${radioTracks.length} brani simili a "${track.title}"`
            : `${radioTracks.length} tracks similar to "${track.title}"`,
        });
        onClose();
      } else {
        toast({
          title: isIt ? 'Nessun risultato' : 'No results',
          description: isIt ? 'Non sono stati trovati brani simili' : 'No similar tracks found',
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: isIt ? 'Errore' : 'Error',
        description: isIt ? 'Impossibile creare la radio' : 'Could not create radio',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingRadio(false);
    }
  };

  const handleCopyId = () => {
    navigator.clipboard.writeText(track.id);
    toast({ title: isIt ? 'ID copiato' : 'ID copied', description: track.id });
    onClose();
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/album/${track.albumId}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: `${track.title} - ${track.artist}`, url });
      } catch {}
    } else {
      navigator.clipboard.writeText(url);
      toast({ title: isIt ? 'Link copiato' : 'Link copied' });
    }
    onClose();
  };

  const handleSettings = () => {
    onClose();
    onOpenDebugModal();
  };

  const handleDownload = () => {
    onDownload?.();
    onClose();
  };

  const handleCreatePlaylistDone = (playlistId: string) => {
    setShowCreatePlaylist(false);
    // After creating, add the track to it
    handleAddToPlaylist(playlistId);
  };

  const actions = [
    {
      icon: <ListPlus className="w-5 h-5" />,
      label: isIt ? 'Aggiungi alla playlist' : 'Add to playlist',
      onClick: () => setShowPlaylistPicker(true),
    },
    {
      icon: isLoadingRadio ? <Loader2 className="w-5 h-5 animate-spin" /> : <Radio className="w-5 h-5" />,
      label: isIt ? 'Radio' : 'Radio',
      subtitle: isIt ? 'Crea una playlist con 50 brani simili' : 'Create a playlist with 50 similar tracks',
      onClick: handleRadio,
      disabled: isLoadingRadio,
    },
    ...(canDownload && currentStreamUrl
      ? [{
          icon: isDownloading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />,
          label: isIt ? 'Scarica offline' : 'Download offline',
          onClick: handleDownload,
          disabled: isDownloading,
        }]
      : []),
    {
      icon: <Copy className="w-5 h-5" />,
      label: isIt ? 'Copia ID' : 'Copy ID',
      onClick: handleCopyId,
    },
    {
      icon: <Share2 className="w-5 h-5" />,
      label: isIt ? 'Condividi link' : 'Share link',
      onClick: handleShare,
    },
    {
      icon: <Settings2 className="w-5 h-5" />,
      label: isIt ? 'Impostazioni sorgente' : 'Source settings',
      subtitle: isIt ? 'Real-Debrid, metadati, sorgenti audio' : 'Real-Debrid, metadata, audio sources',
      onClick: handleSettings,
    },
  ];

  const modalContent = (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm animate-in fade-in-0 duration-200"
        onClick={() => {
          if (showPlaylistPicker) {
            setShowPlaylistPicker(false);
          } else {
            onClose();
          }
        }}
      />

      {/* Modal */}
      <div className="fixed inset-x-0 bottom-0 z-[71] animate-in slide-in-from-bottom duration-300">
        <div className="bg-card border-t border-border rounded-t-2xl max-h-[85vh] overflow-hidden">
          {/* Handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
          </div>

          {/* Track Info Header */}
          <div className="flex items-center gap-3 px-5 pb-4">
            <div className="w-12 h-12 rounded-lg bg-secondary overflow-hidden shrink-0">
              {track.coverUrl ? (
                <img src={track.coverUrl} alt={track.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Music className="w-5 h-5 text-muted-foreground" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground truncate text-sm">{track.title}</p>
              <p className="text-xs text-muted-foreground truncate">{track.artist}</p>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div className="border-t border-border" />

          {/* Content */}
          {showPlaylistPicker ? (
            <div className="overflow-y-auto max-h-[60vh] pb-safe" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}>
              {/* Create new playlist button */}
              <button
                onClick={() => setShowCreatePlaylist(true)}
                className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-secondary/50 transition-colors active:bg-secondary"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Plus className="w-5 h-5 text-primary" />
                </div>
                <span className="font-medium text-foreground text-sm">
                  {isIt ? 'Crea nuova playlist' : 'Create new playlist'}
                </span>
              </button>

              <div className="border-t border-border mx-5" />

              {playlistsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : playlists.length === 0 ? (
                <div className="text-center py-8 px-5">
                  <p className="text-sm text-muted-foreground">
                    {isIt ? 'Nessuna playlist creata' : 'No playlists created'}
                  </p>
                </div>
              ) : (
                playlists.map((playlist) => (
                  <button
                    key={playlist.id}
                    onClick={() => handleAddToPlaylist(playlist.id)}
                    disabled={addingToPlaylist === playlist.id || addedToPlaylist === playlist.id}
                    className="w-full flex items-center gap-4 px-5 py-3 hover:bg-secondary/50 transition-colors active:bg-secondary disabled:opacity-70"
                  >
                    <div className="w-10 h-10 rounded-lg bg-secondary overflow-hidden shrink-0">
                      {playlist.cover_url ? (
                        <img src={playlist.cover_url} alt={playlist.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Music className="w-4 h-4 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-sm font-medium text-foreground truncate">{playlist.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {playlist.track_count} {isIt ? 'brani' : 'tracks'}
                      </p>
                    </div>
                    {addingToPlaylist === playlist.id && (
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />
                    )}
                    {addedToPlaylist === playlist.id && (
                      <Check className="w-4 h-4 text-green-500 shrink-0" />
                    )}
                  </button>
                ))
              )}
            </div>
          ) : (
            <div className="pb-safe" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}>
              {actions.map((action, i) => (
                <button
                  key={i}
                  onClick={action.onClick}
                  disabled={action.disabled}
                  className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-secondary/50 transition-colors active:bg-secondary disabled:opacity-50"
                >
                  <div className="w-10 h-10 rounded-lg bg-secondary/80 flex items-center justify-center shrink-0 text-foreground">
                    {action.icon}
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-medium text-foreground">{action.label}</p>
                    {action.subtitle && (
                      <p className="text-xs text-muted-foreground">{action.subtitle}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create Playlist Modal - uses portal so it overlaps */}
      <CreatePlaylistModal
        open={showCreatePlaylist}
        onOpenChange={setShowCreatePlaylist}
        onPlaylistCreated={handleCreatePlaylistDone}
      />
    </>
  );

  return createPortal(modalContent, document.body);
};

export default TrackActionsModal;
