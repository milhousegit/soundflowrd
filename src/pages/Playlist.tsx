import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Play, Clock, Music, Loader2, Trash2, Pencil, Shuffle, Download, GripVertical, X, Check, Globe, Lock, Share2, Copy, CheckCircle, Upload, ImageIcon, ListMusic, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import BackButton from '@/components/BackButton';
import TrackCard from '@/components/TrackCard';
import FavoriteButton from '@/components/FavoriteButton';
import PlaylistRecommendations from '@/components/PlaylistRecommendations';
import CommentSection from '@/components/social/CommentSection';
import { usePlaylistCoverUpload } from '@/hooks/usePlaylistCoverUpload';
import { useSettings } from '@/contexts/SettingsContext';
import { usePlayer } from '@/contexts/PlayerContext';
import { useAuth } from '@/contexts/AuthContext';
import { usePlaylists, PlaylistTrack, Playlist as PlaylistType } from '@/hooks/usePlaylists';
import { useSyncedTracks } from '@/hooks/useSyncedTracks';
import { useDownloadAll } from '@/hooks/useDownloadAll';
import { getDeezerPlaylist } from '@/lib/deezer';
import { Track, Album } from '@/types/music';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { isPast } from 'date-fns';
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

const PlaylistPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { playTrack } = usePlayer();
  const { t } = useSettings();
  const { profile, isAdmin, user } = useAuth();
  const { getPlaylistTracks, deletePlaylist, updatePlaylist, removeTrackFromPlaylist, reorderPlaylistTracks, addTrackToPlaylist } = usePlaylists();
  const { downloadAll, isDownloading: isDownloadingAll } = useDownloadAll();
  
  const [playlist, setPlaylist] = useState<PlaylistType | null>(null);
  const [ownerProfile, setOwnerProfile] = useState<{ id: string; display_name: string | null; avatar_url: string | null } | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [editedCoverUrl, setEditedCoverUrl] = useState('');
  const [editedIsPublic, setEditedIsPublic] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [isCoverDragOver, setIsCoverDragOver] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [activeTab, setActiveTab] = useState<'tracks' | 'comments'>('tracks');
  const [commentsCount, setCommentsCount] = useState(0);
  const coverInputRef = React.useRef<HTMLInputElement>(null);
  
  // Check if user can download (premium or admin)
  const isPremiumActive = profile?.is_premium && profile?.premium_expires_at && !isPast(new Date(profile.premium_expires_at));
  const canDownload = isPremiumActive || isAdmin;
  
  // Check if current user is the owner of the playlist
  const isOwner = user?.id === playlist?.user_id;
  
  // Check if admin can edit (admins can edit any playlist)
  const canEdit = isOwner || isAdmin;
  
  // Get track IDs for sync status checking
  const trackIds = useMemo(() => tracks.map(t => t.id), [tracks]);
  const { isSynced, isSyncing, isDownloading } = useSyncedTracks(trackIds);

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
        
        const fetchedPlaylist = playlistData as PlaylistType;
        setPlaylist(fetchedPlaylist);
        setEditedName(fetchedPlaylist.name);
        setEditedCoverUrl(fetchedPlaylist.cover_url || '');
        setEditedIsPublic(fetchedPlaylist.is_public || false);

        // Fetch owner profile if not the current user
        if (fetchedPlaylist.user_id !== user?.id) {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('id, display_name, avatar_url')
            .eq('id', fetchedPlaylist.user_id)
            .single();
          
          if (profileData) {
            setOwnerProfile(profileData);
          }
        }

        // Check if this is a Deezer playlist (has deezer_id)
        if (fetchedPlaylist.deezer_id) {
          // Load tracks from Deezer API
          try {
            const deezerPlaylist = await getDeezerPlaylist(fetchedPlaylist.deezer_id);
            setTracks(deezerPlaylist.tracks);
          } catch (deezerError) {
            console.error('Failed to fetch Deezer playlist tracks:', deezerError);
            toast.error('Errore nel caricamento dei brani da Deezer');
            setTracks([]);
          }
        } else {
          // Load tracks from local database
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
        }
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

  // Fetch comments count for playlist
  useEffect(() => {
    const fetchCommentsCount = async () => {
      if (!id) return;
      const { count } = await supabase
        .from('comments')
        .select('*', { count: 'exact', head: true })
        .eq('album_id', id); // We reuse album_id for playlist comments
      setCommentsCount(count || 0);
    };
    fetchCommentsCount();
  }, [id]);

  // Listen for track metadata updates from DebugModal
  useEffect(() => {
    const handleMetadataUpdate = (event: CustomEvent<{ oldTrackId: string; newTrack: { id: string; title: string; artist: string; album?: string; coverUrl?: string; duration?: number } }>) => {
      const { oldTrackId, newTrack } = event.detail;
      
      setTracks(prevTracks => prevTracks.map(track => {
        if (track.id === oldTrackId) {
          return {
            ...track,
            id: newTrack.id,
            title: newTrack.title,
            artist: newTrack.artist,
            album: newTrack.album || track.album,
            coverUrl: newTrack.coverUrl || track.coverUrl,
            duration: newTrack.duration || track.duration,
          };
        }
        return track;
      }));
    };

    window.addEventListener('track-metadata-updated', handleMetadataUpdate as EventListener);
    return () => {
      window.removeEventListener('track-metadata-updated', handleMetadataUpdate as EventListener);
    };
  }, []);


  const handleCopyShareLink = () => {
    const shareUrl = `${window.location.origin}/playlist/${playlist?.id}`;
    navigator.clipboard.writeText(shareUrl);
    setLinkCopied(true);
    toast.success('Link copiato!');
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const handleTogglePublic = async () => {
    if (!playlist) return;
    const newIsPublic = !playlist.is_public;
    await updatePlaylist(playlist.id, { is_public: newIsPublic });
    setPlaylist({ ...playlist, is_public: newIsPublic });
    setEditedIsPublic(newIsPublic);
    toast.success(newIsPublic ? 'Playlist ora pubblica' : 'Playlist ora privata');
  };

  const handleDelete = async () => {
    if (!playlist) return;
    await deletePlaylist(playlist.id);
    navigate('/library');
  };

  const handleRemoveTrack = async (trackId: string) => {
    if (!playlist) return;
    const success = await removeTrackFromPlaylist(playlist.id, trackId);
    if (success) {
      setTracks(prev => prev.filter(t => t.id !== trackId));
    }
  };

  // Drag and drop handlers
  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragEnd = async () => {
    if (draggedIndex !== null && dragOverIndex !== null && draggedIndex !== dragOverIndex && playlist) {
      const newTracks = [...tracks];
      const [draggedTrack] = newTracks.splice(draggedIndex, 1);
      newTracks.splice(dragOverIndex, 0, draggedTrack);
      setTracks(newTracks);
      
      // Save new order to database
      const trackIds = newTracks.map(t => t.id);
      await reorderPlaylistTracks(playlist.id, trackIds);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleExitEditMode = async () => {
    // Save all changes when exiting edit mode
    if (playlist && editedName.trim()) {
      await updatePlaylist(playlist.id, {
        name: editedName.trim(),
        cover_url: editedCoverUrl || undefined,
        is_public: editedIsPublic,
      });
      setPlaylist({ ...playlist, name: editedName.trim(), cover_url: editedCoverUrl || null, is_public: editedIsPublic });
      toast.success('Playlist aggiornata');
    }
    setIsEditing(false);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // Cover upload handlers
  const { uploadCover } = usePlaylistCoverUpload();

  const handleCoverFileSelect = async (file: File) => {
    if (!file || !user) return;
    setIsUploadingCover(true);
    try {
      const url = await uploadCover(file, user.id);
      if (url) {
        setEditedCoverUrl(url);
      }
    } finally {
      setIsUploadingCover(false);
    }
  };

  const handleCoverDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsCoverDragOver(true);
  };

  const handleCoverDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsCoverDragOver(false);
  };

  const handleCoverDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsCoverDragOver(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleCoverFileSelect(files[0]);
    }
  };

  const handleCoverInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleCoverFileSelect(files[0]);
    }
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

  const handleShuffle = () => {
    if (tracks.length > 0) {
      const shuffled = [...tracks].sort(() => Math.random() - 0.5);
      playTrack(shuffled[0], shuffled);
    }
  };

  // Create a playlist object for the favorite button
  const playlistForFavorite: Album = {
    id: playlist.id,
    title: playlist.name,
    artist: 'Playlist',
    coverUrl: playlist.cover_url || '',
    artistId: '',
  };

  return (
    <div className="pb-32 animate-fade-in relative">
      {/* Back button mobile */}
      <div className="absolute top-4 left-4 z-10">
        <BackButton />
      </div>
      
      {/* Header */}
      <div className="relative p-4 md:p-8 pt-12 md:pt-16 flex flex-col md:flex-row items-center md:items-end gap-4 md:gap-8 bg-gradient-to-b from-primary/10 to-transparent">
        {/* Cover - clickable in edit mode */}
        <div 
          className={`w-40 h-40 md:w-56 md:h-56 rounded-xl overflow-hidden bg-muted shadow-2xl flex-shrink-0 relative ${
            isEditing && canEdit ? 'cursor-pointer group' : ''
          } ${isCoverDragOver ? 'ring-2 ring-primary ring-offset-2' : ''}`}
          onClick={() => isEditing && canEdit && !isUploadingCover && coverInputRef.current?.click()}
          onDragOver={isEditing && canEdit ? handleCoverDragOver : undefined}
          onDragLeave={isEditing && canEdit ? handleCoverDragLeave : undefined}
          onDrop={isEditing && canEdit ? handleCoverDrop : undefined}
        >
          {/* Hidden file input */}
          <input
            ref={coverInputRef}
            type="file"
            accept="image/*"
            onChange={handleCoverInputChange}
            className="hidden"
            disabled={isUploadingCover}
          />
          
          {isUploadingCover ? (
            <div className="w-full h-full flex items-center justify-center bg-muted">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (editedCoverUrl || playlist.cover_url) ? (
            <img 
              src={isEditing ? editedCoverUrl || playlist.cover_url : playlist.cover_url} 
              alt={playlist.name} 
              className="w-full h-full object-cover" 
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
              <Music className="w-16 md:w-24 h-16 md:h-24 text-primary/50" />
            </div>
          )}
          
          {/* Edit overlay */}
          {isEditing && canEdit && !isUploadingCover && (
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white">
              <Upload className="w-8 h-8 mb-2" />
              <p className="text-sm font-medium">Cambia cover</p>
              <p className="text-xs opacity-70">Clicca o trascina</p>
            </div>
          )}

          {/* Remove cover button */}
          {isEditing && canEdit && editedCoverUrl && !isUploadingCover && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setEditedCoverUrl('');
              }}
              className="absolute bottom-2 right-2 w-7 h-7 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center shadow-lg hover:bg-destructive/90 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 text-center md:text-left">
          <p className="text-xs md:text-sm text-foreground/70 uppercase tracking-wider mb-1">{playlist.deezer_id ? 'Playlist Deezer' : 'Playlist'}</p>
          
          {isEditing && canEdit ? (
            <div className="space-y-3 max-w-md">
              <Input
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                placeholder="Nome playlist"
                className="text-xl font-bold"
              />
              
              {/* Public/Private toggle */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border">
                <div className="flex items-center gap-3">
                  {editedIsPublic ? (
                    <Globe className="w-5 h-5 text-primary" />
                  ) : (
                    <Lock className="w-5 h-5 text-muted-foreground" />
                  )}
                  <div>
                    <Label htmlFor="edit-public-toggle" className="font-medium">
                      {editedIsPublic ? 'Pubblica' : 'Privata'}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {editedIsPublic 
                        ? 'Chiunque può vedere questa playlist' 
                        : 'Solo tu puoi vedere questa playlist'}
                    </p>
                  </div>
                </div>
                <Switch
                  id="edit-public-toggle"
                  checked={editedIsPublic}
                  onCheckedChange={setEditedIsPublic}
                />
              </div>
            </div>
          ) : (
            <>
              <h1 className="text-2xl md:text-5xl font-bold text-foreground mb-2 md:mb-4 truncate">
                {playlist.name}
              </h1>
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-1 md:gap-2 text-xs md:text-sm text-muted-foreground">
                {/* Owner/Public/Private indicator */}
                {isOwner ? (
                  // Show public/private status for owner
                  playlist.is_public ? (
                    <span className="flex items-center gap-1 text-primary">
                      <Globe className="w-3 h-3" />
                      Pubblica
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <Lock className="w-3 h-3" />
                      Privata
                    </span>
                  )
                ) : ownerProfile ? (
                  // Show owner profile link for non-owners
                  <button
                    onClick={() => navigate(`/profile/${ownerProfile.id}`)}
                    className="flex items-center gap-1.5 hover:text-foreground transition-colors"
                  >
                    {ownerProfile.avatar_url ? (
                      <img 
                        src={ownerProfile.avatar_url} 
                        alt="" 
                        className="w-4 h-4 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-4 h-4 rounded-full bg-muted flex items-center justify-center">
                        <span className="text-[8px]">👤</span>
                      </div>
                    )}
                    <span className="hover:underline">
                      {ownerProfile.display_name || 'Utente'}
                    </span>
                  </button>
                ) : (
                  // Fallback for public playlists without owner data
                  <span className="flex items-center gap-1 text-primary">
                    <Globe className="w-3 h-3" />
                    Pubblica
                  </span>
                )}
                <span>•</span>
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
        {isEditing && canEdit ? (
          // Edit mode actions
          <>
            <Button 
              variant="default" 
              size="sm"
              onClick={handleExitEditMode}
              className="gap-2"
            >
              <Check className="w-4 h-4" />
              Fatto
            </Button>
            <p className="text-sm text-muted-foreground">
              {playlist.deezer_id 
                ? 'Modifica info playlist' 
                : 'Modifica info, trascina per riordinare o clicca X per rimuovere'}
            </p>
          </>
        ) : (
          // Normal mode actions
          <>
            <Button 
              variant="player" 
              size="player" 
              onClick={handlePlayAll}
              disabled={tracks.length === 0}
            >
              <Play className="w-5 md:w-6 h-5 md:h-6 ml-0.5" />
            </Button>

            {/* Shuffle button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleShuffle}
              disabled={tracks.length === 0}
              className="w-12 h-12"
            >
              <Shuffle className="w-5 h-5 text-muted-foreground" />
            </Button>

            {/* Favorite button - cuoricino */}
            <FavoriteButton
              itemType="playlist"
              item={playlistForFavorite}
              size="lg"
            />

            {/* Share button with popover */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-12 h-12"
                  title="Condividi"
                >
                  <Share2 className="w-5 h-5 text-muted-foreground" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80" align="start">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {playlist.is_public ? (
                        <Globe className="w-4 h-4 text-primary" />
                      ) : (
                        <Lock className="w-4 h-4 text-muted-foreground" />
                      )}
                      <span className="font-medium">
                        {playlist.is_public ? 'Pubblica' : 'Privata'}
                      </span>
                    </div>
                    {isOwner && (
                      <Switch
                        checked={playlist.is_public}
                        onCheckedChange={handleTogglePublic}
                      />
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {playlist.is_public 
                      ? 'Chiunque con il link può vedere questa playlist' 
                      : 'Solo tu puoi vedere questa playlist. Rendila pubblica per condividerla.'}
                  </p>
                  {playlist.is_public && (
                    <div className="flex gap-2">
                      <Input
                        readOnly
                        value={`${window.location.origin}/playlist/${playlist.id}`}
                        className="text-sm"
                      />
                      <Button 
                        size="icon" 
                        variant="outline" 
                        onClick={handleCopyShareLink}
                        className="flex-shrink-0"
                      >
                        {linkCopied ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  )}
                  
                  {/* Admin-only: Show SoundFlow playlist ID for chart configuration */}
                  {isAdmin && !playlist.deezer_id && (
                    <div className="pt-2 border-t border-border">
                      <p className="text-xs text-muted-foreground mb-1">ID Playlist (per classifiche)</p>
                      <div className="flex gap-2">
                        <Input
                          readOnly
                          value={`sf:${playlist.id}`}
                          className="text-xs font-mono"
                        />
                        <Button 
                          size="icon" 
                          variant="outline" 
                          onClick={() => {
                            navigator.clipboard.writeText(`sf:${playlist.id}`);
                            toast.success('ID copiato!');
                          }}
                          className="flex-shrink-0"
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>

            {/* Download button - Premium only */}
            {canDownload && tracks.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => downloadAll(tracks, playlist.name)}
                disabled={isDownloadingAll}
                className="w-12 h-12"
              >
                {isDownloadingAll ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Download className="w-5 h-5 text-muted-foreground" />
                )}
              </Button>
            )}

            {/* Edit button - owner or admin can edit any playlist */}
            {canEdit && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsEditing(true)}
                className="w-12 h-12"
                title="Modifica playlist"
              >
                <Pencil className="w-5 h-5 text-muted-foreground" />
              </Button>
            )}

            {/* Delete button - owner only */}
            {isOwner && (
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
            )}
          </>
        )}
      </div>

      {/* Tab Bar - Instagram/TikTok style */}
      <div className="border-t border-b border-border">
        <div className="flex max-w-xl mx-auto">
          <button
            onClick={() => setActiveTab('tracks')}
            className={`flex-1 py-3 flex items-center justify-center gap-2 transition-colors relative ${
              activeTab === 'tracks' 
                ? 'text-foreground' 
                : 'text-muted-foreground'
            }`}
          >
            <ListMusic className="w-5 h-5" />
            <span className="text-sm font-medium">{tracks.length}</span>
            {activeTab === 'tracks' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('comments')}
            className={`flex-1 py-3 flex items-center justify-center gap-2 transition-colors relative ${
              activeTab === 'comments' 
                ? 'text-foreground' 
                : 'text-muted-foreground'
            }`}
          >
            <MessageCircle className="w-5 h-5" />
            <span className="text-sm font-medium">{commentsCount}</span>
            {activeTab === 'comments' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" />
            )}
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'tracks' ? (
        <>
          {/* Track List */}
          <div className="px-4 md:px-8 pt-4">
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
                {/* Header - Hidden on mobile and in edit mode */}
                {!isEditing && (
                  <div className="hidden md:grid grid-cols-[auto_1fr_auto] gap-4 px-4 py-2 text-sm text-muted-foreground border-b border-border mb-2">
                    <span className="w-8 text-center">#</span>
                    <span>Titolo</span>
                    <Clock className="w-4 h-4" />
                  </div>
                )}

                {/* Tracks */}
                <div className="space-y-1">
                  {tracks.map((track, index) => (
                    isEditing && canEdit && !playlist.deezer_id ? (
                      // Edit mode track row
                      <div
                        key={`${track.id}-${index}`}
                        draggable
                        onDragStart={() => handleDragStart(index)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDragEnd={handleDragEnd}
                        onDragLeave={handleDragLeave}
                        className={`
                          flex items-center gap-3 p-3 rounded-lg bg-card/50 border border-border
                          cursor-grab active:cursor-grabbing transition-all
                          ${draggedIndex === index ? 'opacity-50 scale-95' : ''}
                          ${dragOverIndex === index ? 'border-primary border-2' : ''}
                        `}
                      >
                        {/* Drag handle */}
                        <GripVertical className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                        
                        {/* Track info */}
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          {track.coverUrl && (
                            <img 
                              src={track.coverUrl} 
                              alt={track.title}
                              className="w-10 h-10 rounded object-cover flex-shrink-0"
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="font-medium truncate">{track.title}</p>
                            <p className="text-sm text-muted-foreground truncate">{track.artist}</p>
                          </div>
                        </div>
                        
                        {/* Remove button */}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveTrack(track.id)}
                          className="w-8 h-8 text-destructive hover:text-destructive hover:bg-destructive/10 flex-shrink-0"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : (
                      // Normal mode track row
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
                        playlistId={isOwner && !playlist.deezer_id ? playlist.id : undefined}
                        onRemoveFromPlaylist={isOwner && !playlist.deezer_id ? handleRemoveTrack : undefined}
                      />
                    )
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Recommended Tracks - only for owner and non-Deezer playlists */}
          {isOwner && !playlist.deezer_id && !isEditing && tracks.length > 0 && (
            <PlaylistRecommendations 
              tracks={tracks}
              onAddTrack={async (track) => {
                const success = await addTrackToPlaylist(playlist.id, track);
                if (success) {
                  setTracks(prev => [...prev, track]);
                }
                return success;
              }}
            />
          )}
        </>
      ) : (
        /* Comments Section */
        <div className="px-4 md:px-8 py-6">
          <CommentSection albumId={playlist.id} />
        </div>
      )}
    </div>
  );
};

export default PlaylistPage;