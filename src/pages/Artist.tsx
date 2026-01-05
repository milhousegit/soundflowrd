import React from 'react';
import { useParams } from 'react-router-dom';
import { Play, Shuffle, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import TrackCard from '@/components/TrackCard';
import AlbumCard from '@/components/AlbumCard';
import { mockArtists, mockTracks, mockAlbums } from '@/data/mockData';
import { usePlayer } from '@/contexts/PlayerContext';

const Artist: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { playTrack } = usePlayer();

  const artist = mockArtists.find(a => a.id === id);
  const artistTracks = mockTracks.filter(t => t.artistId === id);
  const artistAlbums = mockAlbums.filter(a => a.artistId === id);

  if (!artist) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Artista non trovato</p>
      </div>
    );
  }

  const handlePlayAll = () => {
    if (artistTracks.length > 0) {
      playTrack(artistTracks[0], artistTracks);
    }
  };

  return (
    <div className="pb-32 animate-fade-in">
      {/* Hero Section */}
      <div className="relative h-80 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/20 to-background" />
        {artist.imageUrl && (
          <img 
            src={artist.imageUrl} 
            alt={artist.name}
            className="absolute inset-0 w-full h-full object-cover opacity-30 blur-xl"
          />
        )}
        <div className="absolute bottom-0 left-0 right-0 p-8 flex items-end gap-6">
          <div className="w-48 h-48 rounded-full overflow-hidden bg-muted shadow-2xl flex-shrink-0">
            {artist.imageUrl ? (
              <img src={artist.imageUrl} alt={artist.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <User className="w-24 h-24 text-muted-foreground" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-foreground/70 uppercase tracking-wider mb-1">Artista</p>
            <h1 className="text-6xl font-bold text-foreground mb-4">{artist.name}</h1>
            {artist.genres && (
              <div className="flex gap-2">
                {artist.genres.map(genre => (
                  <span key={genre} className="px-3 py-1 rounded-full bg-secondary text-sm text-secondary-foreground">
                    {genre}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="px-8 py-6 flex items-center gap-4">
        <Button variant="player" size="player" onClick={handlePlayAll}>
          <Play className="w-6 h-6 ml-0.5" />
        </Button>
        <Button variant="outline" className="gap-2">
          <Shuffle className="w-4 h-4" />
          Shuffle
        </Button>
      </div>

      {/* Popular Tracks */}
      <section className="px-8 mb-10">
        <h2 className="text-2xl font-bold text-foreground mb-4">Popolari</h2>
        <div className="space-y-1">
          {(artistTracks.length > 0 ? artistTracks : mockTracks.slice(0, 5)).map((track, index) => (
            <TrackCard 
              key={track.id} 
              track={track}
              queue={artistTracks.length > 0 ? artistTracks : mockTracks.slice(0, 5)}
              index={index}
              showArtist={false}
            />
          ))}
        </div>
      </section>

      {/* Albums */}
      <section className="px-8">
        <h2 className="text-2xl font-bold text-foreground mb-4">Discografia</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-6">
          {(artistAlbums.length > 0 ? artistAlbums : mockAlbums.slice(0, 4)).map((album) => (
            <AlbumCard key={album.id} album={album} />
          ))}
        </div>
      </section>
    </div>
  );
};

export default Artist;
