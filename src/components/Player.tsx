import React from 'react';
import { usePlayer } from '@/contexts/PlayerContext';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Volume2, 
  VolumeX,
  Music
} from 'lucide-react';
import { cn } from '@/lib/utils';

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const Player: React.FC = () => {
  const { 
    currentTrack, 
    isPlaying, 
    progress, 
    duration, 
    volume,
    toggle, 
    next, 
    previous, 
    seek,
    setVolume 
  } = usePlayer();

  if (!currentTrack) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 h-24 glass border-t border-border z-50 animate-slide-up">
      <div className="h-full flex items-center px-6 gap-6">
        {/* Track Info */}
        <div className="flex items-center gap-4 w-72 min-w-0">
          <div className="w-14 h-14 rounded-lg bg-secondary flex items-center justify-center overflow-hidden flex-shrink-0">
            {currentTrack.coverUrl ? (
              <img 
                src={currentTrack.coverUrl} 
                alt={currentTrack.album}
                className={cn(
                  "w-full h-full object-cover",
                  isPlaying && "animate-spin-slow"
                )}
                style={{ animationDuration: '8s' }}
              />
            ) : (
              <Music className="w-6 h-6 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-foreground truncate">{currentTrack.title}</p>
            <p className="text-sm text-muted-foreground truncate">{currentTrack.artist}</p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex-1 flex flex-col items-center gap-2 max-w-2xl">
          <div className="flex items-center gap-4">
            <Button 
              variant="playerSecondary" 
              size="iconSm"
              onClick={previous}
            >
              <SkipBack className="w-5 h-5" />
            </Button>
            <Button 
              variant="player" 
              size="player"
              onClick={toggle}
            >
              {isPlaying ? (
                <Pause className="w-5 h-5" />
              ) : (
                <Play className="w-5 h-5 ml-0.5" />
              )}
            </Button>
            <Button 
              variant="playerSecondary" 
              size="iconSm"
              onClick={next}
            >
              <SkipForward className="w-5 h-5" />
            </Button>
          </div>

          <div className="w-full flex items-center gap-3">
            <span className="text-xs text-muted-foreground w-10 text-right">
              {formatTime(progress)}
            </span>
            <Slider
              value={[progress]}
              max={duration || 100}
              step={1}
              onValueChange={([value]) => seek(value)}
              className="flex-1"
            />
            <span className="text-xs text-muted-foreground w-10">
              {formatTime(duration)}
            </span>
          </div>
        </div>

        {/* Volume */}
        <div className="flex items-center gap-3 w-40">
          <Button 
            variant="playerSecondary" 
            size="iconSm"
            onClick={() => setVolume(volume === 0 ? 0.7 : 0)}
          >
            {volume === 0 ? (
              <VolumeX className="w-5 h-5" />
            ) : (
              <Volume2 className="w-5 h-5" />
            )}
          </Button>
          <Slider
            value={[volume * 100]}
            max={100}
            step={1}
            onValueChange={([value]) => setVolume(value / 100)}
            className="flex-1"
          />
        </div>
      </div>
    </div>
  );
};

export default Player;
