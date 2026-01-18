import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Search as SearchIcon, X, Music, Clock, History, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import TrackCard from '@/components/TrackCard';
import AlbumCard from '@/components/AlbumCard';
import ArtistCard from '@/components/ArtistCard';
import TapArea from '@/components/TapArea';
import SearchResultsSkeleton from '@/components/skeletons/SearchResultsSkeleton';
import { useSettings } from '@/contexts/SettingsContext';
import { searchAll, searchPlaylists, DeezerPlaylist } from '@/lib/deezer';
import { Track, Album, Artist } from '@/types/music';
import { useDebounce } from '@/hooks/useDebounce';
import { useNavigate } from 'react-router-dom';

const genres = [
  { name: 'Pop', color: 'from-pink-500 to-rose-500' },
  { name: 'Hip-Hop', color: 'from-orange-500 to-amber-500' },
  { name: 'Rock', color: 'from-red-500 to-rose-600' },
  { name: 'Electronic', color: 'from-blue-500 to-cyan-500' },
  { name: 'R&B', color: 'from-purple-500 to-violet-500' },
  { name: 'Jazz', color: 'from-amber-500 to-yellow-500' },
  { name: 'Classical', color: 'from-emerald-500 to-teal-500' },
  { name: 'Country', color: 'from-lime-500 to-green-500' },
];

const RECENT_SEARCHES_KEY = 'recentSearches';
const RECENT_ITEMS_KEY = 'recentSearchItems';
const MAX_RECENT = 5;

interface RecentItem {
  type: 'track' | 'artist' | 'album' | 'playlist';
  id: string;
  title: string;
  subtitle?: string;
  coverUrl?: string;
  timestamp: number;
}

const Search: React.FC = () => {
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [recentItems, setRecentItems] = useState<RecentItem[]>([]);
  const [results, setResults] = useState<{
    artists: Artist[];
    albums: Album[];
    tracks: Track[];
    playlists: DeezerPlaylist[];
  } | null>(null);
  const { t, settings } = useSettings();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  // Load recent searches and items from localStorage
  useEffect(() => {
    const storedSearches = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (storedSearches) {
      setRecentSearches(JSON.parse(storedSearches));
    }
    const storedItems = localStorage.getItem(RECENT_ITEMS_KEY);
    if (storedItems) {
      setRecentItems(JSON.parse(storedItems));
    }
  }, []);

  // Save a search query to recent searches
  const saveRecentSearch = useCallback((searchQuery: string) => {
    if (!searchQuery.trim()) return;
    
    setRecentSearches((prev) => {
      const filtered = prev.filter((s) => s.toLowerCase() !== searchQuery.toLowerCase());
      const updated = [searchQuery, ...filtered].slice(0, MAX_RECENT);
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Save a recent item (track, artist, album, playlist)
  const saveRecentItem = useCallback((item: Omit<RecentItem, 'timestamp'>) => {
    setRecentItems((prev) => {
      const filtered = prev.filter((i) => !(i.type === item.type && i.id === item.id));
      const updated = [{ ...item, timestamp: Date.now() }, ...filtered].slice(0, MAX_RECENT);
      localStorage.setItem(RECENT_ITEMS_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Clear recent searches
  const clearRecentSearches = useCallback(() => {
    setRecentSearches([]);
    localStorage.removeItem(RECENT_SEARCHES_KEY);
  }, []);

  // Clear recent items
  const clearRecentItems = useCallback(() => {
    setRecentItems([]);
    localStorage.removeItem(RECENT_ITEMS_KEY);
  }, []);

  // Normalize string for matching (remove accents, lowercase, trim)
  const normalizeForMatch = (str: string): string => {
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/[^\w\s]/g, ' ') // Replace special chars with space
      .replace(/\s+/g, ' ') // Collapse spaces
      .trim();
  };

  // Token-based matching: supports queries like "geolier fotografia" and "fotografia geolier"
  const matchesTokens = (haystacks: string[], searchQuery: string): boolean => {
    const normalizedQuery = normalizeForMatch(searchQuery);
    if (!normalizedQuery) return true;

    const tokens = normalizedQuery.split(' ').filter(Boolean);
    if (tokens.length === 0) return true;

    const combined = normalizeForMatch(haystacks.join(' '));

    // Fast path: full phrase match
    if (combined.includes(normalizedQuery)) return true;

    // Require every token to be present somewhere across the combined metadata
    return tokens.every((t) => combined.includes(t));
  };

  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults(null);
      return;
    }

    setIsLoading(true);
    try {
      const [data, playlists] = await Promise.all([
        searchAll(searchQuery),
        searchPlaylists(searchQuery).catch(() => []),
      ]);

      // Filter results (keep API ranking/order)
      // Exclude "collaboration" artist pages (names like "thasup, Nitro") 
      // only when the searched term matches one of the parts
      const normalizedSearchQuery = normalizeForMatch(searchQuery);
      const filteredArtists = data.artists.filter((artist) => {
        if (!matchesTokens([artist.name], searchQuery)) return false;
        
        // Check if this is a collaboration page (contains comma)
        if (artist.name.includes(',')) {
          // Split by comma and check if any part closely matches the search query
          const parts = artist.name.split(',').map(p => normalizeForMatch(p.trim()));
          const isCollabPage = parts.some(part => 
            part === normalizedSearchQuery || 
            normalizedSearchQuery.includes(part) || 
            part.includes(normalizedSearchQuery)
          );
          // Hide only if it's a collab page matching our search
          if (isCollabPage) return false;
        }
        
        return true;
      });

      const filteredAlbums = data.albums.filter((album) =>
        matchesTokens([album.title, album.artist], searchQuery)
      );

      const filteredTracks = data.tracks.filter((track) =>
        matchesTokens([track.title, track.artist, track.album], searchQuery)
      );

      setResults({
        artists: filteredArtists,
        albums: filteredAlbums,
        tracks: filteredTracks,
        playlists: playlists,
      });

      // Save to recent searches when we get results
      if (filteredArtists.length > 0 || filteredAlbums.length > 0 || filteredTracks.length > 0 || playlists.length > 0) {
        saveRecentSearch(searchQuery);
      }
    } catch (error) {
      console.error('Search error:', error);
      setResults({ artists: [], albums: [], tracks: [], playlists: [] });
    } finally {
      setIsLoading(false);
    }
  }, [saveRecentSearch]);

  const debouncedSearch = useDebounce(performSearch, 500);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    // Trim trailing spaces before searching
    const trimmedValue = value.trimEnd();
    if (trimmedValue) {
      debouncedSearch(trimmedValue);
    } else if (!value) {
      // Clear results when query is empty
      setResults(null);
    }
  };

  const handleRecentSearchClick = (search: string) => {
    setQuery(search);
    performSearch(search);
  };

  const handleRecentItemClick = (item: RecentItem) => {
    switch (item.type) {
      case 'artist':
        navigate(`/artist/${item.id}`);
        break;
      case 'album':
        navigate(`/album/${item.id}`);
        break;
      case 'playlist':
        navigate(`/deezer-playlist/${item.id}`);
        break;
      case 'track':
        // For tracks, we just update the item as "opened" but stay on search
        break;
    }
  };

  // Expose save function globally for other components to use
  useEffect(() => {
    (window as any).__saveRecentSearchItem = saveRecentItem;
    return () => {
      delete (window as any).__saveRecentSearchItem;
    };
  }, [saveRecentItem]);

  const showRecentSection = isFocused && !query && !results && !isLoading;
  const showGenres = !isFocused && !query && !results && !isLoading;

  return (
    <div className="p-4 md:p-8 pb-32 animate-fade-in">
      {/* Search Header */}
      <div className="max-w-2xl mb-6 md:mb-8">
        <h1 className="text-2xl md:text-4xl font-bold text-foreground mb-4 md:mb-6">{t('search')}</h1>
        <div className="relative">
          <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            ref={inputRef}
            type="text"
            placeholder={t('searchPlaceholder')}
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setTimeout(() => setIsFocused(false), 200)}
            className="pl-12 pr-12 h-12 md:h-14 text-base md:text-lg rounded-full bg-secondary"
          />
          {query && (
            <Button
              variant="ghost"
              size="iconSm"
              className="absolute right-3 top-1/2 -translate-y-1/2"
              onClick={() => handleQueryChange('')}
            >
              <X className="w-5 h-5" />
            </Button>
          )}
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <SearchResultsSkeleton />
      )}

      {/* Recent Searches & Items (when focused on empty search) */}
      {showRecentSection && (
        <div className="space-y-6">
          {/* Recent Searches */}
          {recentSearches.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-muted-foreground" />
                  <h2 className="text-sm font-medium text-muted-foreground">
                    {settings.language === 'it' ? 'Ricerche recenti' : 'Recent searches'}
                  </h2>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={clearRecentSearches}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  <Trash2 className="w-3 h-3 mr-1" />
                  {settings.language === 'it' ? 'Cancella' : 'Clear'}
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {recentSearches.map((search, index) => (
                  <TapArea
                    key={`${search}-${index}`}
                    onTap={() => handleRecentSearchClick(search)}
                    className="px-3 py-2 rounded-full bg-secondary hover:bg-secondary/80 text-sm text-foreground cursor-pointer transition-colors"
                  >
                    {search}
                  </TapArea>
                ))}
              </div>
            </section>
          )}

          {/* Recent Items */}
          {recentItems.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <h2 className="text-sm font-medium text-muted-foreground">
                    {settings.language === 'it' ? 'Aperti di recente' : 'Recently opened'}
                  </h2>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={clearRecentItems}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  <Trash2 className="w-3 h-3 mr-1" />
                  {settings.language === 'it' ? 'Cancella' : 'Clear'}
                </Button>
              </div>
              <div className="space-y-2">
                {recentItems.map((item) => (
                  <TapArea
                    key={`${item.type}-${item.id}`}
                    onTap={() => handleRecentItemClick(item)}
                    className="flex items-center gap-3 p-2 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors cursor-pointer"
                  >
                    <div className={`w-12 h-12 rounded${item.type === 'artist' ? '-full' : '-lg'} overflow-hidden bg-muted flex-shrink-0`}>
                      {item.coverUrl ? (
                        <img src={item.coverUrl} alt={item.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Music className="w-5 h-5 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {item.subtitle || (
                          item.type === 'artist' ? (settings.language === 'it' ? 'Artista' : 'Artist') :
                          item.type === 'album' ? 'Album' :
                          item.type === 'playlist' ? 'Playlist' :
                          (settings.language === 'it' ? 'Brano' : 'Track')
                        )}
                      </p>
                    </div>
                  </TapArea>
                ))}
              </div>
            </section>
          )}

          {/* Empty state */}
          {recentSearches.length === 0 && recentItems.length === 0 && (
            <div className="text-center py-8">
              <History className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-50" />
              <p className="text-muted-foreground text-sm">
                {settings.language === 'it' 
                  ? 'Nessuna ricerca recente' 
                  : 'No recent searches'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Results */}
      {!isLoading && results && (
        <div className="space-y-8 md:space-y-10">
          {/* Artists */}
          {results.artists.length > 0 && (
            <section>
              <h2 className="text-lg md:text-xl font-bold text-foreground mb-3 md:mb-4">{t('artists')}</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 md:gap-6">
                {results.artists.slice(0, 6).map((artist) => (
                  <div 
                    key={artist.id}
                    onClick={() => saveRecentItem({ 
                      type: 'artist', 
                      id: artist.id, 
                      title: artist.name,
                      coverUrl: artist.imageUrl 
                    })}
                  >
                    <ArtistCard artist={artist} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Albums */}
          {results.albums.length > 0 && (
            <section>
              <h2 className="text-lg md:text-xl font-bold text-foreground mb-3 md:mb-4">{t('albums')}</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 md:gap-6">
                {results.albums.slice(0, 6).map((album) => (
                  <div 
                    key={album.id}
                    onClick={() => saveRecentItem({ 
                      type: 'album', 
                      id: album.id, 
                      title: album.title,
                      subtitle: album.artist,
                      coverUrl: album.coverUrl 
                    })}
                  >
                    <AlbumCard album={album} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Playlists */}
          {results.playlists.length > 0 && (
            <section>
              <h2 className="text-lg md:text-xl font-bold text-foreground mb-3 md:mb-4">Playlist</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 md:gap-6">
                {results.playlists.slice(0, 6).map((playlist) => (
                  <TapArea
                    key={playlist.id}
                    onTap={() => {
                      saveRecentItem({ 
                        type: 'playlist', 
                        id: String(playlist.id), 
                        title: playlist.title,
                        subtitle: `${playlist.trackCount} brani • ${playlist.creator}`,
                        coverUrl: playlist.coverUrl 
                      });
                      // Navigate to local playlist page if it's not a Deezer playlist
                      if (playlist.isDeezerPlaylist === false) {
                        navigate(`/playlist/${playlist.id}`);
                      } else {
                        navigate(`/deezer-playlist/${playlist.id}`);
                      }
                    }}
                    className="group cursor-pointer"
                  >
                    <div className="aspect-square rounded-lg overflow-hidden bg-muted mb-2 relative">
                      {playlist.coverUrl ? (
                        <img 
                          src={playlist.coverUrl} 
                          alt={playlist.title} 
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Music className="w-8 h-8 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <p className="text-sm font-medium text-foreground truncate">{playlist.title}</p>
                    <p className="text-xs text-muted-foreground">{playlist.trackCount} brani • {playlist.creator}</p>
                  </TapArea>
                ))}
              </div>
            </section>
          )}

          {/* Tracks */}
          {results.tracks.length > 0 && (
            <section>
              <h2 className="text-lg md:text-xl font-bold text-foreground mb-3 md:mb-4">{t('tracks')}</h2>
              <div className="space-y-1">
                {results.tracks.slice(0, 10).map((track, index) => (
                  <div
                    key={track.id}
                    onClick={() => saveRecentItem({ 
                      type: 'track', 
                      id: track.id, 
                      title: track.title,
                      subtitle: track.artist,
                      coverUrl: track.coverUrl 
                    })}
                  >
                    <TrackCard 
                      track={track} 
                      queue={results.tracks}
                      index={index}
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* No results */}
          {results.tracks.length === 0 && results.albums.length === 0 && results.artists.length === 0 && results.playlists.length === 0 && query && (
            <div className="text-center py-12">
              <p className="text-muted-foreground text-base md:text-lg">
                {t('noResults')} "{query}"
              </p>
            </div>
          )}
        </div>
      )}

      {/* Browse Genres (only when not focused) */}
      {showGenres && (
        <div>
          <h2 className="text-lg md:text-xl font-bold text-foreground mb-4 md:mb-6">{t('exploreByGenre')}</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
            {genres.map((genre) => (
              <TapArea
                key={genre.name}
                onTap={() => handleQueryChange(genre.name)}
                className={`aspect-[2/1] rounded-xl bg-gradient-to-br ${genre.color} p-3 md:p-4 flex items-end cursor-pointer hover:scale-[1.02] transition-transform touch-manipulation`}
              >
                <h3 className="text-lg md:text-xl font-bold text-white">{genre.name}</h3>
              </TapArea>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Search;
