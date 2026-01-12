import React, { useState } from 'react';
import { Heart, Disc, User, ListMusic, Music, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFavorites } from '@/hooks/useFavorites';
import { usePlaylists } from '@/hooks/usePlaylists';
import { usePlayer } from '@/contexts/PlayerContext';
import { useNavigate } from 'react-router-dom';
import { useAutoMode } from './AutoModeContext';
import { Track, Album, Artist } from '@/types/music';

type LibraryTab = 'tracks' | 'albums' | 'artists' | 'playlists';

const AutoLibraryView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<LibraryTab>('tracks');
  const { getFavoritesByType, isLoading: isFavoritesLoading } = useFavorites();
  const { playlists, isLoading: isPlaylistsLoading } = usePlaylists();
  const { playTrack } = usePlayer();
  const navigate = useNavigate();
  const { setAutoMode } = useAutoMode();

  const tabs = [
    { id: 'tracks' as LibraryTab, label: 'Brani', icon: Heart },
    { id: 'albums' as LibraryTab, label: 'Album', icon: Disc },
    { id: 'artists' as LibraryTab, label: 'Artisti', icon: User },
    { id: 'playlists' as LibraryTab, label: 'Playlist', icon: ListMusic },
  ];

  const favoriteTracks = getFavoritesByType('track');
  const favoriteAlbums = getFavoritesByType('album');
  const favoriteArtists = getFavoritesByType('artist');

  const tracks: Track[] = favoriteTracks.map(f => f.item_data as Track);
  const albums: Album[] = favoriteAlbums.map(f => f.item_data as Album);
  const artists: Artist[] = favoriteArtists.map(f => f.item_data as Artist);

  const handleTrackClick = (track: Track) => {
    playTrack(track, tracks);
  };

  const handleAlbumClick = (album: Album) => {
    setAutoMode(false);
    navigate(`/album/${album.id}`);
  };

  const handleArtistClick = (artist: Artist) => {
    setAutoMode(false);
    navigate(`/artist/${artist.id}`);
  };

  const handlePlaylistClick = (playlistId: string) => {
    setAutoMode(false);
    navigate(`/playlist/${playlistId}`);
  };

  const isLoading = isFavoritesLoading || isPlaylistsLoading;

  return (
    <div className="h-full flex flex-col p-4 md:p-6">
      {/* Tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto">
        {tabs.map((tab) => (
          <Button
            key={tab.id}
            variant={activeTab === tab.id ? 'default' : 'secondary'}
            onClick={() => setActiveTab(tab.id)}
            className="gap-2 flex-shrink-0"
            size="lg"
          >
            <tab.icon className="w-5 h-5" />
            {tab.label}
          </Button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {activeTab === 'tracks' && (
              <div className="space-y-2">
                {tracks.length > 0 ? (
                  tracks.map((track) => (
                    <button
                      key={track.id}
                      onClick={() => handleTrackClick(track)}
                      className="w-full flex items-center gap-4 p-3 rounded-xl bg-card hover:bg-secondary transition-colors text-left"
                    >
                      <div className="w-14 h-14 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                        {track.coverUrl ? (
                          <img src={track.coverUrl} alt={track.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Music className="w-6 h-6 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground truncate text-lg">{track.title}</p>
                        <p className="text-sm text-muted-foreground truncate">{track.artist}</p>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <Heart className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Nessun brano nei preferiti</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'albums' && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {albums.length > 0 ? (
                  albums.map((album) => (
                    <button
                      key={album.id}
                      onClick={() => handleAlbumClick(album)}
                      className="flex flex-col items-center p-4 rounded-xl bg-card hover:bg-secondary transition-colors text-center"
                    >
                      <div className="w-full aspect-square rounded-lg overflow-hidden bg-muted mb-3">
                        {album.coverUrl ? (
                          <img src={album.coverUrl} alt={album.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Disc className="w-12 h-12 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <p className="font-medium text-foreground truncate w-full">{album.title}</p>
                      <p className="text-sm text-muted-foreground truncate w-full">{album.artist}</p>
                    </button>
                  ))
                ) : (
                  <div className="col-span-full text-center py-12 text-muted-foreground">
                    <Disc className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Nessun album nei preferiti</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'artists' && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {artists.length > 0 ? (
                  artists.map((artist) => (
                    <button
                      key={artist.id}
                      onClick={() => handleArtistClick(artist)}
                      className="flex flex-col items-center p-4 rounded-xl bg-card hover:bg-secondary transition-colors text-center"
                    >
                      <div className="w-24 h-24 rounded-full overflow-hidden bg-muted mb-3">
                        {artist.imageUrl ? (
                          <img src={artist.imageUrl} alt={artist.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <User className="w-12 h-12 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <p className="font-medium text-foreground truncate w-full">{artist.name}</p>
                    </button>
                  ))
                ) : (
                  <div className="col-span-full text-center py-12 text-muted-foreground">
                    <User className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Nessun artista nei preferiti</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'playlists' && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {playlists.length > 0 ? (
                  playlists.map((playlist) => (
                    <button
                      key={playlist.id}
                      onClick={() => handlePlaylistClick(playlist.id)}
                      className="flex flex-col items-center p-4 rounded-xl bg-card hover:bg-secondary transition-colors text-center"
                    >
                      <div className="w-full aspect-square rounded-lg overflow-hidden bg-muted mb-3">
                        {playlist.cover_url ? (
                          <img src={playlist.cover_url} alt={playlist.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
                            <ListMusic className="w-12 h-12 text-primary/50" />
                          </div>
                        )}
                      </div>
                      <p className="font-medium text-foreground truncate w-full">{playlist.name}</p>
                      <p className="text-sm text-muted-foreground">{playlist.track_count} brani</p>
                    </button>
                  ))
                ) : (
                  <div className="col-span-full text-center py-12 text-muted-foreground">
                    <ListMusic className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Nessuna playlist</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default AutoLibraryView;
