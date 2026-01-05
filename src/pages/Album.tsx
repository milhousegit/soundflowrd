import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Play, Clock, Music } from 'lucide-react';
import { Button } from '@/components/ui/button';
import TrackCard from '@/components/TrackCard';
import { mockAlbums, mockTracks } from '@/data/mockData';
import { usePlayer } from '@/contexts/PlayerContext';

const Album: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { playTrack } = usePlayer();

  const album = mockAlbums.find(a => a.id === id);
  const albumTracks = mockTracks.filter(t => t.albumId === id);

  // If no specific tracks, use some mock tracks
  const displayTracks = albumTracks.length > 0 ? albumTracks : mockTracks.slice(0, 8).map(t => ({
    ...t,
    album: album?.title || t.album,
    albumId: id,
  }));

  if (!album) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Album non trovato</p>
      </div>
    );
  }

  const totalDuration = displayTracks.reduce((acc, t) => acc + t.duration, 0);
  const formatTotalDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours} h ${mins} min`;
    }
    return `${mins} min`;
  };

  const handlePlayAll = () => {
    if (displayTracks.length > 0) {
      playTrack(displayTracks[0], displayTracks);
    }
  };

  return (
    <div className="pb-32 animate-fade-in">
      {/* Header */}
      <div className="relative p-8 pt-16 flex items-end gap-8 bg-gradient-to-b from-primary/10 to-transparent">
        {/* Cover */}
        <div className="w-56 h-56 rounded-xl overflow-hidden bg-muted shadow-2xl flex-shrink-0">
          {album.coverUrl ? (
            <img src={album.coverUrl} alt={album.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Music className="w-24 h-24 text-muted-foreground" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground/70 uppercase tracking-wider mb-1">Album</p>
          <h1 className="text-5xl font-bold text-foreground mb-4 truncate">{album.title}</h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <button 
              onClick={() => navigate(`/artist/${album.artistId}`)}
              className="font-semibold text-foreground hover:underline"
            >
              {album.artist}
            </button>
            <span>•</span>
            <span>{album.releaseDate?.split('-')[0]}</span>
            <span>•</span>
            <span>{displayTracks.length} brani</span>
            <span>•</span>
            <span>{formatTotalDuration(totalDuration)}</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="px-8 py-6 flex items-center gap-4">
        <Button variant="player" size="player" onClick={handlePlayAll}>
          <Play className="w-6 h-6 ml-0.5" />
        </Button>
      </div>

      {/* Track List */}
      <div className="px-8">
        {/* Header */}
        <div className="grid grid-cols-[auto_1fr_auto] gap-4 px-4 py-2 text-sm text-muted-foreground border-b border-border mb-2">
          <span className="w-8 text-center">#</span>
          <span>Titolo</span>
          <Clock className="w-4 h-4" />
        </div>

        {/* Tracks */}
        <div className="space-y-1">
          {displayTracks.map((track, index) => (
            <TrackCard 
              key={track.id} 
              track={track}
              queue={displayTracks}
              index={index}
              showArtist={true}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default Album;
