import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Play, Clock, Music, Loader2, Bug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import TrackCard from '@/components/TrackCard';
import AlbumTorrentModal from '@/components/AlbumTorrentModal';
import FavoriteButton from '@/components/FavoriteButton';
import { useSettings } from '@/contexts/SettingsContext';
import { usePlayer } from '@/contexts/PlayerContext';
import { getAlbum } from '@/lib/musicbrainz';
import { mockAlbums, mockTracks } from '@/data/mockData';
import { Album as AlbumType, Track } from '@/types/music';

const Album: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { playTrack } = usePlayer();
  const { settings, t } = useSettings();
  const [album, setAlbum] = useState<AlbumType | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isTorrentModalOpen, setIsTorrentModalOpen] = useState(false);

  useEffect(() => {
    const fetchAlbum = async () => {
      if (!id) return;
      setIsLoading(true);
      
      try {
        const data = await getAlbum(id);
        setAlbum(data);
        setTracks(data.tracks?.map((tr: any) => ({
          ...tr,
          artist: data.artist,
          artistId: data.artistId,
          album: data.title,
          albumId: data.id,
          coverUrl: data.coverUrl,
        })) || []);
      } catch (error) {
        console.error('Failed to fetch album:', error);
        // Fallback to mock data
        const mockAlbum = mockAlbums.find(a => a.id === id);
        if (mockAlbum) {
          setAlbum(mockAlbum);
          setTracks(mockTracks.filter(tr => tr.albumId === id));
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchAlbum();
  }, [id]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!album) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">{t('album')} not found</p>
      </div>
    );
  }

  const displayTracks = tracks.length > 0 ? tracks : mockTracks.slice(0, 8).map(tr => ({
    ...tr,
    album: album.title,
    albumId: id,
  }));

  const totalDuration = displayTracks.reduce((acc, tr) => acc + (tr.duration || 0), 0);
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
      <div className="relative p-4 md:p-8 pt-8 md:pt-16 flex flex-col md:flex-row items-center md:items-end gap-4 md:gap-8 bg-gradient-to-b from-primary/10 to-transparent">
        {/* Cover */}
        <div className="w-40 h-40 md:w-56 md:h-56 rounded-xl overflow-hidden bg-muted shadow-2xl flex-shrink-0">
          {album.coverUrl ? (
            <img src={album.coverUrl} alt={album.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Music className="w-16 md:w-24 h-16 md:h-24 text-muted-foreground" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 text-center md:text-left">
          <p className="text-xs md:text-sm text-foreground/70 uppercase tracking-wider mb-1">{t('album')}</p>
          <h1 className="text-2xl md:text-5xl font-bold text-foreground mb-2 md:mb-4 truncate">{album.title}</h1>
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-1 md:gap-2 text-xs md:text-sm text-muted-foreground">
            <button 
              onClick={() => navigate(`/artist/${album.artistId}`)}
              className="font-semibold text-foreground hover:underline"
            >
              {album.artist}
            </button>
            <span>•</span>
            <span>{album.releaseDate?.split('-')[0]}</span>
            <span>•</span>
            <span>{displayTracks.length} {t('tracks').toLowerCase()}</span>
            <span>•</span>
            <span>{formatTotalDuration(totalDuration)}</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 md:px-8 py-4 md:py-6 flex items-center gap-4">
        <Button variant="player" size="player" onClick={handlePlayAll}>
          <Play className="w-5 md:w-6 h-5 md:h-6 ml-0.5" />
        </Button>
        
        {/* Favorite button */}
        <FavoriteButton
          itemType="album"
          item={album}
          size="lg"
        />
        
        {/* Bug button for torrent setup */}
        {settings.realDebridApiKey && (
          <Button 
            variant="outline" 
            size="icon"
            onClick={() => setIsTorrentModalOpen(true)}
            title="Configura torrent album"
          >
            <Bug className="w-5 h-5" />
          </Button>
        )}
      </div>

      {/* Track List */}
      <div className="px-4 md:px-8">
        {/* Header - Hidden on mobile */}
        <div className="hidden md:grid grid-cols-[auto_1fr_auto] gap-4 px-4 py-2 text-sm text-muted-foreground border-b border-border mb-2">
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

      {/* Album Torrent Modal */}
      {album && (
        <AlbumTorrentModal
          isOpen={isTorrentModalOpen}
          onClose={() => setIsTorrentModalOpen(false)}
          albumId={album.id}
          albumTitle={album.title}
          artistName={album.artist}
          tracks={displayTracks}
        />
      )}
    </div>
  );
};

export default Album;
