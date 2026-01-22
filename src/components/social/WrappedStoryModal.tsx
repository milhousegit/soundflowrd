import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ChevronLeft, ChevronRight, Music, Clock, Heart, Mic2, MessageCircle, Share2, Sparkles } from 'lucide-react';
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
    { name: 'Hip-Hop', percentage: 42, color: 'from-primary to-cyan-400' },
    { name: 'Pop', percentage: 28, color: 'from-purple-500 to-pink-500' },
    { name: 'R&B', percentage: 18, color: 'from-orange-500 to-red-500' },
    { name: 'Electronic', percentage: 12, color: 'from-blue-500 to-indigo-500' }
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

  // Get slide-specific gradient
  const getSlideGradient = () => {
    const gradients = [
      'from-primary/20 via-purple-500/20 to-pink-500/20',
      'from-blue-600/30 via-cyan-500/20 to-primary/20',
      'from-purple-600/30 via-pink-500/20 to-orange-500/20',
      'from-green-600/30 via-emerald-500/20 to-cyan-500/20',
      'from-orange-600/30 via-red-500/20 to-pink-500/20',
      'from-indigo-600/30 via-purple-500/20 to-pink-500/20',
    ];
    return gradients[currentSlide] || gradients[0];
  };

  const renderSlide = () => {
    switch (currentSlide) {
      case 0:
        return (
          <div className="flex flex-col items-center justify-center h-full text-center p-6 animate-wrapped-slide-in">
            <div className="relative">
              <Sparkles className="absolute -top-4 -left-4 w-6 h-6 text-yellow-400 animate-pulse" />
              <Sparkles className="absolute -top-2 -right-6 w-4 h-4 text-pink-400 animate-pulse delay-100" />
              <h1 className="text-5xl font-black bg-gradient-to-r from-primary via-purple-500 to-pink-500 bg-clip-text text-transparent mb-4 animate-text-shimmer">
                WRAPPED 2026
              </h1>
            </div>
            <p className="text-xl text-foreground/90 mb-2">
              {settings.language === 'it' ? 'Ciao' : 'Hey'}, {displayName || 'User'}! ✨
            </p>
            <p className="text-muted-foreground">
              {settings.language === 'it' 
                ? 'Ecco il tuo anno in musica' 
                : 'Here\'s your year in music'}
            </p>
            <div className="mt-8 relative">
              <div className="w-32 h-32 rounded-full bg-gradient-to-br from-primary via-purple-500 to-pink-500 animate-pulse-glow" />
              <div className="absolute inset-2 rounded-full bg-gradient-to-tr from-primary/50 to-transparent animate-spin-slow" />
            </div>
          </div>
        );

      case 1:
        return (
          <div className="flex flex-col items-center justify-center h-full text-center p-6 animate-wrapped-slide-in">
            <div className="p-4 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 mb-4 animate-bounce-slow">
              <Clock className="w-10 h-10 text-white" />
            </div>
            <p className="text-muted-foreground mb-2">
              {settings.language === 'it' ? 'Hai ascoltato musica per' : 'You listened to music for'}
            </p>
            <h2 className="text-6xl font-black bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent mb-2 animate-number-pop">
              {Math.round(wrappedData.totalMinutes / 60).toLocaleString()}
            </h2>
            <p className="text-2xl text-primary font-bold">
              {settings.language === 'it' ? 'ore' : 'hours'} 🎧
            </p>
            <p className="text-sm text-muted-foreground mt-4 bg-secondary/50 px-4 py-2 rounded-full">
              {settings.language === 'it' 
                ? `🔥 Circa ${Math.round(wrappedData.totalMinutes / 60 / 24)} giorni di musica non-stop!`
                : `🔥 That's about ${Math.round(wrappedData.totalMinutes / 60 / 24)} days of non-stop music!`}
            </p>
          </div>
        );

      case 2:
        return (
          <div className="flex flex-col items-center justify-center h-full text-center p-6 animate-wrapped-slide-in">
            <div className="p-3 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 mb-4">
              <Mic2 className="w-8 h-8 text-white" />
            </div>
            <p className="text-muted-foreground mb-4">
              {settings.language === 'it' ? 'Il tuo artista #1' : 'Your #1 artist'} 👑
            </p>
            <div className="relative mb-4">
              <div className="absolute -inset-2 rounded-full bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500 animate-spin-slow blur-sm" />
              <div className="relative w-36 h-36 rounded-full overflow-hidden ring-4 ring-background">
                <img 
                  src={wrappedData.topArtist.imageUrl} 
                  alt={wrappedData.topArtist.name}
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
            <h2 className="text-3xl font-black bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              {wrappedData.topArtist.name}
            </h2>
            <div className="flex gap-4 mt-3">
              <div className="bg-secondary/50 px-3 py-1.5 rounded-full text-sm">
                ⏱️ {Math.round(wrappedData.topArtist.minutesListened / 60)} {settings.language === 'it' ? 'ore' : 'hrs'}
              </div>
              <div className="bg-secondary/50 px-3 py-1.5 rounded-full text-sm">
                🎵 {wrappedData.topArtist.songsPlayed} {settings.language === 'it' ? 'brani' : 'songs'}
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="flex flex-col h-full p-6 animate-wrapped-slide-in">
            <div className="text-center mb-4">
              <div className="inline-flex p-2 rounded-full bg-gradient-to-br from-green-500 to-emerald-400 mb-2">
                <Music className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-2xl font-bold">
                {settings.language === 'it' ? 'Le tue top 5 canzoni' : 'Your top 5 songs'} 🎶
              </h2>
            </div>
            <div className="space-y-2.5 flex-1">
              {wrappedData.topTracks.map((track, index) => (
                <div 
                  key={index}
                  className="flex items-center gap-3 p-2.5 rounded-xl bg-gradient-to-r from-secondary/80 to-secondary/40 backdrop-blur-sm animate-slide-in-stagger"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <span className={cn(
                    "text-xl font-black w-8 h-8 rounded-full flex items-center justify-center",
                    index === 0 && "bg-gradient-to-br from-yellow-400 to-orange-500 text-white",
                    index === 1 && "bg-gradient-to-br from-gray-300 to-gray-400 text-gray-800",
                    index === 2 && "bg-gradient-to-br from-orange-600 to-orange-700 text-white",
                    index > 2 && "bg-secondary text-muted-foreground"
                  )}>
                    {index + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate text-sm">{track.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{track.artist}</p>
                  </div>
                  <span className="text-xs text-primary font-medium bg-primary/10 px-2 py-1 rounded-full">
                    {track.plays}×
                  </span>
                </div>
              ))}
            </div>
          </div>
        );

      case 4:
        return (
          <div className="flex flex-col items-center justify-center h-full p-6 animate-wrapped-slide-in">
            <div className="p-3 rounded-full bg-gradient-to-br from-orange-500 to-red-500 mb-4">
              <Heart className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-2xl font-bold mb-6">
              {settings.language === 'it' ? 'I tuoi generi preferiti' : 'Your favorite genres'} 💖
            </h2>
            <div className="w-full max-w-xs space-y-4">
              {wrappedData.topGenres.map((genre, index) => (
                <div key={index} className="animate-slide-in-stagger" style={{ animationDelay: `${index * 150}ms` }}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="font-semibold">{genre.name}</span>
                    <span className="text-muted-foreground font-medium">{genre.percentage}%</span>
                  </div>
                  <div className="h-4 bg-secondary/50 rounded-full overflow-hidden backdrop-blur-sm">
                    <div 
                      className={cn(
                        "h-full rounded-full transition-all duration-1000 bg-gradient-to-r",
                        genre.color
                      )}
                      style={{ 
                        width: `${genre.percentage}%`,
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
          <div className="flex flex-col items-center justify-center h-full p-6 animate-wrapped-slide-in">
            <div className="p-3 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 mb-4">
              <MessageCircle className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-2xl font-bold mb-6">
              {settings.language === 'it' ? 'La tua attività social' : 'Your social activity'} 🌟
            </h2>
            <div className="grid grid-cols-3 gap-4 w-full max-w-xs">
              <div className="text-center p-4 rounded-2xl bg-gradient-to-br from-pink-500/20 to-purple-500/20 backdrop-blur-sm">
                <p className="text-3xl font-black text-pink-400">{wrappedData.socialStats.posts}</p>
                <p className="text-xs text-muted-foreground mt-1">Post</p>
              </div>
              <div className="text-center p-4 rounded-2xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 backdrop-blur-sm">
                <p className="text-3xl font-black text-cyan-400">{wrappedData.socialStats.comments}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {settings.language === 'it' ? 'Commenti' : 'Comments'}
                </p>
              </div>
              <div className="text-center p-4 rounded-2xl bg-gradient-to-br from-red-500/20 to-orange-500/20 backdrop-blur-sm">
                <p className="text-3xl font-black text-orange-400">{wrappedData.socialStats.likes}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {settings.language === 'it' ? 'Like' : 'Likes'}
                </p>
              </div>
            </div>
            <div className="mt-8">
              <Button 
                className="gap-2 bg-gradient-to-r from-primary via-purple-500 to-pink-500 hover:opacity-90 border-0"
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
      <DialogContent className={cn(
        "max-w-sm h-[85vh] p-0 overflow-hidden border-none [&>button]:hidden",
        "bg-gradient-to-b from-card via-background to-card"
      )}>
        {/* Animated background gradient */}
        <div className={cn(
          "absolute inset-0 bg-gradient-to-br transition-all duration-700",
          getSlideGradient()
        )} />
        
        {/* Floating particles */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="absolute w-2 h-2 rounded-full bg-primary/30 animate-float"
              style={{
                left: `${15 + i * 15}%`,
                top: `${20 + (i % 3) * 25}%`,
                animationDelay: `${i * 0.5}s`,
                animationDuration: `${3 + i * 0.5}s`
              }}
            />
          ))}
        </div>

        {/* Progress bars */}
        <div className="absolute top-0 left-0 right-0 z-20 flex gap-1 p-3">
          {Array.from({ length: totalSlides }).map((_, index) => (
            <div key={index} className="flex-1 h-1 bg-white/20 rounded-full overflow-hidden backdrop-blur-sm">
              <div 
                className={cn(
                  "h-full rounded-full transition-all duration-100",
                  "bg-gradient-to-r from-primary via-purple-400 to-pink-400"
                )}
                style={{
                  width: index === currentSlide ? `${progress}%` : index < currentSlide ? '100%' : '0%'
                }}
              />
            </div>
          ))}
        </div>

        {/* Navigation areas */}
        <div 
          className="absolute inset-0 z-10 flex"
          onClick={handleTap}
        >
          <div className="flex-1" />
          <div className="flex-1" />
        </div>

        {/* Content */}
        <div className="relative h-full pt-8 z-[5]">
          {renderSlide()}
        </div>

        {/* Navigation arrows - desktop only */}
        <div className="hidden sm:flex absolute inset-y-0 left-0 items-center z-20">
          <button
            onClick={(e) => { e.stopPropagation(); goToSlide('prev'); }}
            disabled={currentSlide === 0}
            className="p-2 text-foreground/50 hover:text-foreground disabled:opacity-30 transition-all hover:scale-110"
          >
            <ChevronLeft className="w-8 h-8" />
          </button>
        </div>
        <div className="hidden sm:flex absolute inset-y-0 right-0 items-center z-20">
          <button
            onClick={(e) => { e.stopPropagation(); goToSlide('next'); }}
            disabled={currentSlide === totalSlides - 1}
            className="p-2 text-foreground/50 hover:text-foreground disabled:opacity-30 transition-all hover:scale-110"
          >
            <ChevronRight className="w-8 h-8" />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default WrappedStoryModal;
