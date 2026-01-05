import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Play, Shuffle, User, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import TrackCard from '@/components/TrackCard';
import AlbumCard from '@/components/AlbumCard';
import FavoriteButton from '@/components/FavoriteButton';
import { useSettings } from '@/contexts/SettingsContext';
import { usePlayer } from '@/contexts/PlayerContext';
import { getArtist, getArtistTopTracks } from '@/lib/musicbrainz';
import { Artist as ArtistType, Album, Track } from '@/types/music';

const Artist: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { playTrack } = usePlayer();
  const { t } = useSettings();
  const [artist, setArtist] = useState<ArtistType | null>(null);
  const [releases, setReleases] = useState<Album[]>([]);
  const [topTracks, setTopTracks] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchArtist = async () => {
      if (!id) return;
      setIsLoading(true);
      
      try {
        const [artistData, tracksData] = await Promise.all([
          getArtist(id),
          getArtistTopTracks(id),
        ]);
        
        setArtist(artistData);
        
        // Sort releases by date (most recent first)
        const sortedReleases = (artistData.releases || []).sort((a, b) => {
          const dateA = a.releaseDate ? new Date(a.releaseDate).getTime() : 0;
          const dateB = b.releaseDate ? new Date(b.releaseDate).getTime() : 0;
          return dateB - dateA;
        });
        setReleases(sortedReleases);
        
        // Set top tracks (these are actual tracks from the artist)
        setTopTracks(tracksData.slice(0, 10));
      } catch (error) {
        console.error('Failed to fetch artist:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchArtist();
  }, [id]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!artist) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">{t('artist')} not found</p>
      </div>
    );
  }

  const handlePlayAll = () => {
    if (topTracks.length > 0) {
      playTrack(topTracks[0], topTracks);
    }
  };

  const handleShuffle = () => {
    if (topTracks.length > 0) {
      const shuffled = [...topTracks].sort(() => Math.random() - 0.5);
      playTrack(shuffled[0], shuffled);
    }
  };

  return (
    <div className="pb-32 animate-fade-in">
      {/* Hero Section */}
      <div className="relative h-48 md:h-80 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/20 to-background" />
        {artist.imageUrl && (
          <img 
            src={artist.imageUrl} 
            alt={artist.name}
            className="absolute inset-0 w-full h-full object-cover opacity-30 blur-xl"
          />
        )}
        <div className="absolute bottom-0 left-0 right-0 p-4 md:p-8 flex flex-col md:flex-row items-center md:items-end gap-4 md:gap-6">
          <div className="w-32 h-32 md:w-48 md:h-48 rounded-full overflow-hidden bg-muted shadow-2xl flex-shrink-0">
            {artist.imageUrl ? (
              <img src={artist.imageUrl} alt={artist.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <User className="w-16 md:w-24 h-16 md:h-24 text-muted-foreground" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0 text-center md:text-left">
            <p className="text-xs md:text-sm text-foreground/70 uppercase tracking-wider mb-1">{t('artist')}</p>
            <h1 className="text-3xl md:text-6xl font-bold text-foreground mb-2 md:mb-4 truncate">{artist.name}</h1>
            {artist.genres && artist.genres.length > 0 && (
              <div className="flex flex-wrap justify-center md:justify-start gap-2">
                {artist.genres.slice(0, 3).map(genre => (
                  <span key={genre} className="px-2 md:px-3 py-1 rounded-full bg-secondary text-xs md:text-sm text-secondary-foreground">
                    {genre}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 md:px-8 py-4 md:py-6 flex items-center gap-3 md:gap-4">
        <Button variant="player" size="player" onClick={handlePlayAll} disabled={topTracks.length === 0}>
          <Play className="w-5 md:w-6 h-5 md:h-6 ml-0.5" />
        </Button>
        <Button variant="outline" className="gap-2" size="sm" onClick={handleShuffle} disabled={topTracks.length === 0}>
          <Shuffle className="w-4 h-4" />
          Shuffle
        </Button>
        <FavoriteButton itemType="artist" item={artist} size="md" variant="outline" />
      </div>

      {/* Popular Tracks */}
      {topTracks.length > 0 && (
        <section className="px-4 md:px-8 mb-8 md:mb-10">
          <h2 className="text-lg md:text-2xl font-bold text-foreground mb-3 md:mb-4">{t('popular')}</h2>
          <div className="space-y-1">
            {topTracks.map((track, index) => (
              <TrackCard 
                key={track.id} 
                track={track}
                queue={topTracks}
                index={index}
                showArtist={false}
              />
            ))}
          </div>
        </section>
      )}

      {/* Discography - sorted by most recent */}
      {releases.length > 0 && (
        <section className="px-4 md:px-8">
          <h2 className="text-lg md:text-2xl font-bold text-foreground mb-3 md:mb-4">{t('discography')}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 md:gap-6">
            {releases.map((album) => (
              <AlbumCard key={album.id} album={{ ...album, artist: artist.name, artistId: artist.id }} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default Artist;
