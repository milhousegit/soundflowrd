import React, { forwardRef } from 'react';
import { Track } from '@/types/music';
import { usePlayer } from '@/contexts/PlayerContext';
import { Play, Pause, Music } from 'lucide-react';
import { cn } from '@/lib/utils';
import FavoriteButton from './FavoriteButton';

interface TrackCardProps {
  track: Track;
  queue?: Track[];
  showArtist?: boolean;
  showFavorite?: boolean;
  index?: number;
}

const TrackCard = forwardRef<HTMLDivElement, TrackCardProps>(
  ({ track, queue, showArtist = true, showFavorite = true, index }, ref) => {
    const { currentTrack, isPlaying, playTrack, toggle } = usePlayer();
    const isCurrentTrack = currentTrack?.id === track.id;

    const handleClick = () => {
      if (isCurrentTrack) {
        toggle();
      } else {
        playTrack(track, queue);
      }
    };

    const formatDuration = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
      <div
        ref={ref}
        onClick={handleClick}
        onTouchEnd={(e) => {
          e.preventDefault();
          handleClick();
        }}
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
          <p className={cn(
            "font-medium text-sm md:text-base truncate",
            isCurrentTrack ? "text-primary" : "text-foreground"
          )}>
            {track.title}
          </p>
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
      </div>
    );
  }
);

TrackCard.displayName = 'TrackCard';

export default TrackCard;
