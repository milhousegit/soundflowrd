import React, { useState, useEffect } from 'react';
import { Bell, Music2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { supabase } from '@/integrations/supabase/client';
import { searchAlbums } from '@/lib/deezer';
import { useNavigate } from 'react-router-dom';
import { ScrollArea } from '@/components/ui/scroll-area';

interface NewRelease {
  artistName: string;
  artistId: string;
  albumTitle: string;
  albumId: string;
  coverUrl: string;
  releaseDate?: string;
  isSingle?: boolean;
}

export const NotificationsDropdown: React.FC = () => {
  const { isAuthenticated, user } = useAuth();
  const { t } = useSettings();
  const navigate = useNavigate();
  const [newReleases, setNewReleases] = useState<NewRelease[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);

  const isItalian = t('language') === 'it';

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

        // Check each artist for new releases
        for (const artist of trackedArtists.slice(0, 10)) {
          try {
            const albums = await searchAlbums(artist.artist_name);
            const artistAlbums = albums.filter(
              (album) => 
                album.artist?.toLowerCase() === artist.artist_name.toLowerCase() ||
                album.artist?.toLowerCase().includes(artist.artist_name.toLowerCase())
            );

            // Filter only albums released AFTER the user started tracking this artist
            const trackingStartDate = new Date(artist.created_at);
            const newAlbums = artistAlbums.filter((album) => {
              if (!album.releaseDate) return false;
              const releaseDate = new Date(album.releaseDate);
              return releaseDate >= trackingStartDate;
            });

            // Add each new album as a notification
            for (const album of newAlbums) {
              // Determine if it's a single (typically 1-3 tracks) based on record_type if available
              const isSingle = (album as any).record_type === 'single' || 
                              (album as any).nb_tracks <= 3;
              
              releases.push({
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

        setNewReleases(releases.slice(0, 10));
        setHasUnread(releases.length > 0);
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
    setHasUnread(false);
  };

  if (!isAuthenticated) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5" />
          {hasUnread && (
            <span className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>
          {isItalian ? 'Notifiche' : 'Notifications'}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        <ScrollArea className="max-h-80">
          {isLoading ? (
            <div className="p-4 text-center text-muted-foreground text-sm">
              {isItalian ? 'Caricamento...' : 'Loading...'}
            </div>
          ) : newReleases.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-sm">
              {isItalian 
                ? 'Nessuna nuova uscita dai tuoi artisti preferiti' 
                : 'No new releases from your favorite artists'}
            </div>
          ) : (
            newReleases.map((release, index) => (
              <DropdownMenuItem
                key={`${release.albumId}-${index}`}
                className="flex items-center gap-3 p-3 cursor-pointer"
                onClick={() => handleReleaseClick(release)}
              >
                <div className="w-12 h-12 rounded overflow-hidden bg-muted flex-shrink-0">
                  {release.coverUrl ? (
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
                </div>
                <ExternalLink className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              </DropdownMenuItem>
            ))
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default NotificationsDropdown;
