import React, { useState, useEffect, useRef } from 'react';
import { Search, Music, Disc, User, ListMusic, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { searchTracks, searchAlbums, searchArtists, searchPlaylists, DeezerPlaylist } from '@/lib/deezer';
import { Track, Album, Artist } from '@/types/music';
import { usePlayer } from '@/contexts/PlayerContext';
import { useNavigate } from 'react-router-dom';
import { useAutoMode } from './AutoModeContext';

type SearchTab = 'tracks' | 'albums' | 'artists' | 'playlists';

interface SearchResults {
  tracks: Track[];
  albums: Album[];
  artists: Artist[];
  playlists: DeezerPlaylist[];
}

const AutoSearchView: React.FC = () => {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeTab, setActiveTab] = useState<SearchTab>('tracks');
  const [results, setResults] = useState<SearchResults>({ tracks: [], albums: [], artists: [], playlists: [] });
  const [isLoading, setIsLoading] = useState(false);
  const { playTrack } = usePlayer();
  const navigate = useNavigate();
  const { setAutoMode } = useAutoMode();
  const debounceTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce the query
  useEffect(() => {
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }
    debounceTimeout.current = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => {
      if (debounceTimeout.current) {
        clearTimeout(debounceTimeout.current);
      }
    };
  }, [query]);

  useEffect(() => {
    const search = async () => {
      if (!debouncedQuery.trim()) {
        setResults({ tracks: [], albums: [], artists: [], playlists: [] });
        return;
      }

      setIsLoading(true);
      try {
        const [tracks, albums, artists, playlists] = await Promise.all([
          searchTracks(debouncedQuery).catch(() => []),
          searchAlbums(debouncedQuery).catch(() => []),
          searchArtists(debouncedQuery).catch(() => []),
          searchPlaylists(debouncedQuery).catch(() => []),
        ]);
        setResults({ tracks, albums, artists, playlists });
      } catch (error) {
        console.error('Search error:', error);
      } finally {
        setIsLoading(false);
      }
    };

    search();
  }, [debouncedQuery]);

  const tabs = [
    { id: 'tracks' as SearchTab, label: 'Brani', icon: Music },
    { id: 'albums' as SearchTab, label: 'Album', icon: Disc },
    { id: 'artists' as SearchTab, label: 'Artisti', icon: User },
    { id: 'playlists' as SearchTab, label: 'Playlist', icon: ListMusic },
  ];

  const handleTrackClick = (track: Track) => {
    playTrack(track, results.tracks);
  };

  const handleAlbumClick = (album: Album) => {
    setAutoMode(false);
    navigate(`/album/${album.id}`);
  };

  const handleArtistClick = (artist: Artist) => {
    setAutoMode(false);
    navigate(`/artist/${artist.id}`);
  };

  const handlePlaylistClick = (playlist: DeezerPlaylist) => {
    setAutoMode(false);
    navigate(`/deezer-playlist/${playlist.id}`);
  };

  return (
    <div className="h-full flex flex-col p-4 md:p-6">
      {/* Search Input */}
      <div className="relative mb-4">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Cerca brani, album, artisti..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-14 h-14 text-lg"
        />
      </div>

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

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {activeTab === 'tracks' && (
              <div className="space-y-2">
                {results.tracks.map((track) => (
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
                ))}
                {results.tracks.length === 0 && query && !isLoading && (
                  <p className="text-center py-8 text-muted-foreground">Nessun brano trovato</p>
                )}
              </div>
            )}

            {activeTab === 'albums' && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {results.albums.map((album) => (
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
                ))}
                {results.albums.length === 0 && query && !isLoading && (
                  <p className="col-span-full text-center py-8 text-muted-foreground">Nessun album trovato</p>
                )}
              </div>
            )}

            {activeTab === 'artists' && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {results.artists.map((artist) => (
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
                ))}
                {results.artists.length === 0 && query && !isLoading && (
                  <p className="col-span-full text-center py-8 text-muted-foreground">Nessun artista trovato</p>
                )}
              </div>
            )}

            {activeTab === 'playlists' && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {results.playlists.map((playlist) => (
                  <button
                    key={playlist.id}
                    onClick={() => handlePlaylistClick(playlist)}
                    className="flex flex-col items-center p-4 rounded-xl bg-card hover:bg-secondary transition-colors text-center"
                  >
                    <div className="w-full aspect-square rounded-lg overflow-hidden bg-muted mb-3">
                      {playlist.coverUrl ? (
                        <img src={playlist.coverUrl} alt={playlist.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ListMusic className="w-12 h-12 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <p className="font-medium text-foreground truncate w-full">{playlist.title}</p>
                    <p className="text-sm text-muted-foreground truncate w-full">{playlist.trackCount} brani</p>
                  </button>
                ))}
                {results.playlists.length === 0 && query && !isLoading && (
                  <p className="col-span-full text-center py-8 text-muted-foreground">Nessuna playlist trovata</p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default AutoSearchView;
