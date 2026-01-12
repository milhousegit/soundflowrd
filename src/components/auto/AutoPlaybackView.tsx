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
    <div className="h-full flex flex-row items-center justify-center px-12 py-6 gap-12">
      {/* Album Art - Left side */}
      <div className="h-[75vh] aspect-square max-h-[280px] rounded-2xl overflow-hidden shadow-2xl shrink-0">
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

      {/* Track Info & Controls - Right side - Centered */}
      <div className="flex flex-col justify-center items-center flex-1 max-w-lg">
        {/* Track Info */}
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-foreground mb-2 line-clamp-1">
            {currentTrack.title}
          </h1>
          <p className="text-xl text-muted-foreground line-clamp-1">
            {currentTrack.artist}
          </p>
          {currentTrack.album && (
            <p className="text-base text-muted-foreground/70 line-clamp-1 mt-1">
              {currentTrack.album}
            </p>
          )}
        </div>

        {/* Main Controls - Bigger buttons */}
        <div className="flex items-center justify-center gap-6 mb-8">
          <Button
            variant="ghost"
            size="icon"
            onClick={previous}
            className="w-20 h-20 rounded-full"
          >
            <SkipBack className="w-10 h-10" />
          </Button>
          
          <Button
            variant="player"
            size="icon"
            onClick={toggle}
            className="w-24 h-24 rounded-full"
          >
            {isPlaying ? (
              <Pause className="w-14 h-14" />
            ) : (
              <Play className="w-14 h-14 ml-2" />
            )}
          </Button>
          
          <Button
            variant="ghost"
            size="icon"
            onClick={next}
            className="w-20 h-20 rounded-full"
          >
            <SkipForward className="w-10 h-10" />
          </Button>
        </div>

        {/* Secondary Controls - Centered */}
        <div className="flex items-center justify-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleToggleFavorite}
            className="w-14 h-14 rounded-full"
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
            className={cn("w-14 h-14 rounded-full", isShuffled && "text-primary")}
          >
            <Shuffle className="w-7 h-7" />
          </Button>
          
          <div className="flex items-center gap-2 px-4 py-2 bg-secondary rounded-full ml-2">
            <ListMusic className="w-5 h-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground font-medium">{queue.length}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AutoPlaybackView;
