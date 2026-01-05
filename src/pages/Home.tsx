import React, { useEffect, useState } from 'react';
import { Track } from '@/types/music';
import { mockTracks, mockAlbums, mockPlaylists, mockArtists } from '@/data/mockData';
import TrackCard from '@/components/TrackCard';
import AlbumCard from '@/components/AlbumCard';
import ArtistCard from '@/components/ArtistCard';
import { Clock, TrendingUp, ListMusic } from 'lucide-react';

const Home: React.FC = () => {
  const [recentlyPlayed, setRecentlyPlayed] = useState<Track[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem('recentlyPlayed');
    if (stored) {
      setRecentlyPlayed(JSON.parse(stored));
    }
  }, []);

  // Use mock data if no recently played
  const displayRecent = recentlyPlayed.length > 0 ? recentlyPlayed.slice(0, 6) : mockTracks.slice(0, 6);

  return (
    <div className="p-8 pb-32 space-y-10 animate-fade-in">
      {/* Welcome Header */}
      <div>
        <h1 className="text-4xl font-bold text-foreground mb-2">Buongiorno</h1>
        <p className="text-muted-foreground">Cosa vuoi ascoltare oggi?</p>
      </div>

      {/* Recently Played Grid */}
      <section>
        <div className="flex items-center gap-3 mb-6">
          <Clock className="w-6 h-6 text-primary" />
          <h2 className="text-2xl font-bold text-foreground">Ascoltate di recente</h2>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {displayRecent.map((track) => (
            <div 
              key={track.id}
              className="group flex items-center gap-4 p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-all cursor-pointer"
              onClick={() => {}}
            >
              <div className="w-16 h-16 rounded overflow-hidden flex-shrink-0 bg-muted">
                {track.coverUrl && (
                  <img src={track.coverUrl} alt={track.album} className="w-full h-full object-cover" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-foreground truncate">{track.title}</p>
                <p className="text-sm text-muted-foreground truncate">{track.artist}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Playlists */}
      <section>
        <div className="flex items-center gap-3 mb-6">
          <ListMusic className="w-6 h-6 text-primary" />
          <h2 className="text-2xl font-bold text-foreground">Le tue playlist</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {mockPlaylists.map((playlist) => (
            <div 
              key={playlist.id}
              className="group p-4 rounded-xl bg-card hover:bg-secondary/80 transition-all duration-300 cursor-pointer"
            >
              <div className="aspect-square rounded-lg overflow-hidden mb-4 bg-muted">
                {playlist.coverUrl && (
                  <img 
                    src={playlist.coverUrl} 
                    alt={playlist.name} 
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                )}
              </div>
              <h3 className="font-semibold text-foreground truncate">{playlist.name}</h3>
              <p className="text-sm text-muted-foreground truncate">{playlist.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* New Releases */}
      <section>
        <div className="flex items-center gap-3 mb-6">
          <TrendingUp className="w-6 h-6 text-primary" />
          <h2 className="text-2xl font-bold text-foreground">Nuove uscite</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-6">
          {mockAlbums.slice(0, 6).map((album) => (
            <AlbumCard key={album.id} album={album} />
          ))}
        </div>
      </section>

      {/* Popular Artists */}
      <section>
        <h2 className="text-2xl font-bold text-foreground mb-6">Artisti popolari</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-6">
          {mockArtists.map((artist) => (
            <ArtistCard key={artist.id} artist={artist} />
          ))}
        </div>
      </section>
    </div>
  );
};

export default Home;
