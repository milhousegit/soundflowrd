import React, { useState } from 'react';
import { Bookmark, Disc, User, ListMusic, Music, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFavorites } from '@/hooks/useFavorites';
import { usePlaylists } from '@/hooks/usePlaylists';
import { usePlayer } from '@/contexts/PlayerContext';
import { Track, Album, Artist } from '@/types/music';
import AutoDetailView, { DetailType } from './AutoDetailView';

type LibraryTab = 'tracks' | 'albums' | 'artists' | 'playlists';

interface DetailData {
  type: DetailType;
  id: string;
  title: string;
  subtitle?: string;
  coverUrl?: string;
}

const AutoLibraryView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<LibraryTab>('tracks');
  const [selectedDetail, setSelectedDetail] = useState<DetailData | null>(null);
  const { getFavoritesByType, isLoading: isFavoritesLoading } = useFavorites();
  const { playlists, isLoading: isPlaylistsLoading } = usePlaylists();
  const { playTrack } = usePlayer();

  const tabs = [
    { id: 'tracks' as LibraryTab, label: 'Brani salvati', icon: Bookmark },
    { id: 'albums' as LibraryTab, label: 'Album', icon: Disc },
    { id: 'artists' as LibraryTab, label: 'Artisti', icon: User },
    { id: 'playlists' as LibraryTab, label: 'Playlist', icon: ListMusic },
  ];

  const favoriteTracks = getFavoritesByType('track');
  const favoriteAlbums = getFavoritesByType('album');
  const favoriteArtists = getFavoritesByType('artist');
  const favoritePlaylists = getFavoritesByType('playlist');

  const tracks: Track[] = favoriteTracks.map(f => f.item_data as Track);
  const albums: Album[] = favoriteAlbums.map(f => f.item_data as Album);
  const artists: Artist[] = favoriteArtists.map(f => f.item_data as Artist);

  const handleTrackClick = (track: Track) => {
    playTrack(track, tracks);
  };

  const handleAlbumClick = (album: Album) => {
    setSelectedDetail({
      type: 'album',
      id: album.id,
      title: album.title,
      subtitle: album.artist,
      coverUrl: album.coverUrl
    });
  };

  const handleArtistClick = (artist: Artist) => {
    setSelectedDetail({
      type: 'artist',
      id: artist.id,
      title: artist.name,
      coverUrl: artist.imageUrl
    });
  };

  const handlePlaylistClick = (playlistId: string, playlistName: string, coverUrl?: string | null, trackCount?: number | null) => {
    setSelectedDetail({
      type: 'playlist',
      id: playlistId,
      title: playlistName,
      subtitle: `${trackCount || 0} brani`,
      coverUrl: coverUrl || undefined
    });
  };

  const handleDeezerPlaylistClick = (deezerId: string, title: string, coverUrl?: string | null) => {
    setSelectedDetail({
      type: 'deezer-playlist',
      id: deezerId,
      title: title,
      subtitle: 'Playlist Deezer',
      coverUrl: coverUrl || undefined
    });
  };

  const isLoading = isFavoritesLoading || isPlaylistsLoading;

  // Show detail view if selected
  if (selectedDetail) {
    return (
      <AutoDetailView 
        detail={selectedDetail} 
        onBack={() => setSelectedDetail(null)} 
      />
    );
  }

  return (
    <div className="h-full flex flex-col p-4 overflow-hidden">
      {/* Tabs - Bigger buttons */}
      <div className="flex gap-3 mb-4">
        {tabs.map((tab) => (
          <Button
            key={tab.id}
            variant={activeTab === tab.id ? 'default' : 'secondary'}
            onClick={() => setActiveTab(tab.id)}
            className="gap-2 px-5 py-6 text-base"
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
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {activeTab === 'tracks' && (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {tracks.length > 0 ? (
                  tracks.slice(0, 12).map((track) => (
                    <button
                      key={track.id}
                      onClick={() => handleTrackClick(track)}
                      className="flex items-center gap-4 p-4 rounded-xl bg-card hover:bg-secondary transition-colors text-left min-h-[80px]"
                    >
                      <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted shrink-0">
                        {track.coverUrl ? (
                          <img src={track.coverUrl} alt={track.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Music className="w-6 h-6 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground truncate text-base">{track.title}</p>
                        <p className="text-sm text-muted-foreground truncate">{track.artist}</p>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="col-span-full text-center py-8 text-muted-foreground">
                    <Bookmark className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p className="text-base">Nessun brano salvato</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'albums' && (
              <div className="grid grid-cols-3 gap-4">
                {albums.length > 0 ? (
                  albums.slice(0, 9).map((album) => (
                    <button
                      key={album.id}
                      onClick={() => handleAlbumClick(album)}
                      className="flex flex-col items-center p-3 rounded-xl bg-card hover:bg-secondary transition-colors text-center"
                    >
                      <div className="w-full aspect-square rounded-lg overflow-hidden bg-muted mb-3">
                        {album.coverUrl ? (
                          <img src={album.coverUrl} alt={album.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Disc className="w-10 h-10 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <p className="font-semibold text-foreground truncate w-full text-sm">{album.title}</p>
                      <p className="text-xs text-muted-foreground truncate w-full">{album.artist}</p>
                    </button>
                  ))
                ) : (
                  <div className="col-span-full text-center py-8 text-muted-foreground">
                    <Disc className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p className="text-base">Nessun album nei preferiti</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'artists' && (
              <div className="grid grid-cols-3 gap-4">
                {artists.length > 0 ? (
                  artists.slice(0, 9).map((artist) => (
                    <button
                      key={artist.id}
                      onClick={() => handleArtistClick(artist)}
                      className="flex flex-col items-center p-4 rounded-xl bg-card hover:bg-secondary transition-colors text-center"
                    >
                      <div className="w-20 h-20 rounded-full overflow-hidden bg-muted mb-3">
                        {artist.imageUrl ? (
                          <img src={artist.imageUrl} alt={artist.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <User className="w-10 h-10 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <p className="font-semibold text-foreground truncate w-full text-base">{artist.name}</p>
                    </button>
                  ))
                ) : (
                  <div className="col-span-full text-center py-8 text-muted-foreground">
                    <User className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p className="text-base">Nessun artista nei preferiti</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'playlists' && (
              <div className="grid grid-cols-3 gap-4">
                {/* User created playlists */}
                {playlists.slice(0, 6).map((playlist) => (
                  <button
                    key={playlist.id}
                    onClick={() => handlePlaylistClick(playlist.id, playlist.name, playlist.cover_url, playlist.track_count)}
                    className="flex flex-col items-center p-3 rounded-xl bg-card hover:bg-secondary transition-colors text-center"
                  >
                    <div className="w-full aspect-square rounded-lg overflow-hidden bg-muted mb-3">
                      {playlist.cover_url ? (
                        <img src={playlist.cover_url} alt={playlist.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
                          <ListMusic className="w-10 h-10 text-primary/50" />
                        </div>
                      )}
                    </div>
                    <p className="font-semibold text-foreground truncate w-full text-sm">{playlist.name}</p>
                    <p className="text-xs text-muted-foreground">{playlist.track_count || 0} brani</p>
                  </button>
                ))}
                
                {/* Favorite Deezer playlists */}
                {favoritePlaylists.slice(0, 6 - playlists.length).map((fav) => {
                  const isDeezerPlaylist = fav.item_id.startsWith('deezer-playlist-');
                  const deezerId = isDeezerPlaylist ? fav.item_id.replace('deezer-playlist-', '') : null;
                  
                  if (!deezerId) return null;
                  
                  return (
                    <button
                      key={fav.id}
                      onClick={() => handleDeezerPlaylistClick(deezerId, fav.item_title, fav.item_cover_url)}
                      className="flex flex-col items-center p-3 rounded-xl bg-card hover:bg-secondary transition-colors text-center"
                    >
                      <div className="w-full aspect-square rounded-lg overflow-hidden bg-muted mb-3">
                        {fav.item_cover_url ? (
                          <img src={fav.item_cover_url} alt={fav.item_title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
                            <ListMusic className="w-10 h-10 text-primary/50" />
                          </div>
                        )}
                      </div>
                      <p className="font-semibold text-foreground truncate w-full text-sm">{fav.item_title}</p>
                      <p className="text-xs text-muted-foreground">Playlist Deezer</p>
                    </button>
                  );
                })}
                
                {playlists.length === 0 && favoritePlaylists.length === 0 && (
                  <div className="col-span-full text-center py-8 text-muted-foreground">
                    <ListMusic className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p className="text-base">Nessuna playlist</p>
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
