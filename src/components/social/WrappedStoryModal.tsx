import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ChevronLeft, ChevronRight, Music, Clock, Heart, Mic2, MessageCircle, Sparkles, Disc3, Volume2, VolumeX, Users, ChevronDown } from 'lucide-react';
import { useSettings } from '@/contexts/SettingsContext';
import { usePlayer } from '@/contexts/PlayerContext';
import { useWrappedStats } from '@/hooks/useWrappedStats';
import { cn } from '@/lib/utils';
import { searchAll } from '@/lib/deezer';
import { Track } from '@/types/music';
import { Skeleton } from '@/components/ui/skeleton';

interface WrappedStoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  displayName?: string;
}

const SWIPE_THRESHOLD = 100;

const WrappedStoryModal: React.FC<WrappedStoryModalProps> = ({
  open,
  onOpenChange,
  displayName
}) => {
  const { settings } = useSettings();
  const { playTrack, currentTrack, isPlaying, toggle } = usePlayer();
  const wrappedStats = useWrappedStats();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const [wrappedTrack, setWrappedTrack] = useState<Track | null>(null);
  const [swipeY, setSwipeY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const previousTrackRef = useRef<Track | null>(null);
  const wasPlayingRef = useRef(false);
  const totalSlides = 8;
  const slideDuration = 6000;

  // Swipe down to close handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
    setIsDragging(true);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    
    const deltaY = e.touches[0].clientY - touchStartRef.current.y;
    const deltaX = Math.abs(e.touches[0].clientX - touchStartRef.current.x);
    
    // Only allow vertical swipe if it's more vertical than horizontal
    if (deltaY > 0 && deltaY > deltaX) {
      setSwipeY(deltaY);
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (swipeY > SWIPE_THRESHOLD) {
      onOpenChange(false);
    }
    setSwipeY(0);
    setIsDragging(false);
    touchStartRef.current = null;
  }, [swipeY, onOpenChange]);

  // Load and play background music when modal opens
  useEffect(() => {
    if (open && !wrappedTrack && wrappedStats.topTracks.length > 0) {
      // Save current playback state
      previousTrackRef.current = currentTrack;
      wasPlayingRef.current = isPlaying;
      
      // Search for top track to play as background
      const loadBackgroundMusic = async () => {
        try {
          const topTrack = wrappedStats.topTracks[0];
          const results = await searchAll(`${topTrack.title} ${topTrack.artist}`);
          if (results.tracks.length > 0) {
            const track = results.tracks[0];
            setWrappedTrack(track);
            playTrack(track, results.tracks.slice(0, 5));
            setIsMusicPlaying(true);
          }
        } catch (error) {
          console.error('Failed to load wrapped background music:', error);
        }
      };
      loadBackgroundMusic();
    }
    
    // Cleanup when modal closes
    if (!open && wrappedTrack) {
      setWrappedTrack(null);
      setIsMusicPlaying(false);
    }
  }, [open, wrappedStats.topTracks]);

  // Sync music playing state with player
  useEffect(() => {
    if (wrappedTrack && currentTrack?.id === wrappedTrack.id) {
      setIsMusicPlaying(isPlaying);
    }
  }, [isPlaying, currentTrack, wrappedTrack]);

  const toggleBackgroundMusic = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (wrappedTrack) {
      toggle();
    }
  };

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
      'from-violet-600/30 via-fuchsia-500/20 to-pink-500/20',
      'from-green-600/30 via-emerald-500/20 to-cyan-500/20',
      'from-amber-600/30 via-orange-500/20 to-red-500/20',
      'from-orange-600/30 via-red-500/20 to-pink-500/20',
      'from-indigo-600/30 via-purple-500/20 to-pink-500/20',
    ];
    return gradients[currentSlide] || gradients[0];
  };

  // Format hours nicely
  const formatHours = (minutes: number) => {
    const hours = minutes / 60;
    if (hours >= 1) {
      return Math.round(hours);
    }
    return Math.round(minutes);
  };

  const getHoursLabel = (minutes: number) => {
    const hours = minutes / 60;
    if (hours >= 1) {
      return settings.language === 'it' ? 'ore' : 'hours';
    }
    return settings.language === 'it' ? 'minuti' : 'minutes';
  };

  const renderSlide = () => {
    // Show loading state
    if (wrappedStats.isLoading) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center p-6">
          <Skeleton className="w-32 h-32 rounded-full mb-4" />
          <Skeleton className="w-48 h-8 mb-2" />
          <Skeleton className="w-32 h-4" />
        </div>
      );
    }

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
            <p className="text-xl text-foreground/90 mb-2 truncate max-w-full px-2">
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
              {formatHours(wrappedStats.totalMinutes).toLocaleString()}
            </h2>
            <p className="text-2xl text-primary font-bold">
              {getHoursLabel(wrappedStats.totalMinutes)} 🎧
            </p>
            <p className="text-sm text-muted-foreground mt-4 bg-secondary/50 px-4 py-2 rounded-full">
              {settings.language === 'it' 
                ? `🎵 ${wrappedStats.totalSongs} brani riprodotti!`
                : `🎵 ${wrappedStats.totalSongs} songs played!`}
            </p>
            {wrappedStats.totalMinutes >= 60 && (
              <p className="text-xs text-muted-foreground mt-2 bg-secondary/30 px-3 py-1 rounded-full">
                {settings.language === 'it' 
                  ? `🔥 Circa ${Math.round(wrappedStats.totalMinutes / 60 / 24)} giorni di musica non-stop!`
                  : `🔥 That's about ${Math.round(wrappedStats.totalMinutes / 60 / 24)} days of non-stop music!`}
              </p>
            )}
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
            {wrappedStats.topArtist ? (
              <>
                <div className="relative mb-4">
                  <div className="absolute -inset-2 rounded-full bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500 animate-spin-slow blur-sm" />
                  <div className="relative w-36 h-36 rounded-full overflow-hidden ring-4 ring-background">
                    <img 
                      src={wrappedStats.topArtist.imageUrl} 
                      alt={wrappedStats.topArtist.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = '/placeholder.svg';
                      }}
                    />
                  </div>
                </div>
                <h2 className="text-3xl font-black bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent truncate max-w-full px-2">
                  {wrappedStats.topArtist.name}
                </h2>
                <div className="flex gap-4 mt-3">
                  <div className="bg-secondary/50 px-3 py-1.5 rounded-full text-sm">
                    ⏱️ {Math.round(wrappedStats.topArtist.minutesListened / 60) || wrappedStats.topArtist.minutesListened} {wrappedStats.topArtist.minutesListened >= 60 ? (settings.language === 'it' ? 'ore' : 'hrs') : 'min'}
                  </div>
                  <div className="bg-secondary/50 px-3 py-1.5 rounded-full text-sm">
                    🎵 {wrappedStats.topArtist.songsPlayed} {settings.language === 'it' ? 'brani' : 'songs'}
                  </div>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">
                {settings.language === 'it' ? 'Nessun artista trovato' : 'No artist found'}
              </p>
            )}
          </div>
        );

      case 3:
        // Top 5 Artists slide
        const otherTopArtists = wrappedStats.topArtists.slice(1, 6);
        return (
          <div className="flex flex-col h-full p-6 animate-wrapped-slide-in">
            <div className="text-center mb-4">
              <div className="inline-flex p-2 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 mb-2">
                <Users className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-2xl font-bold">
                {settings.language === 'it' ? 'I tuoi top 5 artisti' : 'Your top 5 artists'} 🌟
              </h2>
            </div>
            <div className="space-y-2.5 flex-1">
              {otherTopArtists.length > 0 ? (
                otherTopArtists.map((artist, index) => (
                  <div 
                    key={artist.id}
                    className="flex items-center gap-3 p-2.5 rounded-xl bg-gradient-to-r from-secondary/80 to-secondary/40 backdrop-blur-sm animate-slide-in-stagger"
                    style={{ animationDelay: `${index * 100}ms` }}
                  >
                    <span className={cn(
                      "text-lg font-black w-7 h-7 rounded-full flex items-center justify-center shrink-0",
                      index === 0 && "bg-gradient-to-br from-gray-300 to-gray-400 text-gray-800",
                      index === 1 && "bg-gradient-to-br from-orange-600 to-orange-700 text-white",
                      index > 1 && "bg-secondary text-muted-foreground"
                    )}>
                      {index + 2}
                    </span>
                    <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 ring-2 ring-primary/20">
                      <img 
                        src={artist.imageUrl} 
                        alt={artist.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = '/placeholder.svg';
                        }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate text-sm">{artist.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {artist.songsPlayed} {settings.language === 'it' ? 'brani' : 'songs'}
                      </p>
                    </div>
                    <span className="text-xs text-primary font-medium bg-primary/10 px-2 py-1 rounded-full shrink-0">
                      {artist.minutesListened >= 60 
                        ? `${Math.round(artist.minutesListened / 60)}h`
                        : `${artist.minutesListened}m`
                      }
                    </span>
                  </div>
                ))
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-muted-foreground text-center">
                    {settings.language === 'it' 
                      ? 'Ascolta più artisti per vedere le statistiche!' 
                      : 'Listen to more artists to see stats!'}
                  </p>
                </div>
              )}
            </div>
          </div>
        );

      case 4:
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
              {wrappedStats.topTracks.length > 0 ? (
                wrappedStats.topTracks.map((track, index) => (
                  <div 
                    key={track.id}
                    className="flex items-center gap-3 p-2.5 rounded-xl bg-gradient-to-r from-secondary/80 to-secondary/40 backdrop-blur-sm animate-slide-in-stagger"
                    style={{ animationDelay: `${index * 100}ms` }}
                  >
                    <span className={cn(
                      "text-xl font-black w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                      index === 0 && "bg-gradient-to-br from-yellow-400 to-orange-500 text-white",
                      index === 1 && "bg-gradient-to-br from-gray-300 to-gray-400 text-gray-800",
                      index === 2 && "bg-gradient-to-br from-orange-600 to-orange-700 text-white",
                      index > 2 && "bg-secondary text-muted-foreground"
                    )}>
                      {index + 1}
                    </span>
                    {track.coverUrl && (
                      <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0">
                        <img 
                          src={track.coverUrl} 
                          alt={track.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate text-sm">{track.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{track.artist}</p>
                    </div>
                    <span className="text-xs text-primary font-medium bg-primary/10 px-2 py-1 rounded-full shrink-0">
                      {track.plays}×
                    </span>
                  </div>
                ))
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-muted-foreground text-center">
                    {settings.language === 'it' 
                      ? 'Ascolta più musica per vedere le statistiche!' 
                      : 'Listen to more music to see stats!'}
                  </p>
                </div>
              )}
            </div>
          </div>
        );

      case 5:
        return (
          <div className="flex flex-col h-full p-6 animate-wrapped-slide-in">
            <div className="text-center mb-4">
              <div className="inline-flex p-2 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 mb-2">
                <Disc3 className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-2xl font-bold">
                {settings.language === 'it' ? 'I tuoi album preferiti' : 'Your top albums'} 💿
              </h2>
            </div>
            <div className="flex-1 flex flex-col justify-center space-y-4">
              {wrappedStats.topAlbums.length > 0 ? (
                wrappedStats.topAlbums.map((album, index) => (
                    <div 
                      key={album.id}
                      className="flex items-center gap-3 p-3 rounded-2xl bg-gradient-to-r from-secondary/80 to-secondary/40 backdrop-blur-sm animate-slide-in-stagger overflow-hidden max-w-full"
                      style={{ animationDelay: `${index * 150}ms` }}
                    >
                      <div className="relative shrink-0">
                        <div className={cn(
                          "absolute -inset-1 rounded-xl blur-sm",
                          index === 0 && "bg-gradient-to-br from-yellow-400 to-orange-500",
                          index === 1 && "bg-gradient-to-br from-gray-300 to-gray-500",
                          index === 2 && "bg-gradient-to-br from-orange-600 to-amber-700"
                        )} />
                        <div className="relative w-14 h-14 rounded-lg overflow-hidden">
                          <img 
                            src={album.coverUrl || '/placeholder.svg'} 
                            alt={album.title}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className={cn(
                          "absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                          index === 0 && "bg-gradient-to-br from-yellow-400 to-orange-500 text-white",
                          index === 1 && "bg-gradient-to-br from-gray-300 to-gray-400 text-gray-800",
                          index === 2 && "bg-gradient-to-br from-orange-600 to-orange-700 text-white"
                        )}>
                          {index + 1}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm truncate">{album.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{album.artist}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-base font-bold text-primary">{album.plays}</p>
                        <p className="text-xs text-muted-foreground">
                          {settings.language === 'it' ? 'ascolti' : 'plays'}
                        </p>
                      </div>
                    </div>
                ))
              ) : (
                <div className="flex items-center justify-center">
                  <p className="text-muted-foreground text-center">
                    {settings.language === 'it' 
                      ? 'Nessun album trovato' 
                      : 'No albums found'}
                  </p>
                </div>
              )}
            </div>
          </div>
        );

      case 6:
        return (
          <div className="flex flex-col items-center justify-center h-full p-6 animate-wrapped-slide-in">
            <div className="p-3 rounded-full bg-gradient-to-br from-orange-500 to-red-500 mb-4">
              <Heart className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-2xl font-bold mb-6">
              {settings.language === 'it' ? 'I tuoi generi preferiti' : 'Your favorite genres'} 💖
            </h2>
            <div className="w-full max-w-xs space-y-4">
              {wrappedStats.topGenres.length > 0 ? (
                wrappedStats.topGenres.map((genre, index) => (
                  <div key={genre.name} className="animate-slide-in-stagger" style={{ animationDelay: `${index * 150}ms` }}>
                    <div className="flex justify-between text-sm mb-1.5 gap-2">
                      <span className="font-semibold truncate">{genre.name}</span>
                      <span className="text-muted-foreground font-medium shrink-0">{genre.percentage}%</span>
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
                ))
              ) : (
                <p className="text-muted-foreground text-center">
                  {settings.language === 'it' 
                    ? 'Ascolta più musica per vedere le statistiche!' 
                    : 'Listen to more music to see stats!'}
                </p>
              )}
            </div>
          </div>
        );

      case 7:
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
                <p className="text-3xl font-black text-pink-400">{wrappedStats.socialStats.posts}</p>
                <p className="text-xs text-muted-foreground mt-1">Post</p>
              </div>
              <div className="text-center p-4 rounded-2xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 backdrop-blur-sm">
                <p className="text-3xl font-black text-cyan-400">{wrappedStats.socialStats.comments}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {settings.language === 'it' ? 'Commenti' : 'Comments'}
                </p>
              </div>
              <div className="text-center p-4 rounded-2xl bg-gradient-to-br from-red-500/20 to-orange-500/20 backdrop-blur-sm">
                <p className="text-3xl font-black text-orange-400">{wrappedStats.socialStats.likes}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {settings.language === 'it' ? 'Like' : 'Likes'}
                </p>
              </div>
            </div>
            <p className="mt-8 text-sm text-muted-foreground flex items-center gap-1">
              <ChevronDown className="w-4 h-4 animate-bounce" />
              {settings.language === 'it' ? 'Scorri verso il basso per chiudere' : 'Swipe down to close'}
            </p>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className={cn(
          "p-0 overflow-hidden border-none [&>button]:hidden",
          "bg-gradient-to-b from-card via-background to-card",
          // Full screen on mobile - override default dialog positioning
          "!fixed !inset-0 !left-0 !top-0 !translate-x-0 !translate-y-0",
          "!w-screen !h-screen !max-w-none !max-h-none !rounded-none",
          // Desktop: centered modal
          "sm:!left-[50%] sm:!top-[50%] sm:!translate-x-[-50%] sm:!translate-y-[-50%]",
          "sm:!w-full sm:!max-w-sm sm:!h-[85vh] sm:!max-h-[85vh] sm:!rounded-lg",
          isDragging && "transition-none",
          !isDragging && "transition-transform duration-300"
        )}
        style={{
          transform: swipeY > 0 ? `translateY(${swipeY}px)` : undefined,
          opacity: swipeY > 0 ? Math.max(0.5, 1 - swipeY / 300) : 1,
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
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

        {/* Progress bars - with safe area */}
        <div 
          className="absolute left-0 right-0 z-20 flex gap-1 px-3"
          style={{ top: 'max(env(safe-area-inset-top, 0px), 12px)' }}
        >
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

        {/* Music toggle button - with safe area */}
        <button
          onClick={toggleBackgroundMusic}
          className="absolute right-3 z-30 p-2 rounded-full bg-background/50 hover:bg-background/70 transition-all backdrop-blur-sm"
          style={{ top: 'calc(max(env(safe-area-inset-top, 0px), 12px) + 20px)' }}
        >
          {isMusicPlaying ? (
            <Volume2 className="w-4 h-4 text-primary animate-pulse" />
          ) : (
            <VolumeX className="w-4 h-4 text-muted-foreground" />
          )}
        </button>

        {/* Navigation areas */}
        <div 
          className="absolute inset-0 z-10 flex"
          onClick={handleTap}
        >
          <div className="flex-1" />
          <div className="flex-1" />
        </div>

        {/* Content - with safe area padding */}
        <div 
          className="relative h-full z-[5]"
          style={{ 
            paddingTop: 'calc(max(env(safe-area-inset-top, 0px), 12px) + 32px)',
            paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)'
          }}
        >
          {renderSlide()}
        </div>

        {/* Now playing indicator - with safe area */}
        {wrappedTrack && isMusicPlaying && (
          <div 
            className="absolute left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-1.5 rounded-full bg-background/70 backdrop-blur-sm"
            style={{ bottom: 'calc(max(env(safe-area-inset-bottom, 0px), 8px) + 8px)' }}
          >
            <div className="flex gap-0.5">
              {[...Array(3)].map((_, i) => (
                <div 
                  key={i} 
                  className="w-0.5 bg-primary rounded-full animate-music-bar"
                  style={{ 
                    height: '12px',
                    animationDelay: `${i * 0.15}s` 
                  }}
                />
              ))}
            </div>
            <span className="text-xs text-muted-foreground truncate max-w-[150px]">
              {wrappedTrack.title}
            </span>
          </div>
        )}

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
