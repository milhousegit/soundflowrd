import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { X, ChevronLeft, ChevronRight, Music, Clock, Heart, Mic2, MessageCircle, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSettings } from '@/contexts/SettingsContext';
import { cn } from '@/lib/utils';

interface WrappedStoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  displayName?: string;
}

// Mock data for Wrapped
const wrappedData = {
  totalMinutes: 42680,
  topArtist: {
    name: 'Drake',
    imageUrl: 'https://e-cdns-images.dzcdn.net/images/artist/5d2fa7f140a6bdc2c864c3465a61fc71/500x500-000000-80-0-0.jpg',
    minutesListened: 8420,
    songsPlayed: 347
  },
  topTracks: [
    { title: 'Hotline Bling', artist: 'Drake', plays: 127 },
    { title: 'One Dance', artist: 'Drake', plays: 98 },
    { title: 'God\'s Plan', artist: 'Drake', plays: 87 },
    { title: 'Blinding Lights', artist: 'The Weeknd', plays: 76 },
    { title: 'Shape of You', artist: 'Ed Sheeran', plays: 65 }
  ],
  topGenres: [
    { name: 'Hip-Hop', percentage: 42 },
    { name: 'Pop', percentage: 28 },
    { name: 'R&B', percentage: 18 },
    { name: 'Electronic', percentage: 12 }
  ],
  socialStats: {
    posts: 34,
    comments: 156,
    likes: 892
  },
  topAlbums: [
    { title: 'Scorpion', artist: 'Drake' },
    { title: 'After Hours', artist: 'The Weeknd' },
    { title: 'Divide', artist: 'Ed Sheeran' }
  ]
};

const WrappedStoryModal: React.FC<WrappedStoryModalProps> = ({
  open,
  onOpenChange,
  displayName
}) => {
  const { settings } = useSettings();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [progress, setProgress] = useState(0);
  const totalSlides = 6;
  const slideDuration = 6000; // 6 seconds per slide

  useEffect(() => {
    if (!open) {
      setCurrentSlide(0);
      setProgress(0);
      return;
    }

    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          if (currentSlide < totalSlides - 1) {
            setCurrentSlide(s => s + 1);
            return 0;
          } else {
            onOpenChange(false);
            return 0;
          }
        }
        return prev + (100 / (slideDuration / 50));
      });
    }, 50);

    return () => clearInterval(progressInterval);
  }, [open, currentSlide, onOpenChange]);

  const goToSlide = (direction: 'prev' | 'next') => {
    setProgress(0);
    if (direction === 'next' && currentSlide < totalSlides - 1) {
      setCurrentSlide(s => s + 1);
    } else if (direction === 'prev' && currentSlide > 0) {
      setCurrentSlide(s => s - 1);
    }
  };

  const handleTap = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const isLeftSide = x < rect.width / 2;
    goToSlide(isLeftSide ? 'prev' : 'next');
  };

  const renderSlide = () => {
    switch (currentSlide) {
      case 0:
        return (
          <div className="flex flex-col items-center justify-center h-full text-center p-6 animate-fade-in">
            <h1 className="text-4xl font-bold text-primary mb-4">WRAPPED 2026</h1>
            <p className="text-xl text-foreground/90 mb-2">
              {settings.language === 'it' ? 'Ciao' : 'Hey'}, {displayName || 'User'}!
            </p>
            <p className="text-muted-foreground">
              {settings.language === 'it' 
                ? 'Ecco il tuo anno in musica' 
                : 'Here\'s your year in music'}
            </p>
            <div className="mt-8 w-32 h-32 rounded-full bg-gradient-to-br from-primary to-accent animate-pulse-slow" />
          </div>
        );

      case 1:
        return (
          <div className="flex flex-col items-center justify-center h-full text-center p-6 animate-fade-in">
            <Clock className="w-12 h-12 text-primary mb-4" />
            <p className="text-muted-foreground mb-2">
              {settings.language === 'it' ? 'Hai ascoltato musica per' : 'You listened to music for'}
            </p>
            <h2 className="text-5xl font-bold text-foreground mb-2">
              {Math.round(wrappedData.totalMinutes / 60).toLocaleString()}
            </h2>
            <p className="text-2xl text-primary font-semibold">
              {settings.language === 'it' ? 'ore' : 'hours'}
            </p>
            <p className="text-sm text-muted-foreground mt-4">
              {settings.language === 'it' 
                ? `Circa ${Math.round(wrappedData.totalMinutes / 60 / 24)} giorni di musica non-stop!`
                : `That's about ${Math.round(wrappedData.totalMinutes / 60 / 24)} days of non-stop music!`}
            </p>
          </div>
        );

      case 2:
        return (
          <div className="flex flex-col items-center justify-center h-full text-center p-6 animate-fade-in">
            <Mic2 className="w-12 h-12 text-primary mb-4" />
            <p className="text-muted-foreground mb-4">
              {settings.language === 'it' ? 'Il tuo artista #1' : 'Your #1 artist'}
            </p>
            <div className="w-32 h-32 rounded-full overflow-hidden mb-4 ring-4 ring-primary">
              <img 
                src={wrappedData.topArtist.imageUrl} 
                alt={wrappedData.topArtist.name}
                className="w-full h-full object-cover"
              />
            </div>
            <h2 className="text-3xl font-bold text-foreground">{wrappedData.topArtist.name}</h2>
            <p className="text-muted-foreground mt-2">
              {Math.round(wrappedData.topArtist.minutesListened / 60)} {settings.language === 'it' ? 'ore' : 'hours'} • {wrappedData.topArtist.songsPlayed} {settings.language === 'it' ? 'brani' : 'songs'}
            </p>
          </div>
        );

      case 3:
        return (
          <div className="flex flex-col h-full p-6 animate-fade-in">
            <div className="text-center mb-6">
              <Music className="w-10 h-10 text-primary mx-auto mb-2" />
              <h2 className="text-2xl font-bold">
                {settings.language === 'it' ? 'Le tue top 5 canzoni' : 'Your top 5 songs'}
              </h2>
            </div>
            <div className="space-y-3 flex-1">
              {wrappedData.topTracks.map((track, index) => (
                <div 
                  key={index}
                  className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <span className="text-2xl font-bold text-primary w-8">{index + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{track.title}</p>
                    <p className="text-sm text-muted-foreground truncate">{track.artist}</p>
                  </div>
                  <span className="text-sm text-muted-foreground">{track.plays} plays</span>
                </div>
              ))}
            </div>
          </div>
        );

      case 4:
        return (
          <div className="flex flex-col items-center justify-center h-full p-6 animate-fade-in">
            <Heart className="w-10 h-10 text-primary mb-4" />
            <h2 className="text-2xl font-bold mb-6">
              {settings.language === 'it' ? 'I tuoi generi preferiti' : 'Your favorite genres'}
            </h2>
            <div className="w-full max-w-xs space-y-4">
              {wrappedData.topGenres.map((genre, index) => (
                <div key={index}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium">{genre.name}</span>
                    <span className="text-muted-foreground">{genre.percentage}%</span>
                  </div>
                  <div className="h-3 bg-secondary rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-primary to-accent rounded-full transition-all duration-1000"
                      style={{ 
                        width: `${genre.percentage}%`,
                        animationDelay: `${index * 200}ms`
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      case 5:
        return (
          <div className="flex flex-col items-center justify-center h-full p-6 animate-fade-in">
            <MessageCircle className="w-10 h-10 text-primary mb-4" />
            <h2 className="text-2xl font-bold mb-6">
              {settings.language === 'it' ? 'La tua attività social' : 'Your social activity'}
            </h2>
            <div className="grid grid-cols-3 gap-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-foreground">{wrappedData.socialStats.posts}</p>
                <p className="text-sm text-muted-foreground">Post</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-foreground">{wrappedData.socialStats.comments}</p>
                <p className="text-sm text-muted-foreground">
                  {settings.language === 'it' ? 'Commenti' : 'Comments'}
                </p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-foreground">{wrappedData.socialStats.likes}</p>
                <p className="text-sm text-muted-foreground">
                  {settings.language === 'it' ? 'Like dati' : 'Likes given'}
                </p>
              </div>
            </div>
            <div className="mt-8">
              <Button 
                variant="outline" 
                className="gap-2"
                onClick={(e) => {
                  e.stopPropagation();
                  // TODO: Share functionality
                }}
              >
                <Share2 className="w-4 h-4" />
                {settings.language === 'it' ? 'Condividi' : 'Share'}
              </Button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm h-[85vh] p-0 overflow-hidden bg-gradient-to-b from-card to-background border-none">
        {/* Progress bars */}
        <div className="absolute top-0 left-0 right-0 z-20 flex gap-1 p-2">
          {Array.from({ length: totalSlides }).map((_, index) => (
            <div key={index} className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
              <div 
                className={cn(
                  "h-full bg-primary transition-all duration-100",
                  index < currentSlide ? "w-full" : index === currentSlide ? "" : "w-0"
                )}
                style={{
                  width: index === currentSlide ? `${progress}%` : index < currentSlide ? '100%' : '0%'
                }}
              />
            </div>
          ))}
        </div>

        {/* Close button */}
        <button
          onClick={() => onOpenChange(false)}
          className="absolute top-6 right-3 z-20 p-2 rounded-full bg-background/50 hover:bg-background/70 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Navigation areas */}
        <div 
          className="absolute inset-0 z-10 flex"
          onClick={handleTap}
        >
          <div className="flex-1" />
          <div className="flex-1" />
        </div>

        {/* Content */}
        <div className="relative h-full pt-8">
          {renderSlide()}
        </div>

        {/* Navigation arrows - desktop only */}
        <div className="hidden sm:flex absolute inset-y-0 left-0 items-center z-20">
          <button
            onClick={(e) => { e.stopPropagation(); goToSlide('prev'); }}
            disabled={currentSlide === 0}
            className="p-2 text-foreground/50 hover:text-foreground disabled:opacity-30 transition-all"
          >
            <ChevronLeft className="w-8 h-8" />
          </button>
        </div>
        <div className="hidden sm:flex absolute inset-y-0 right-0 items-center z-20">
          <button
            onClick={(e) => { e.stopPropagation(); goToSlide('next'); }}
            disabled={currentSlide === totalSlides - 1}
            className="p-2 text-foreground/50 hover:text-foreground disabled:opacity-30 transition-all"
          >
            <ChevronRight className="w-8 h-8" />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default WrappedStoryModal;
