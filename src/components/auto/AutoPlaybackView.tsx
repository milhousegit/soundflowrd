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
      <div className="h-full flex flex-col items-center justify-center p-8 text-center">
        <div className="w-32 h-32 rounded-2xl bg-muted flex items-center justify-center mb-6">
          <Music className="w-16 h-16 text-muted-foreground" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Nessuna riproduzione</h2>
        <p className="text-muted-foreground">Cerca o seleziona un brano per iniziare</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col md:flex-row items-center justify-center p-6 md:p-12 gap-8">
      {/* Album Art */}
      <div className="w-48 h-48 md:w-64 md:h-64 lg:w-80 lg:h-80 rounded-2xl overflow-hidden shadow-2xl flex-shrink-0">
        {currentTrack.coverUrl ? (
          <img 
            src={currentTrack.coverUrl} 
            alt={currentTrack.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-muted flex items-center justify-center">
            <Music className="w-24 h-24 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Track Info & Controls */}
      <div className="flex flex-col items-center md:items-start flex-1 max-w-lg">
        {/* Track Info */}
        <div className="text-center md:text-left mb-8">
          <h1 className="text-2xl md:text-4xl font-bold text-foreground mb-2 line-clamp-2">
            {currentTrack.title}
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground mb-1">
            {currentTrack.artist}
          </p>
          {currentTrack.album && (
            <p className="text-sm md:text-base text-muted-foreground/70">
              {currentTrack.album}
            </p>
          )}
        </div>

        {/* Main Controls */}
        <div className="flex items-center gap-6 mb-8">
          <Button
            variant="ghost"
            size="icon"
            onClick={previous}
            className="w-16 h-16"
          >
            <SkipBack className="w-10 h-10" />
          </Button>
          
          <Button
            variant="player"
            size="icon"
            onClick={toggle}
            className="w-20 h-20"
          >
            {isPlaying ? (
              <Pause className="w-12 h-12" />
            ) : (
              <Play className="w-12 h-12 ml-1" />
            )}
          </Button>
          
          <Button
            variant="ghost"
            size="icon"
            onClick={next}
            className="w-16 h-16"
          >
            <SkipForward className="w-10 h-10" />
          </Button>
        </div>

        {/* Secondary Controls */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleToggleFavorite}
            className="w-12 h-12"
          >
            <Heart 
              className={cn(
                "w-7 h-7",
                isLiked ? "fill-primary text-primary" : "text-muted-foreground"
              )} 
            />
          </Button>
          
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleShuffle}
            className={cn("w-12 h-12", isShuffled && "text-primary")}
          >
            <Shuffle className="w-7 h-7" />
          </Button>
          
          <div className="flex items-center gap-2 px-3 py-2 bg-secondary rounded-lg">
            <ListMusic className="w-5 h-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">{queue.length} in coda</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AutoPlaybackView;
