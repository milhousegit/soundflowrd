import React, { useState } from 'react';
import { Plus, ListMusic, Disc, Heart, User, Music, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSettings } from '@/contexts/SettingsContext';
import { usePlayer } from '@/contexts/PlayerContext';
import { useFavorites } from '@/hooks/useFavorites';
import { usePlaylists } from '@/hooks/usePlaylists';
import { useAuth } from '@/contexts/AuthContext';
import TrackCard from '@/components/TrackCard';
import AlbumCard from '@/components/AlbumCard';
import ArtistCard from '@/components/ArtistCard';
import PlaylistCard from '@/components/PlaylistCard';
import { Track, Album, Artist } from '@/types/music';
import { useNavigate } from 'react-router-dom';

type Tab = 'tracks' | 'albums' | 'artists' | 'playlists';

const Library: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('tracks');
  const { t } = useSettings();
  const { playTrack } = usePlayer();
  const { isAuthenticated } = useAuth();
  const { getFavoritesByType, isLoading } = useFavorites();
  const { playlists, isLoading: isPlaylistsLoading } = usePlaylists();
  const navigate = useNavigate();

  const tabs = [
    { id: 'tracks' as Tab, label: t('likedSongs'), icon: Heart },
    { id: 'albums' as Tab, label: t('albums'), icon: Disc },
    { id: 'artists' as Tab, label: t('artists'), icon: User },
    { id: 'playlists' as Tab, label: 'Playlist', icon: ListMusic },
  ];

  const favoriteTracks = getFavoritesByType('track');
  const favoriteAlbums = getFavoritesByType('album');
  const favoriteArtists = getFavoritesByType('artist');

  // Convert favorites to Track/Album/Artist objects
  const tracks: Track[] = favoriteTracks.map(f => f.item_data as Track);
  const albums: Album[] = favoriteAlbums.map(f => f.item_data as Album);
  const artists: Artist[] = favoriteArtists.map(f => f.item_data as Artist);

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <Heart className="w-16 h-16 text-muted-foreground mb-4" />
        <h2 className="text-xl font-bold mb-2">Accedi per vedere la tua libreria</h2>
        <p className="text-muted-foreground mb-4">I tuoi brani, album e artisti preferiti saranno qui</p>
        <Button onClick={() => navigate('/login')}>Accedi</Button>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 pb-32 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 md:mb-8">
        <h1 className="text-2xl md:text-4xl font-bold text-foreground">{t('library')}</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 md:mb-8 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0">
        {tabs.map((tab) => (
          <Button
            key={tab.id}
            variant={activeTab === tab.id ? 'default' : 'secondary'}
            onClick={() => setActiveTab(tab.id)}
            className="gap-2 flex-shrink-0"
            size="sm"
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </Button>
        ))}
      </div>

      {isLoading || isPlaylistsLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* Tracks */}
          {activeTab === 'tracks' && (
            <div>
              {/* Liked Songs Header */}
              <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 mb-6 md:mb-8 p-4 md:p-6 rounded-xl bg-gradient-to-r from-purple-500/20 to-pink-500/20">
                <div className="w-24 h-24 md:w-32 md:h-32 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
                  <Heart className="w-12 md:w-16 h-12 md:h-16 text-white fill-white" />
                </div>
                <div className="text-center sm:text-left">
                  <p className="text-xs md:text-sm text-muted-foreground uppercase tracking-wider">{t('playlist')}</p>
                  <h2 className="text-2xl md:text-4xl font-bold text-foreground mb-1 md:mb-2">{t('likedSongs')}</h2>
                  <p className="text-sm md:text-base text-muted-foreground">{tracks.length} {t('tracks').toLowerCase()}</p>
                </div>
                {tracks.length > 0 && (
                  <Button
                    variant="player"
                    size="player"
                    className="ml-auto"
                    onClick={() => playTrack(tracks[0], tracks)}
                  >
                    <Music className="w-6 h-6" />
                  </Button>
                )}
              </div>

              {/* Tracks List */}
              {tracks.length > 0 ? (
                <div className="space-y-1">
                  {tracks.map((track, index) => (
                    <TrackCard 
                      key={track.id} 
                      track={track} 
                      queue={tracks}
                      index={index}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Heart className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Nessun brano nei preferiti</p>
                  <p className="text-sm">Aggiungi brani con il cuoricino</p>
                </div>
              )}
            </div>
          )}

          {/* Albums */}
          {activeTab === 'albums' && (
            <div>
              {albums.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 md:gap-6">
                  {albums.map((album) => (
                    <AlbumCard key={album.id} album={album} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Disc className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Nessun album nei preferiti</p>
                  <p className="text-sm">Aggiungi album con il cuoricino</p>
                </div>
              )}
            </div>
          )}

          {/* Artists */}
          {activeTab === 'artists' && (
            <div>
              {artists.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 md:gap-6">
                  {artists.map((artist) => (
                    <ArtistCard key={artist.id} artist={artist} />
                  ))}
                </div>
              ) : (
              <div className="text-center py-12 text-muted-foreground">
                  <User className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Nessun artista nei preferiti</p>
                  <p className="text-sm">Aggiungi artisti con il cuoricino</p>
                </div>
              )}
            </div>
          )}

          {/* Playlists */}
          {activeTab === 'playlists' && (
            <div>
              {playlists.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 md:gap-6">
                  {playlists.map((playlist) => (
                    <PlaylistCard key={playlist.id} playlist={playlist} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <ListMusic className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Nessuna playlist</p>
                  <p className="text-sm">Crea playlist dal menu su qualsiasi brano</p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Library;
