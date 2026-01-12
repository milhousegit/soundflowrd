import React from 'react';
import { Play, Pause, SkipBack, SkipForward, Shuffle, ListMusic, Heart, Music } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePlayer } from '@/contexts/PlayerContext';
import { useFavorites } from '@/hooks/useFavorites';
import { cn } from '@/lib/utils';

const AutoPlaybackView: React.FC = () => {
  const { 
    currentTrack, 
    isPlaying, 
    toggle, 
    next, 
    previous, 
    isShuffled, 
    toggleShuffle,
    queue 
  } = usePlayer();
  const { isFavorite, toggleFavorite } = useFavorites();

  const isLiked = currentTrack ? isFavorite('track', currentTrack.id) : false;

  const handleToggleFavorite = async () => {
    if (currentTrack) {
      await toggleFavorite('track', currentTrack);
    }
  };

  if (!currentTrack) {
    return (
      <div className="h-full flex flex-row items-center justify-center p-6 gap-8">
        <div className="w-40 h-40 rounded-2xl bg-muted flex items-center justify-center">
          <Music className="w-20 h-20 text-muted-foreground" />
        </div>
        <div className="text-left">
          <h2 className="text-2xl font-bold text-foreground mb-2">Nessuna riproduzione</h2>
          <p className="text-muted-foreground">Cerca o seleziona un brano</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-row items-center justify-center px-8 py-4 gap-8">
      {/* Album Art - Left side */}
      <div className="h-[70vh] aspect-square max-h-[300px] rounded-2xl overflow-hidden shadow-2xl shrink-0">
        {currentTrack.coverUrl ? (
          <img 
            src={currentTrack.coverUrl} 
            alt={currentTrack.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-muted flex items-center justify-center">
            <Music className="w-20 h-20 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Track Info & Controls - Right side */}
      <div className="flex flex-col justify-center flex-1 max-w-md">
        {/* Track Info */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-foreground mb-1 line-clamp-1">
            {currentTrack.title}
          </h1>
          <p className="text-lg text-muted-foreground line-clamp-1">
            {currentTrack.artist}
          </p>
          {currentTrack.album && (
            <p className="text-sm text-muted-foreground/70 line-clamp-1">
              {currentTrack.album}
            </p>
          )}
        </div>

        {/* Main Controls */}
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={previous}
            className="w-14 h-14"
          >
            <SkipBack className="w-8 h-8" />
          </Button>
          
          <Button
            variant="player"
            size="icon"
            onClick={toggle}
            className="w-18 h-18"
          >
            {isPlaying ? (
              <Pause className="w-10 h-10" />
            ) : (
              <Play className="w-10 h-10 ml-1" />
            )}
          </Button>
          
          <Button
            variant="ghost"
            size="icon"
            onClick={next}
            className="w-14 h-14"
          >
            <SkipForward className="w-8 h-8" />
          </Button>
        </div>

        {/* Secondary Controls */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleToggleFavorite}
            className="w-11 h-11"
          >
            <Heart 
              className={cn(
                "w-6 h-6",
                isLiked ? "fill-primary text-primary" : "text-muted-foreground"
              )} 
            />
          </Button>
          
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleShuffle}
            className={cn("w-11 h-11", isShuffled && "text-primary")}
          >
            <Shuffle className="w-6 h-6" />
          </Button>
          
          <div className="flex items-center gap-2 px-3 py-2 bg-secondary rounded-lg ml-2">
            <ListMusic className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{queue.length}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AutoPlaybackView;
