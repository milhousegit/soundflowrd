import React, { useState, useEffect, useRef } from 'react';
import { Bell, Music2, ExternalLink, Trash2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { supabase } from '@/integrations/supabase/client';
import { searchAlbums } from '@/lib/deezer';
import { useNavigate } from 'react-router-dom';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface NewRelease {
  id: string;
  artistName: string;
  artistId: string;
  albumTitle: string;
  albumId: string;
  coverUrl: string;
  releaseDate?: string;
  isSingle?: boolean;
  isWelcome?: boolean;
}

interface SwipeableNotificationProps {
  release: NewRelease;
  onDelete: (id: string) => void;
  onClick: () => void;
  isItalian: boolean;
}

const SwipeableNotification: React.FC<SwipeableNotificationProps> = ({
  release,
  onDelete,
  onClick,
  isItalian,
}) => {
  const [isRevealed, setIsRevealed] = useState(false);
  const [translateX, setTranslateX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startX = useRef(0);
  const currentX = useRef(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    currentX.current = e.touches[0].clientX;
    const diff = currentX.current - startX.current;
    
    if (isRevealed) {
      // Allow swiping left to close
      if (diff < 0) {
        setTranslateX(Math.max(60 + diff, 0));
      }
    } else {
      // Only allow right swipe to reveal
      if (diff > 0) {
        setTranslateX(Math.min(diff, 60));
      }
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    if (isRevealed) {
      // If was revealed and swiped back
      if (translateX < 30) {
        setTranslateX(0);
        setIsRevealed(false);
      } else {
        setTranslateX(60);
      }
    } else {
      // If swiping to reveal
      if (translateX > 30) {
        setTranslateX(60);
        setIsRevealed(true);
      } else {
        setTranslateX(0);
      }
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    startX.current = e.clientX;
    setIsDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    currentX.current = e.clientX;
    const diff = currentX.current - startX.current;
    
    if (isRevealed) {
      if (diff < 0) {
        setTranslateX(Math.max(60 + diff, 0));
      }
    } else {
      if (diff > 0) {
        setTranslateX(Math.min(diff, 60));
      }
    }
  };

  const handleMouseUp = () => {
    if (!isDragging) return;
    setIsDragging(false);
    if (isRevealed) {
      if (translateX < 30) {
        setTranslateX(0);
        setIsRevealed(false);
      } else {
        setTranslateX(60);
      }
    } else {
      if (translateX > 30) {
        setTranslateX(60);
        setIsRevealed(true);
      } else {
        setTranslateX(0);
      }
    }
  };

  const handleMouseLeave = () => {
    if (isDragging) {
      setIsDragging(false);
      if (isRevealed) {
        setTranslateX(60);
      } else {
        setTranslateX(0);
      }
    }
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(release.id);
  };

  return (
    <div className="relative overflow-hidden">
      {/* Delete button background */}
      <button
        onClick={handleDeleteClick}
        className={cn(
          "absolute inset-y-0 left-0 w-[60px] bg-destructive flex items-center justify-center transition-opacity",
          translateX > 10 ? "opacity-100" : "opacity-0"
        )}
      >
        <Trash2 className="w-5 h-5 text-destructive-foreground" />
      </button>
      
      {/* Notification content */}
      <div
        className={cn(
          "flex items-center gap-3 p-3 cursor-pointer bg-popover hover:bg-muted/50 transition-all",
          isDragging ? "" : "transition-transform duration-200"
        )}
        style={{ transform: `translateX(${translateX}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onClick={() => {
          if (translateX === 0 && !release.isWelcome) {
            onClick();
          }
        }}
      >
        <div className="w-12 h-12 rounded overflow-hidden bg-muted flex-shrink-0">
          {release.isWelcome ? (
            <div className="w-full h-full flex items-center justify-center bg-primary/20">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
          ) : release.coverUrl ? (
            <img
              src={release.coverUrl}
              alt={release.albumTitle}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Music2 className="w-5 h-5 text-muted-foreground" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          {release.isWelcome ? (
            <>
              <p className="text-sm font-medium">
                {isItalian ? 'Ehi Soundflower!' : 'Hey Soundflower!'}
              </p>
              <p className="text-xs text-muted-foreground">
                {isItalian 
                  ? 'Qui riceverai le notifiche delle nuove uscite' 
                  : "You'll receive new release notifications here"}
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium">
                {isItalian 
                  ? `È uscito un nuovo ${release.isSingle ? 'singolo' : 'album'} di ${release.artistName}`
                  : `New ${release.isSingle ? 'single' : 'album'} from ${release.artistName}`}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {release.albumTitle}
              </p>
              {release.releaseDate && (
                <p className="text-xs text-muted-foreground">
                  {new Date(release.releaseDate).toLocaleDateString()}
                </p>
              )}
            </>
          )}
        </div>
        {!release.isWelcome && (
          <ExternalLink className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        )}
      </div>
    </div>
  );
};

export const NotificationsDropdown: React.FC = () => {
  const { isAuthenticated, user } = useAuth();
  const { t } = useSettings();
  const navigate = useNavigate();
  const [newReleases, setNewReleases] = useState<NewRelease[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<string[]>(() => {
    const saved = localStorage.getItem('dismissed_notifications');
    return saved ? JSON.parse(saved) : [];
  });

  const isItalian = t('language') === 'it';
  
  // Welcome notification that's always shown unless dismissed
  const welcomeNotification: NewRelease = {
    id: 'welcome',
    artistName: '',
    artistId: '',
    albumTitle: '',
    albumId: '',
    coverUrl: '',
    isWelcome: true,
  };

  useEffect(() => {
    if (!isAuthenticated || !user) return;

    const fetchNewReleases = async () => {
      setIsLoading(true);
      try {
        // Get tracked artists for this user with their tracking start date
        const { data: trackedArtists, error } = await supabase
          .from('artist_release_tracking')
          .select('artist_id, artist_name, last_album_id, created_at')
          .eq('user_id', user.id);

        if (error || !trackedArtists?.length) {
          setIsLoading(false);
          return;
        }

        const releases: NewRelease[] = [];
        const now = new Date();
        const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

        // Check each artist for new releases
        for (const artist of trackedArtists.slice(0, 10)) {
          try {
            const albums = await searchAlbums(artist.artist_name);
            const artistAlbums = albums.filter(
              (album) => 
                album.artist?.toLowerCase() === artist.artist_name.toLowerCase() ||
                album.artist?.toLowerCase().includes(artist.artist_name.toLowerCase())
            );

            // Filter albums released in the last 3 months (regardless of when user added artist)
            const recentAlbums = artistAlbums.filter((album) => {
              if (!album.releaseDate) return false;
              const releaseDate = new Date(album.releaseDate);
              return releaseDate >= threeMonthsAgo && releaseDate <= now;
            });

            // Add each recent album as a notification
            for (const album of recentAlbums) {
              // Determine if it's a single (typically 1-3 tracks) based on record_type if available
              const isSingle = (album as any).record_type === 'single' || 
                              (album as any).nb_tracks <= 3;
              
              releases.push({
                id: `${artist.artist_id}-${album.id}`,
                artistName: artist.artist_name,
                artistId: artist.artist_id,
                albumTitle: album.title,
                albumId: album.id,
                coverUrl: album.coverUrl || '',
                releaseDate: album.releaseDate,
                isSingle,
              });
            }
          } catch (e) {
            console.error('Error checking artist releases:', e);
          }
        }

        // Sort by release date
        releases.sort((a, b) => {
          const dateA = a.releaseDate ? new Date(a.releaseDate).getTime() : 0;
          const dateB = b.releaseDate ? new Date(b.releaseDate).getTime() : 0;
          return dateB - dateA;
        });

        // Filter out dismissed notifications
        const filteredReleases = releases.filter(r => !dismissedIds.includes(r.id));
        setNewReleases(filteredReleases.slice(0, 10));
        
        // Check if there are unread notifications (including welcome if not dismissed)
        const hasWelcome = !dismissedIds.includes('welcome');
        setHasUnread(filteredReleases.length > 0 || hasWelcome);
      } catch (error) {
        console.error('Error fetching new releases:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchNewReleases();
  }, [isAuthenticated, user]);

  const handleReleaseClick = (release: NewRelease) => {
    navigate(`/album/${release.albumId}`);
    setIsOpen(false);
  };

  const handleDismiss = (id: string) => {
    const newDismissedIds = [...dismissedIds, id];
    setDismissedIds(newDismissedIds);
    localStorage.setItem('dismissed_notifications', JSON.stringify(newDismissedIds));
    
    if (id === 'welcome') {
      // Just dismiss welcome
    } else {
      setNewReleases(prev => prev.filter(r => r.id !== id));
    }
    
    // Update unread status
    const remainingReleases = newReleases.filter(r => r.id !== id);
    const hasWelcome = !newDismissedIds.includes('welcome');
    setHasUnread(remainingReleases.length > 0 || hasWelcome);
  };

  // Combine notifications: welcome first if not dismissed, then releases
  const allNotifications: NewRelease[] = [
    ...(dismissedIds.includes('welcome') ? [] : [welcomeNotification]),
    ...newReleases,
  ];

  if (!isAuthenticated) return null;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5" />
          {hasUnread && (
            <span className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full animate-pulse" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        align="end" 
        className="w-80 p-0 overflow-hidden animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-200"
        sideOffset={8}
      >
        <div className="px-4 py-3 border-b border-border">
          <h4 className="font-semibold text-sm">
            {isItalian ? 'Notifiche' : 'Notifications'}
          </h4>
        </div>
        
        <ScrollArea className="max-h-80">
          {isLoading ? (
            <div className="p-4 text-center text-muted-foreground text-sm">
              {isItalian ? 'Caricamento...' : 'Loading...'}
            </div>
          ) : allNotifications.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-sm">
              {isItalian 
                ? 'Nessuna notifica' 
                : 'No notifications'}
            </div>
          ) : (
            <div>
              {allNotifications.map((release) => (
                <SwipeableNotification
                  key={release.id}
                  release={release}
                  onDelete={handleDismiss}
                  onClick={() => handleReleaseClick(release)}
                  isItalian={isItalian}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};

export default NotificationsDropdown;
