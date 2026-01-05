import React, { useState, useCallback } from 'react';
import { Search as SearchIcon, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import TrackCard from '@/components/TrackCard';
import AlbumCard from '@/components/AlbumCard';
import ArtistCard from '@/components/ArtistCard';
import TapArea from '@/components/TapArea';
import SearchResultsSkeleton from '@/components/skeletons/SearchResultsSkeleton';
import { useSettings } from '@/contexts/SettingsContext';
import { searchAll } from '@/lib/musicbrainz';
import { Track, Album, Artist } from '@/types/music';
import { useDebounce } from '@/hooks/useDebounce';

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

const Search: React.FC = () => {
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<{
    artists: Artist[];
    albums: Album[];
    tracks: Track[];
  } | null>(null);
  const { t } = useSettings();

  // Normalize string for matching (remove accents, lowercase, trim)
  const normalizeForMatch = (str: string): string => {
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/[^\w\s]/g, '') // Remove special chars
      .trim();
  };

  // Check if a result matches the query
  const matchesQuery = (text: string, searchQuery: string): boolean => {
    const normalizedText = normalizeForMatch(text);
    const normalizedQuery = normalizeForMatch(searchQuery);
    return normalizedText.includes(normalizedQuery);
  };

  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults(null);
      return;
    }

    setIsLoading(true);
    try {
      const data = await searchAll(searchQuery);
      
      // Filter results to only show items that contain the search query in their metadata
      const filteredArtists = data.artists.filter(artist => 
        matchesQuery(artist.name, searchQuery)
      );
      
      const filteredAlbums = data.albums.filter(album => 
        matchesQuery(album.title, searchQuery) || 
        matchesQuery(album.artist, searchQuery)
      );
      
      const filteredTracks = data.tracks.filter(track => 
        matchesQuery(track.title, searchQuery) || 
        matchesQuery(track.artist, searchQuery) ||
        matchesQuery(track.album, searchQuery)
      );
      
      setResults({
        artists: filteredArtists,
        albums: filteredAlbums,
        tracks: filteredTracks,
      });
    } catch (error) {
      console.error('Search error:', error);
      setResults({ artists: [], albums: [], tracks: [] });
    } finally {
      setIsLoading(false);
    }
  }, []);

  const debouncedSearch = useDebounce(performSearch, 500);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    debouncedSearch(value);
  };

  return (
    <div className="p-4 md:p-8 pb-32 animate-fade-in">
      {/* Search Header */}
      <div className="max-w-2xl mb-6 md:mb-8">
        <h1 className="text-2xl md:text-4xl font-bold text-foreground mb-4 md:mb-6">{t('search')}</h1>
        <div className="relative">
          <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            type="text"
            placeholder={t('searchPlaceholder')}
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
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

      {/* Results */}
      {!isLoading && results && (
        <div className="space-y-8 md:space-y-10">
          {/* Artists */}
          {results.artists.length > 0 && (
            <section>
              <h2 className="text-lg md:text-xl font-bold text-foreground mb-3 md:mb-4">{t('artists')}</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 md:gap-6">
                {results.artists.slice(0, 6).map((artist) => (
                  <ArtistCard key={artist.id} artist={artist} />
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
                  <AlbumCard key={album.id} album={album} />
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
                  <TrackCard 
                    key={track.id} 
                    track={track} 
                    queue={results.tracks}
                    index={index}
                  />
                ))}
              </div>
            </section>
          )}

          {/* No results */}
          {results.tracks.length === 0 && results.albums.length === 0 && results.artists.length === 0 && query && (
            <div className="text-center py-12">
              <p className="text-muted-foreground text-base md:text-lg">
                {t('noResults')} "{query}"
              </p>
            </div>
          )}
        </div>
      )}

      {/* Browse Genres */}
      {!isLoading && !results && (
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
