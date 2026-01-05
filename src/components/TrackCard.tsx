import React, { forwardRef, useState } from 'react';
import { Track } from '@/types/music';
import { usePlayer } from '@/contexts/PlayerContext';
import { Play, Pause, Music, Cloud, MoreVertical, ListPlus, CloudOff, CloudUpload } from 'lucide-react';
import { cn } from '@/lib/utils';
import FavoriteButton from './FavoriteButton';
import { useSyncedTracks, removeSyncedTrack } from '@/hooks/useSyncedTracks';
import { useTap } from '@/hooks/useTap';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
}

const TrackCard = forwardRef<HTMLDivElement, TrackCardProps>(
  ({ track, queue, showArtist = true, showFavorite = true, showSyncStatus = true, index, isSynced: propIsSynced, isSyncing: propIsSyncing, isDownloading: propIsDownloading }, ref) => {
    const { currentTrack, isPlaying, playTrack, toggle, addToQueue } = usePlayer();
    const { isSynced: hookIsSynced, isSyncing: hookIsSyncing, isDownloading: hookIsDownloading } = useSyncedTracks([track.id]);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    
    const isCurrentTrack = currentTrack?.id === track.id;
    const isSynced = propIsSynced !== undefined ? propIsSynced : hookIsSynced(track.id);
    const isSyncing = propIsSyncing !== undefined ? propIsSyncing : hookIsSyncing(track.id);
    const isDownloading = propIsDownloading !== undefined ? propIsDownloading : hookIsDownloading(track.id);

    // Show cloud icon only when synced (solid) or syncing/downloading (pulsing)
    const showCloudIcon = isSynced || isSyncing || isDownloading;
    const shouldPulse = (isSyncing || isDownloading) && !isSynced;

    const handleClick = () => {
      if (isMenuOpen) return; // Don't trigger play when menu is open
      if (isCurrentTrack) {
        toggle();
      } else {
        playTrack(track, queue);
      }
    };

    const handleRemoveSync = async (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        const { error } = await supabase
          .from('track_file_mappings')
          .delete()
          .eq('track_id', track.id);
        
        if (error) throw error;
        
        removeSyncedTrack(track.id);
        toast.success('Sincronizzazione rimossa');
      } catch (error) {
        console.error('Failed to remove sync:', error);
        toast.error('Errore nella rimozione');
      }
    };

    const handleSync = (e: React.MouseEvent) => {
      e.stopPropagation();
      // Play the track to trigger sync search
      playTrack(track, queue);
      toast.info('Avvio sincronizzazione...');
    };

    const handleAddToQueue = (e: React.MouseEvent) => {
      e.stopPropagation();
      addToQueue([track]);
      toast.success('Aggiunto alla coda');
    };

    const formatDuration = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const tap = useTap({ onTap: handleClick });

    return (
      <div
        ref={ref}
        {...tap}
        className={cn(
          "group flex items-center gap-3 md:gap-4 p-2 md:p-3 rounded-lg cursor-pointer transition-all duration-200 touch-manipulation",
          "hover:bg-secondary/80 active:scale-[0.99]",
          isCurrentTrack && "bg-secondary"
        )}
      >
        {/* Index or Play button */}
        <div className="w-6 md:w-8 h-6 md:h-8 flex items-center justify-center flex-shrink-0">
          {index !== undefined && (
            <span className={cn(
              "text-xs md:text-sm text-muted-foreground group-hover:hidden",
              isCurrentTrack && "text-primary hidden"
            )}>
              {index + 1}
            </span>
          )}
          <div className={cn(
            "hidden group-hover:flex items-center justify-center",
            isCurrentTrack && "flex",
            index === undefined && "flex"
          )}>
            {isCurrentTrack && isPlaying ? (
              <Pause className="w-4 h-4 text-primary" />
            ) : (
              <Play className="w-4 h-4 text-foreground ml-0.5" />
            )}
          </div>
        </div>

        {/* Cover */}
        <div className="w-10 h-10 md:w-10 md:h-10 rounded bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
          {track.coverUrl ? (
            <img src={track.coverUrl} alt={track.album} className="w-full h-full object-cover" />
          ) : (
            <Music className="w-4 h-4 text-muted-foreground" />
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
            {/* Sync status icon - only show when synced or syncing/downloading */}
            {showSyncStatus && showCloudIcon && (
              <Cloud 
                className={cn(
                  "w-3.5 h-3.5 flex-shrink-0",
                  isSynced ? "text-green-500" : "text-primary",
                  shouldPulse && "animate-pulse"
                )} 
              />
            )}
          </div>
          {showArtist && (
            <p className="text-xs md:text-sm text-muted-foreground truncate">{track.artist}</p>
          )}
        </div>

        {/* Favorite button */}
        {showFavorite && (
          <FavoriteButton
            itemType="track"
            item={track}
            size="sm"
            className="opacity-0 group-hover:opacity-100 transition-opacity"
          />
        )}

        {/* Duration */}
        <span className="text-xs md:text-sm text-muted-foreground flex-shrink-0">
          {formatDuration(track.duration)}
        </span>

        {/* More menu */}
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
            <DropdownMenuItem onClick={handleAddToQueue} className="cursor-pointer">
              <ListPlus className="w-4 h-4 mr-2" />
              Aggiungi alla coda
            </DropdownMenuItem>
            {isSynced ? (
              <DropdownMenuItem onClick={handleRemoveSync} className="cursor-pointer text-destructive focus:text-destructive">
                <CloudOff className="w-4 h-4 mr-2" />
                Rimuovi sincronizzazione
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={handleSync} className="cursor-pointer">
                <CloudUpload className="w-4 h-4 mr-2" />
                Sincronizza
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }
);

TrackCard.displayName = 'TrackCard';

export default TrackCard;
