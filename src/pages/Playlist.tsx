import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Play, Clock, Music, Cloud, Loader2, Trash2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import BackButton from '@/components/BackButton';
import TrackCard from '@/components/TrackCard';
import { useSettings } from '@/contexts/SettingsContext';
import { usePlayer } from '@/contexts/PlayerContext';
import { useAuth } from '@/contexts/AuthContext';
import { usePlaylists, PlaylistTrack, Playlist as PlaylistType } from '@/hooks/usePlaylists';
import { useSyncedTracks } from '@/hooks/useSyncedTracks';
import { useSyncAlbum } from '@/hooks/useSyncAlbum';
import { Track } from '@/types/music';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const PlaylistPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { playTrack } = usePlayer();
  const { t } = useSettings();
  const { credentials } = useAuth();
  const { getPlaylistTracks, deletePlaylist, updatePlaylist } = usePlaylists();
  
  const [playlist, setPlaylist] = useState<PlaylistType | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [editedCoverUrl, setEditedCoverUrl] = useState('');
  
  // Get track IDs for sync status checking
  const trackIds = useMemo(() => tracks.map(t => t.id), [tracks]);
  const { isSynced, isSyncing, isDownloading } = useSyncedTracks(trackIds);
  const { syncAlbum, isSyncingAlbum, syncProgress } = useSyncAlbum();

  // Check if all tracks are synced
  const allTracksSynced = useMemo(() => {
    if (tracks.length === 0) return false;
    return tracks.every(track => isSynced(track.id));
  }, [tracks, isSynced]);

  const handleSyncPlaylist = () => {
    if (!playlist || tracks.length === 0) return;
    syncAlbum(tracks, playlist.name, 'Playlist');
  };

  useEffect(() => {
    const fetchPlaylist = async () => {
      if (!id) return;
      setIsLoading(true);
      
      try {
        // Fetch playlist info
        const { data: playlistData, error: playlistError } = await supabase
          .from('playlists')
          .select('*')
          .eq('id', id)
          .single();

        if (playlistError) throw playlistError;
        
        setPlaylist(playlistData as PlaylistType);
        setEditedName(playlistData.name);
        setEditedCoverUrl(playlistData.cover_url || '');

        // Fetch tracks
        const playlistTracks = await getPlaylistTracks(id);
        
        // Convert to Track format
        const convertedTracks: Track[] = playlistTracks.map((pt: PlaylistTrack) => ({
          id: pt.track_id,
          title: pt.track_title,
          artist: pt.track_artist,
          album: pt.track_album || '',
          albumId: pt.track_album_id || '',
          coverUrl: pt.track_cover_url || '',
          duration: pt.track_duration,
          artistId: '',
        }));
        
        setTracks(convertedTracks);
      } catch (error) {
        console.error('Failed to fetch playlist:', error);
        toast.error('Playlist non trovata');
        navigate('/library');
      } finally {
        setIsLoading(false);
      }
    };

    fetchPlaylist();
  }, [id]);

  const handleSaveEdit = async () => {
    if (!playlist || !editedName.trim()) return;
    
    await updatePlaylist(playlist.id, {
      name: editedName.trim(),
      cover_url: editedCoverUrl || undefined,
    });
    
    setPlaylist({ ...playlist, name: editedName.trim(), cover_url: editedCoverUrl || null });
    setIsEditing(false);
    toast.success('Playlist aggiornata');
  };

  const handleDelete = async () => {
    if (!playlist) return;
    await deletePlaylist(playlist.id);
    navigate('/library');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!playlist) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Playlist non trovata</p>
      </div>
    );
  }

  const totalDuration = tracks.reduce((acc, tr) => acc + (tr.duration || 0), 0);
  const formatTotalDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours} h ${mins} min`;
    }
    return `${mins} min`;
  };

  const handlePlayAll = () => {
    if (tracks.length > 0) {
      playTrack(tracks[0], tracks);
    }
  };

  return (
    <div className="pb-32 animate-fade-in relative">
      {/* Back button mobile */}
      <div className="absolute top-4 left-4 z-10">
        <BackButton />
      </div>
      
      {/* Header */}
      <div className="relative p-4 md:p-8 pt-12 md:pt-16 flex flex-col md:flex-row items-center md:items-end gap-4 md:gap-8 bg-gradient-to-b from-primary/10 to-transparent">
        {/* Cover */}
        <div className="w-40 h-40 md:w-56 md:h-56 rounded-xl overflow-hidden bg-muted shadow-2xl flex-shrink-0">
          {playlist.cover_url ? (
            <img src={playlist.cover_url} alt={playlist.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
              <Music className="w-16 md:w-24 h-16 md:h-24 text-primary/50" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 text-center md:text-left">
          <p className="text-xs md:text-sm text-foreground/70 uppercase tracking-wider mb-1">Playlist</p>
          
          {isEditing ? (
            <div className="space-y-2 max-w-md">
              <Input
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                placeholder="Nome playlist"
                className="text-xl font-bold"
              />
              <Input
                value={editedCoverUrl}
                onChange={(e) => setEditedCoverUrl(e.target.value)}
                placeholder="URL copertina (opzionale)"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSaveEdit}>Salva</Button>
                <Button size="sm" variant="outline" onClick={() => setIsEditing(false)}>Annulla</Button>
              </div>
            </div>
          ) : (
            <>
              <h1 className="text-2xl md:text-5xl font-bold text-foreground mb-2 md:mb-4 truncate">
                {playlist.name}
              </h1>
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-1 md:gap-2 text-xs md:text-sm text-muted-foreground">
                <span>{tracks.length} {tracks.length === 1 ? 'brano' : 'brani'}</span>
                {totalDuration > 0 && (
                  <>
                    <span>•</span>
                    <span>{formatTotalDuration(totalDuration)}</span>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 md:px-8 py-4 md:py-6 flex items-center gap-3">
        <Button 
          variant="player" 
          size="player" 
          onClick={handlePlayAll}
          disabled={tracks.length === 0}
        >
          <Play className="w-5 md:w-6 h-5 md:h-6 ml-0.5" />
        </Button>
        
        {/* Edit button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsEditing(true)}
          className="w-12 h-12"
        >
          <Pencil className="w-5 h-5 text-muted-foreground" />
        </Button>

        {/* Sync playlist button */}
        {credentials?.realDebridApiKey && tracks.length > 0 && (
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSyncPlaylist}
              disabled={isSyncingAlbum || allTracksSynced}
              className="w-12 h-12"
              title={allTracksSynced ? 'Playlist sincronizzata' : 'Sincronizza Playlist'}
            >
              {isSyncingAlbum ? (
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
              ) : allTracksSynced ? (
                <Cloud className="w-6 h-6 text-green-500" />
              ) : (
                <Cloud className="w-6 h-6 text-muted-foreground hover:text-primary transition-colors" />
              )}
            </Button>
            {isSyncingAlbum && syncProgress.total > 0 && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[10px] text-primary font-medium whitespace-nowrap">
                {syncProgress.synced + syncProgress.youtube}/{syncProgress.total}
              </span>
            )}
          </div>
        )}

        {/* Delete button */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="w-12 h-12 text-destructive hover:text-destructive"
            >
              <Trash2 className="w-5 h-5" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminare playlist?</AlertDialogTitle>
              <AlertDialogDescription>
                Questa azione non può essere annullata. La playlist "{playlist.name}" verrà eliminata definitivamente.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annulla</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete}>Elimina</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Track List */}
      <div className="px-4 md:px-8">
        {tracks.length === 0 ? (
          <div className="text-center py-12">
            <Music className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground">Nessun brano in questa playlist</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              Aggiungi brani dal menu ••• su qualsiasi traccia
            </p>
          </div>
        ) : (
          <>
            {/* Header - Hidden on mobile */}
            <div className="hidden md:grid grid-cols-[auto_1fr_auto] gap-4 px-4 py-2 text-sm text-muted-foreground border-b border-border mb-2">
              <span className="w-8 text-center">#</span>
              <span>Titolo</span>
              <Clock className="w-4 h-4" />
            </div>

            {/* Tracks */}
            <div className="space-y-1">
              {tracks.map((track, index) => (
                <TrackCard 
                  key={`${track.id}-${index}`} 
                  track={track}
                  queue={tracks}
                  index={index}
                  showArtist={true}
                  showSyncStatus={true}
                  isSynced={isSynced(track.id)}
                  isSyncing={isSyncing(track.id)}
                  isDownloading={isDownloading(track.id)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default PlaylistPage;