import React from 'react';
import { Track } from '@/types/music';
import { usePlayer } from '@/contexts/PlayerContext';
import { Play, Pause, Music } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TrackCardProps {
  track: Track;
  queue?: Track[];
  showArtist?: boolean;
  index?: number;
}

const TrackCard: React.FC<TrackCardProps> = ({ track, queue, showArtist = true, index }) => {
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
      onClick={handleClick}
      className={cn(
        "group flex items-center gap-4 p-3 rounded-lg cursor-pointer transition-all duration-200",
        "hover:bg-secondary/80",
        isCurrentTrack && "bg-secondary"
      )}
    >
      {/* Index or Play button */}
      <div className="w-8 h-8 flex items-center justify-center">
        {index !== undefined && (
          <span className={cn(
            "text-sm text-muted-foreground group-hover:hidden",
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
      <div className="w-10 h-10 rounded bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
        {track.coverUrl ? (
          <img src={track.coverUrl} alt={track.album} className="w-full h-full object-cover" />
        ) : (
          <Music className="w-4 h-4 text-muted-foreground" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className={cn(
          "font-medium truncate",
          isCurrentTrack ? "text-primary" : "text-foreground"
        )}>
          {track.title}
        </p>
        {showArtist && (
          <p className="text-sm text-muted-foreground truncate">{track.artist}</p>
        )}
      </div>

      {/* Duration */}
      <span className="text-sm text-muted-foreground">
        {formatDuration(track.duration)}
      </span>
    </div>
  );
};

export default TrackCard;
