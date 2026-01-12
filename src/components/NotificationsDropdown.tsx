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
        // Get tracked artists for this user
        const { data: trackedArtists, error } = await supabase
          .from('artist_release_tracking')
          .select('artist_id, artist_name, last_album_id')
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

            if (artistAlbums.length > 0) {
              // Get newest album
              const newestAlbum = artistAlbums[0];
              
              // If we have a last_album_id and it's different, or we don't have one yet
              if (newestAlbum.id !== artist.last_album_id) {
                releases.push({
                  artistName: artist.artist_name,
                  artistId: artist.artist_id,
                  albumTitle: newestAlbum.title,
                  albumId: newestAlbum.id,
                  coverUrl: newestAlbum.coverUrl || '',
                  releaseDate: newestAlbum.releaseDate,
                });
              }
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
                  <p className="text-sm font-medium truncate">{release.albumTitle}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {release.artistName}
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
