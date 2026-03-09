import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Play, Shuffle, Music, Download, Loader2, Share2, Copy, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import BackButton from '@/components/BackButton';
import TrackCard from '@/components/TrackCard';
import FavoriteButton from '@/components/FavoriteButton';
import AlbumPageSkeleton from '@/components/skeletons/AlbumPageSkeleton';
import { useSettings } from '@/contexts/SettingsContext';
import { usePlayer } from '@/contexts/PlayerContext';
import { useAuth } from '@/contexts/AuthContext';
import { useDownloadAll } from '@/hooks/useDownloadAll';
import { getDeezerPlaylist, DeezerPlaylist } from '@/lib/deezer';
import { Track, Album } from '@/types/music';
import { isPast } from 'date-fns';
import { toast } from 'sonner';

const DeezerPlaylistPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { playTrack } = usePlayer();
  const { t } = useSettings();
  const { profile, isAdmin } = useAuth();
  const { downloadAll, isDownloading: isDownloadingAll } = useDownloadAll();
  
  // Check if user can download (premium or admin)
  const isPremiumActive = profile?.is_premium && profile?.premium_expires_at && !isPast(new Date(profile.premium_expires_at));
  const canDownload = isPremiumActive || isAdmin;
  
  const [playlist, setPlaylist] = useState<(DeezerPlaylist & { tracks: Track[] }) | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [linkCopied, setLinkCopied] = useState(false);
  const [idCopied, setIdCopied] = useState(false);
  const shareUrl = `${window.location.origin}/deezer-playlist/${id}`;

  const handleCopyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setLinkCopied(true);
      toast.success('Link copiato!');
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      toast.error('Impossibile copiare il link');
    }
  };

  const handleCopyPlaylistId = async () => {
    if (!id) return;
    try {
      await navigator.clipboard.writeText(id);
      setIdCopied(true);
      toast.success('ID playlist copiato!');
      setTimeout(() => setIdCopied(false), 2000);
    } catch {
      toast.error('Impossibile copiare l\'ID');
    }
  };

  useEffect(() => {
    const fetchPlaylist = async () => {
      if (!id) return;
      setIsLoading(true);
      
      try {
        const data = await getDeezerPlaylist(id);
        setPlaylist(data);
      } catch (error) {
        console.error('Failed to fetch playlist:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPlaylist();
  }, [id]);

  if (isLoading) {
    return <AlbumPageSkeleton />;
  }

  if (!playlist) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Playlist not found</p>
      </div>
    );
  }

  const handlePlayAll = () => {
    if (playlist.tracks.length > 0) {
      playTrack(playlist.tracks[0], playlist.tracks);
    }
  };

  const handleShuffle = () => {
    if (playlist.tracks.length > 0) {
      const shuffled = [...playlist.tracks].sort(() => Math.random() - 0.5);
      playTrack(shuffled[0], shuffled);
    }
  };

  // Create a playlist object for the favorite button
  const playlistForFavorite: Album = {
    id: `deezer-playlist-${id}`,
    title: playlist.title,
    artist: playlist.creator || 'Deezer',
    coverUrl: playlist.coverUrl || '',
    artistId: '',
  };

  return (
    <div className="pb-32 animate-fade-in relative">
      {/* Back button */}
      <div className="absolute top-4 left-4 z-10">
        <BackButton />
      </div>

      {/* Hero Section */}
      <div className="relative h-64 md:h-80 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/20 to-background" />
        {playlist.coverUrl && (
          <img 
            src={playlist.coverUrl} 
            alt={playlist.title}
            className="absolute inset-0 w-full h-full object-cover opacity-30 blur-xl"
          />
        )}
        <div className="absolute bottom-0 left-0 right-0 p-4 md:p-8 flex flex-col md:flex-row items-center md:items-end gap-4 md:gap-6">
          <div className="w-32 h-32 md:w-48 md:h-48 rounded-lg overflow-hidden bg-muted shadow-2xl flex-shrink-0">
            {playlist.coverUrl ? (
              <img src={playlist.coverUrl} alt={playlist.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Music className="w-16 md:w-24 h-16 md:h-24 text-muted-foreground" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0 text-center md:text-left">
            <p className="text-xs md:text-sm text-foreground/70 uppercase tracking-wider mb-1">Playlist Deezer</p>
            <h1 className="text-2xl md:text-5xl font-bold text-foreground mb-2 truncate">{playlist.title}</h1>
            {playlist.description && (
              <p className="text-sm text-muted-foreground mb-2 line-clamp-2">{playlist.description}</p>
            )}
            <p className="text-sm text-muted-foreground">
              {playlist.creator} • {playlist.trackCount} brani
            </p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 md:px-8 py-4 md:py-6 flex items-center gap-3">
        <Button variant="player" size="player" onClick={handlePlayAll} disabled={playlist.tracks.length === 0}>
          <Play className="w-5 md:w-6 h-5 md:h-6 ml-0.5" />
        </Button>
        <Button variant="ghost" size="icon" className="w-10 h-10 md:w-12 md:h-12" onClick={handleShuffle} disabled={playlist.tracks.length === 0}>
          <Shuffle className="w-5 h-5 md:w-6 md:h-6" />
        </Button>
        
        {/* Favorite button */}
        <FavoriteButton
          itemType="playlist"
          item={playlistForFavorite}
          size="lg"
          variant="ghost"
        />
        
        {/* Download button - Premium only */}
        {/* Share button */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="w-10 h-10 md:w-12 md:h-12">
              <Share2 className="w-5 h-5 text-muted-foreground" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="start">
            <div className="space-y-3">
              <h4 className="font-medium">Condividi playlist</h4>
              <p className="text-sm text-muted-foreground">
                Condividi questa playlist Deezer con altri utenti
              </p>
              <div className="flex gap-2">
                <Input
                  value={shareUrl}
                  readOnly
                  className="text-xs"
                />
                <Button size="sm" onClick={handleCopyShareLink}>
                  {linkCopied ? (
                    <CheckCircle className="w-4 h-4" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
              
              {/* Admin: Copy playlist ID for chart configuration */}
              {isAdmin && id && (
                <div className="pt-2 border-t border-border">
                  <p className="text-xs text-muted-foreground mb-2">
                    ID playlist per classifiche:
                  </p>
                  <div className="flex gap-2">
                    <Input
                      value={id}
                      readOnly
                      className="text-xs font-mono"
                    />
                    <Button size="sm" variant="outline" onClick={handleCopyPlaylistId}>
                      {idCopied ? (
                        <CheckCircle className="w-4 h-4" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>
        
        {canDownload && playlist.tracks.length > 0 && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => downloadAll(playlist.tracks, playlist.title)}
            disabled={isDownloadingAll}
            className="w-10 h-10 md:w-12 md:h-12"
          >
            {isDownloadingAll ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Download className="w-5 h-5 text-muted-foreground" />
            )}
          </Button>
        )}
      </div>

      {/* Tracks */}
      <section className="px-4 md:px-8">
        <div className="space-y-1">
          {playlist.tracks.map((track, index) => (
            <TrackCard 
              key={track.id} 
              track={track}
              queue={playlist.tracks}
              index={index}
            />
          ))}
        </div>
      </section>
    </div>
  );
};

export default DeezerPlaylistPage;
