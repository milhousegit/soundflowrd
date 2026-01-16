import React, { useState, useEffect, useRef } from 'react';
import { Search, Music, Disc, User, ListMusic, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { searchTracks, searchAlbums, searchArtists, searchPlaylists, DeezerPlaylist } from '@/lib/deezer';
import { Track, Album, Artist } from '@/types/music';
import { usePlayer } from '@/contexts/PlayerContext';
import AutoDetailView, { DetailType } from './AutoDetailView';

type SearchTab = 'tracks' | 'albums' | 'artists' | 'playlists';

interface SearchResults {
  tracks: Track[];
  albums: Album[];
  artists: Artist[];
  playlists: DeezerPlaylist[];
}

interface DetailData {
  type: DetailType;
  id: string;
  title: string;
  subtitle?: string;
  coverUrl?: string;
}

const AutoSearchView: React.FC = () => {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeTab, setActiveTab] = useState<SearchTab>('tracks');
  const [results, setResults] = useState<SearchResults>({ tracks: [], albums: [], artists: [], playlists: [] });
  const [isLoading, setIsLoading] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState<DetailData | null>(null);
  const { playTrack } = usePlayer();
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

  const handlePlaylistClick = (playlist: DeezerPlaylist) => {
    // Determine the type based on source
    const type: DetailType = playlist.source === 'youtube' 
      ? 'youtube-playlist' 
      : playlist.source === 'local' || playlist.isDeezerPlaylist === false
        ? 'playlist'
        : 'deezer-playlist';
    
    setSelectedDetail({
      type,
      id: playlist.id,
      title: playlist.title,
      subtitle: `${playlist.trackCount} brani`,
      coverUrl: playlist.coverUrl
    });
  };

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
      {/* Search Input & Tabs */}
      <div className="flex items-center gap-3 mb-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Cerca..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10 h-12 text-base"
          />
        </div>
        
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <Button
              key={tab.id}
              variant={activeTab === tab.id ? 'default' : 'secondary'}
              onClick={() => setActiveTab(tab.id)}
              className="gap-1 px-3"
              size="sm"
            >
              <tab.icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </Button>
          ))}
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {activeTab === 'tracks' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {results.tracks.slice(0, 12).map((track) => (
                  <button
                    key={track.id}
                    onClick={() => handleTrackClick(track)}
                    className="flex items-center gap-3 p-2 rounded-lg bg-card hover:bg-secondary transition-colors text-left"
                  >
                    <div className="w-12 h-12 rounded-md overflow-hidden bg-muted shrink-0">
                      {track.coverUrl ? (
                        <img src={track.coverUrl} alt={track.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Music className="w-5 h-5 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate text-sm">{track.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{track.artist}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {activeTab === 'albums' && (
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                {results.albums.slice(0, 12).map((album) => (
                  <button
                    key={album.id}
                    onClick={() => handleAlbumClick(album)}
                    className="flex flex-col items-center p-2 rounded-lg bg-card hover:bg-secondary transition-colors text-center"
                  >
                    <div className="w-full aspect-square rounded-md overflow-hidden bg-muted mb-2">
                      {album.coverUrl ? (
                        <img src={album.coverUrl} alt={album.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Disc className="w-8 h-8 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <p className="font-medium text-foreground truncate w-full text-xs">{album.title}</p>
                    <p className="text-[10px] text-muted-foreground truncate w-full">{album.artist}</p>
                  </button>
                ))}
              </div>
            )}

            {activeTab === 'artists' && (
              <div className="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-8 gap-3">
                {results.artists.slice(0, 16).map((artist) => (
                  <button
                    key={artist.id}
                    onClick={() => handleArtistClick(artist)}
                    className="flex flex-col items-center p-2 rounded-lg bg-card hover:bg-secondary transition-colors text-center"
                  >
                    <div className="w-16 h-16 rounded-full overflow-hidden bg-muted mb-2">
                      {artist.imageUrl ? (
                        <img src={artist.imageUrl} alt={artist.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <User className="w-8 h-8 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <p className="font-medium text-foreground truncate w-full text-xs">{artist.name}</p>
                  </button>
                ))}
              </div>
            )}

            {activeTab === 'playlists' && (
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                {results.playlists.slice(0, 12).map((playlist) => (
                  <button
                    key={`${playlist.source || 'deezer'}-${playlist.id}`}
                    onClick={() => handlePlaylistClick(playlist)}
                    className="flex flex-col items-center p-2 rounded-lg bg-card hover:bg-secondary transition-colors text-center"
                  >
                    <div className="w-full aspect-square rounded-md overflow-hidden bg-muted mb-2 relative">
                      {playlist.coverUrl ? (
                        <img src={playlist.coverUrl} alt={playlist.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ListMusic className="w-8 h-8 text-muted-foreground" />
                        </div>
                      )}
                      {/* YouTube badge */}
                      {playlist.source === 'youtube' && (
                        <div className="absolute top-1 right-1 bg-red-600 text-white text-[8px] font-bold px-1 py-0.5 rounded">
                          YT
                        </div>
                      )}
                    </div>
                    <p className="font-medium text-foreground truncate w-full text-xs">{playlist.title}</p>
                    <p className="text-[10px] text-muted-foreground">{playlist.trackCount} brani</p>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default AutoSearchView;
