import React, { forwardRef, useState, useCallback } from 'react';
import { Track } from '@/types/music';
import { usePlayer } from '@/contexts/PlayerContext';
import { useAuth } from '@/contexts/AuthContext';
import { Play, Pause, Music, Cloud, MoreVertical, ListPlus, Loader2, ListMusic, Plus, Download, HardDrive, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import FavoriteButton from './FavoriteButton';
import { useSyncedTracks } from '@/hooks/useSyncedTracks';
import { usePlaylists } from '@/hooks/usePlaylists';
import { useOfflineStorage } from '@/hooks/useOfflineStorage';
import { useTap } from '@/hooks/useTap';
import { useIsMobile } from '@/hooks/use-mobile';
import { toast } from 'sonner';
import { isPast } from 'date-fns';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Button } from '@/components/ui/button';

interface TrackCardProps {
  track: Track;
  queue?: Track[];
  showArtist?: boolean;
  showFavorite?: boolean;
  showSyncStatus?: boolean;
  index?: number;
  isSynced?: boolean;
  isSyncing?: boolean;
  isDownloading?: boolean;
  onCreatePlaylist?: () => void;
}

const TrackCard = forwardRef<HTMLDivElement, TrackCardProps>(
  ({ track, queue, showArtist = true, showFavorite = true, showSyncStatus = true, index, isSynced: propIsSynced, isSyncing: propIsSyncing, isDownloading: propIsDownloading, onCreatePlaylist }, ref) => {
    const { currentTrack, isPlaying, playTrack, toggle, addToQueue, loadingPhase } = usePlayer();
    const { profile, isAdmin } = useAuth();
    const { isSynced: hookIsSynced, isSyncing: hookIsSyncing, isDownloading: hookIsDownloading } = useSyncedTracks([track.id]);
    const { playlists, addTrackToPlaylist } = usePlaylists();
    const { saveTrackOffline, isTrackOffline } = useOfflineStorage();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isAddingToPlaylist, setIsAddingToPlaylist] = useState<string | null>(null);
    const [isDownloadingSingle, setIsDownloadingSingle] = useState(false);
    const isMobile = useIsMobile();
    
    const isCurrentTrack = currentTrack?.id === track.id;
    const isSynced = propIsSynced !== undefined ? propIsSynced : hookIsSynced(track.id);
    const isSyncing = propIsSyncing !== undefined ? propIsSyncing : hookIsSyncing(track.id);
    const isDownloading = propIsDownloading !== undefined ? propIsDownloading : hookIsDownloading(track.id);
    
    // Check if user can download (premium or admin)
    const isPremiumActive = profile?.is_premium && profile?.premium_expires_at && !isPast(new Date(profile.premium_expires_at));
    const canDownload = isPremiumActive || isAdmin;
    const isOffline = isTrackOffline(track.id);
    
    const isCurrentTrackLoading = isCurrentTrack && loadingPhase !== 'idle';

    const handleDownloadSingle = async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!canDownload || isDownloadingSingle || isOffline) return;

      setIsDownloadingSingle(true);
      const toastId = toast.loading(`Download di "${track.title}"...`);

      try {
        const baseUrl = import.meta.env.VITE_SUPABASE_URL;
        
        // Try Lucida first
        const lucidaResponse = await fetch(`${baseUrl}/functions/v1/lucida`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'getTrack',
            trackId: track.id,
          }),
        });

        let streamUrl = null;

        if (lucidaResponse.ok) {
          const lucidaData = await lucidaResponse.json();
          streamUrl = lucidaData.streamUrl;
        }

        // Fallback to squidwtf
        if (!streamUrl) {
          const squidResponse = await fetch(`${baseUrl}/functions/v1/squidwtf`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'getTrack',
              trackId: track.id,
              trackTitle: track.title,
              artistName: track.artist,
            }),
          });

          if (squidResponse.ok) {
            const squidData = await squidResponse.json();
            streamUrl = squidData.streamUrl;
          }
        }

        if (streamUrl) {
          const audioResponse = await fetch(streamUrl);
          if (audioResponse.ok) {
            const blob = await audioResponse.blob();
            await saveTrackOffline(track, blob);
            toast.success('Download completato!', { id: toastId });
          } else {
            toast.error('Errore nel download', { id: toastId });
          }
        } else {
          toast.error('Nessuna sorgente disponibile', { id: toastId });
        }
      } catch (error) {
        console.error('Download failed:', error);
        toast.error('Download fallito', { id: toastId });
      } finally {
        setIsDownloadingSingle(false);
      }
    };

    const handleAddToQueue = (e: React.MouseEvent) => {
      e.stopPropagation();
      addToQueue([track]);
      toast.success('Aggiunto alla coda');
    };

    const handleAddToPlaylist = async (e: React.MouseEvent, playlistId: string) => {
      e.stopPropagation();
      setIsAddingToPlaylist(playlistId);
      await addTrackToPlaylist(playlistId, track);
      setIsAddingToPlaylist(null);
    };

    const formatDuration = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const handleContextMenu = useCallback((e: React.MouseEvent) => {
      // Prevent default context menu on mobile to let Radix handle it
      if (isMobile) {
        e.preventDefault();
      }
    }, [isMobile]);

    // Combined click handler
    const handleTapClick = useCallback(() => {
      if (isMenuOpen) return;
      if (isCurrentTrack) {
        toggle();
      } else {
        playTrack(track, queue);
      }
    }, [isMenuOpen, isCurrentTrack, toggle, playTrack, track, queue]);

    // Handle copy ID
    const handleCopyId = (e: React.MouseEvent) => {
      e.stopPropagation();
      navigator.clipboard.writeText(track.id);
      toast.success(`ID copiato: ${track.id}`);
    };

    // Menu content (shared between DropdownMenu and ContextMenu)
    const renderMenuItems = (isContext: boolean = false) => {
      const MenuItem = isContext ? ContextMenuItem : DropdownMenuItem;
      const MenuSub = isContext ? ContextMenuSub : DropdownMenuSub;
      const MenuSubTrigger = isContext ? ContextMenuSubTrigger : DropdownMenuSubTrigger;
      const MenuSubContent = isContext ? ContextMenuSubContent : DropdownMenuSubContent;
      const MenuSeparator = isContext ? ContextMenuSeparator : DropdownMenuSeparator;

      return (
        <>
          <MenuItem onClick={handleAddToQueue} className="cursor-pointer">
            <ListPlus className="w-4 h-4 mr-2" />
            Aggiungi alla coda
          </MenuItem>
          <MenuSub>
            <MenuSubTrigger className="cursor-pointer">
              <ListMusic className="w-4 h-4 mr-2" />
              Aggiungi a playlist
            </MenuSubTrigger>
            <MenuSubContent className="bg-popover w-48">
              <MenuItem 
                onClick={(e) => { e.stopPropagation(); onCreatePlaylist?.(); }} 
                className="cursor-pointer"
              >
                <Plus className="w-4 h-4 mr-2" />
                Crea nuova playlist
              </MenuItem>
              {playlists.length > 0 && <MenuSeparator />}
              {playlists.map((playlist) => (
                <MenuItem 
                  key={playlist.id}
                  onClick={(e) => handleAddToPlaylist(e as React.MouseEvent, playlist.id)} 
                  className="cursor-pointer"
                  disabled={isAddingToPlaylist === playlist.id}
                >
                  {isAddingToPlaylist === playlist.id ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <ListPlus className="w-4 h-4 mr-2" />
                  )}
                  <span className="truncate">{playlist.name}</span>
                </MenuItem>
              ))}
            </MenuSubContent>
          </MenuSub>
          {canDownload && !isOffline && (
            <MenuItem onClick={handleDownloadSingle} className="cursor-pointer" disabled={isDownloadingSingle}>
              {isDownloadingSingle ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Scarica offline
            </MenuItem>
          )}
          {isOffline && (
            <MenuItem disabled className="cursor-default">
              <HardDrive className="w-4 h-4 mr-2 text-green-500" />
              Disponibile offline
            </MenuItem>
          )}
          <MenuSeparator />
          <MenuItem onClick={handleCopyId} className="cursor-pointer">
            <Copy className="w-4 h-4 mr-2" />
            Copia ID
          </MenuItem>
        </>
      );
    };

    const tap = useTap({ onTap: handleTapClick });

    // Render status icon - simplified:
    // - Green cloud ONLY if mapped and immediately available on RD
    // - Green download ONLY if downloaded offline
    // - Nothing for everything else
    const renderStatusIcon = () => {
      if (!showSyncStatus) return null;
      
      // Downloaded offline - green download icon
      if (isOffline) {
        return <Download className="w-3.5 h-3.5 flex-shrink-0 text-green-500" />;
      }
      
      // Synced with direct_link (mapped and available on Real-Debrid) - solid green cloud
      if (isSynced) {
        return <Cloud className="w-3.5 h-3.5 flex-shrink-0 text-green-500" />;
      }
      
      // Everything else: no icon
      return null;
    };

    // Track card content
    const trackCardContent = (
      <div
        ref={ref}
        {...tap}
        onContextMenu={handleContextMenu}
        className={cn(
          "group flex items-center gap-3 md:gap-4 p-2 md:p-3 rounded-lg cursor-pointer transition-all duration-200 touch-manipulation select-none",
          "hover:bg-secondary/80 active:scale-[0.99]",
          isCurrentTrack && "bg-secondary",
          // Disable text selection on long press
          "-webkit-touch-callout-none"
        )}
        style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none' } as React.CSSProperties}
      >

        {/* Cover */}
        <div className="w-10 h-10 md:w-10 md:h-10 rounded bg-muted flex items-center justify-center overflow-hidden flex-shrink-0 relative">
          {track.coverUrl ? (
            <img src={track.coverUrl} alt={track.album} className="w-full h-full object-cover pointer-events-none" draggable={false} />
          ) : (
            <Music className="w-4 h-4 text-muted-foreground" />
          )}
          {/* Show loading overlay on cover for current track */}
          {isCurrentTrackLoading && (
            <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className={cn(
              "font-medium text-sm md:text-base truncate",
              isCurrentTrack ? "text-primary" : "text-foreground"
            )}>
              {track.title}
            </p>
            {/* Sync status icon */}
            {renderStatusIcon()}
          </div>
          {showArtist && (
            <p className="text-xs md:text-sm text-muted-foreground truncate">{track.artist}</p>
          )}
        </div>

        {/* Actions container */}
        <div className="flex items-center gap-1">
          {/* More menu - DESKTOP ONLY */}
          {!isMobile && (
            <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity flex-shrink-0"
                >
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 bg-popover z-[100]">
                {renderMenuItems(false)}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Duration */}
          <span className="text-xs md:text-sm text-muted-foreground flex-shrink-0 min-w-[36px] text-right">
            {formatDuration(track.duration)}
          </span>

          {/* Favorite button */}
          {showFavorite && (
            <FavoriteButton
              itemType="track"
              item={track}
              size="sm"
              className="md:opacity-0 md:group-hover:opacity-100 transition-opacity"
              variant="ghost"
            />
          )}
        </div>
      </div>
    );

    // On mobile, wrap with ContextMenu for long-press
    if (isMobile) {
      return (
        <ContextMenu>
          <ContextMenuTrigger asChild>
            {trackCardContent}
          </ContextMenuTrigger>
          <ContextMenuContent className="w-48 bg-popover z-[100]">
            {renderMenuItems(true)}
          </ContextMenuContent>
        </ContextMenu>
      );
    }

    // Desktop: just return the content
    return trackCardContent;
  }
);

TrackCard.displayName = 'TrackCard';

export default TrackCard;
