import React, { useState, useMemo } from 'react';
import { Search as SearchIcon, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import TrackCard from '@/components/TrackCard';
import AlbumCard from '@/components/AlbumCard';
import ArtistCard from '@/components/ArtistCard';
import { mockTracks, mockAlbums, mockArtists } from '@/data/mockData';

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

  const results = useMemo(() => {
    if (!query.trim()) return null;

    const q = query.toLowerCase();
    return {
      tracks: mockTracks.filter(t => 
        t.title.toLowerCase().includes(q) || 
        t.artist.toLowerCase().includes(q)
      ),
      albums: mockAlbums.filter(a => 
        a.title.toLowerCase().includes(q) || 
        a.artist.toLowerCase().includes(q)
      ),
      artists: mockArtists.filter(a => 
        a.name.toLowerCase().includes(q)
      ),
    };
  }, [query]);

  return (
    <div className="p-8 pb-32 animate-fade-in">
      {/* Search Header */}
      <div className="max-w-2xl mb-8">
        <h1 className="text-4xl font-bold text-foreground mb-6">Cerca</h1>
        <div className="relative">
          <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Cosa vuoi ascoltare?"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-12 pr-12 h-14 text-lg rounded-full bg-secondary"
          />
          {query && (
            <Button
              variant="ghost"
              size="iconSm"
              className="absolute right-3 top-1/2 -translate-y-1/2"
              onClick={() => setQuery('')}
            >
              <X className="w-5 h-5" />
            </Button>
          )}
        </div>
      </div>

      {/* Results or Browse */}
      {results ? (
        <div className="space-y-10">
          {/* Artists */}
          {results.artists.length > 0 && (
            <section>
              <h2 className="text-xl font-bold text-foreground mb-4">Artisti</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-6">
                {results.artists.map((artist) => (
                  <ArtistCard key={artist.id} artist={artist} />
                ))}
              </div>
            </section>
          )}

          {/* Albums */}
          {results.albums.length > 0 && (
            <section>
              <h2 className="text-xl font-bold text-foreground mb-4">Album</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-6">
                {results.albums.map((album) => (
                  <AlbumCard key={album.id} album={album} />
                ))}
              </div>
            </section>
          )}

          {/* Tracks */}
          {results.tracks.length > 0 && (
            <section>
              <h2 className="text-xl font-bold text-foreground mb-4">Brani</h2>
              <div className="space-y-1">
                {results.tracks.map((track, index) => (
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
          {results.tracks.length === 0 && results.albums.length === 0 && results.artists.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground text-lg">
                Nessun risultato per "{query}"
              </p>
            </div>
          )}
        </div>
      ) : (
        <div>
          <h2 className="text-xl font-bold text-foreground mb-6">Esplora per genere</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {genres.map((genre) => (
              <div
                key={genre.name}
                onClick={() => setQuery(genre.name)}
                className={`aspect-[2/1] rounded-xl bg-gradient-to-br ${genre.color} p-4 flex items-end cursor-pointer hover:scale-[1.02] transition-transform`}
              >
                <h3 className="text-xl font-bold text-white">{genre.name}</h3>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Search;
