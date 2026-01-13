import React, { useEffect, useState } from 'react';
import { ArrowLeft, Music, Disc, User, Play, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Track, Album, Artist } from '@/types/music';
import { usePlayer } from '@/contexts/PlayerContext';
import { getAlbum, getArtistTopTracks, getArtist, getDeezerPlaylist } from '@/lib/deezer';
import { supabase } from '@/integrations/supabase/client';

export type DetailType = 'album' | 'artist' | 'playlist' | 'deezer-playlist';

interface DetailData {
  type: DetailType;
  id: string;
  title: string;
  subtitle?: string;
  coverUrl?: string;
}

interface AutoDetailViewProps {
  detail: DetailData;
  onBack: () => void;
}

const AutoDetailView: React.FC<AutoDetailViewProps> = ({ detail, onBack }) => {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { playTrack, currentTrack, isPlaying } = usePlayer();

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        if (detail.type === 'album') {
          const albumData = await getAlbum(detail.id);
          setTracks(albumData.tracks || []);
        } else if (detail.type === 'artist') {
          const [topTracks, artistData] = await Promise.all([
            getArtistTopTracks(detail.id),
            getArtist(detail.id)
          ]);
          setTracks(topTracks.slice(0, 5));
          setAlbums((artistData.releases || []).slice(0, 10));
        } else if (detail.type === 'playlist') {
          // Load from local database
          const { data } = await supabase
            .from('playlist_tracks')
            .select('*')
            .eq('playlist_id', detail.id)
            .order('position');
          
          if (data) {
            const mappedTracks: Track[] = data.map(t => ({
              id: t.track_id,
              title: t.track_title,
              artist: t.track_artist,
              album: t.track_album || undefined,
              albumId: t.track_album_id || undefined,
              coverUrl: t.track_cover_url || undefined,
              duration: t.track_duration || undefined
            }));
            setTracks(mappedTracks);
          }
        } else if (detail.type === 'deezer-playlist') {
          // Load from Deezer API
          const playlistData = await getDeezerPlaylist(detail.id);
          setTracks(playlistData.tracks || []);
        }
      } catch (error) {
        console.error('Error loading detail:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [detail]);

  const handleTrackClick = (track: Track) => {
    playTrack(track, tracks);
  };

  const handleAlbumClick = (album: Album) => {
    // Navigate to album detail within Auto Mode
    onBack();
  };

  const handlePlayAll = () => {
    if (tracks.length > 0) {
      playTrack(tracks[0], tracks);
    }
  };

  return (
    <div className="h-full flex flex-row overflow-hidden">
      {/* Left side - Header info */}
      <div className="w-64 shrink-0 flex flex-col items-center justify-center p-6 border-r border-border">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="absolute top-4 left-4 w-12 h-12"
        >
          <ArrowLeft className="w-6 h-6" />
        </Button>

        <div className={`w-32 h-32 ${detail.type === 'artist' ? 'rounded-full' : 'rounded-xl'} overflow-hidden bg-muted mb-4 shadow-lg`}>
          {detail.coverUrl ? (
            <img src={detail.coverUrl} alt={detail.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              {detail.type === 'artist' ? (
                <User className="w-12 h-12 text-muted-foreground" />
              ) : detail.type === 'album' ? (
                <Disc className="w-12 h-12 text-muted-foreground" />
              ) : (
                <Music className="w-12 h-12 text-muted-foreground" />
              )}
            </div>
          )}
        </div>

        <h2 className="text-lg font-bold text-foreground text-center line-clamp-2 mb-1">
          {detail.title}
        </h2>
        {detail.subtitle && (
          <p className="text-sm text-muted-foreground text-center">{detail.subtitle}</p>
        )}

        {tracks.length > 0 && (
          <Button
            onClick={handlePlayAll}
            className="mt-4 gap-2"
            size="lg"
          >
            <Play className="w-5 h-5" />
            Riproduci
          </Button>
        )}
      </div>

      {/* Right side - Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Tracks section */}
            {tracks.length > 0 && (
              <div>
                {detail.type === 'artist' && (
                  <h3 className="text-sm font-semibold text-muted-foreground mb-2">Brani popolari</h3>
                )}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                  {tracks.map((track, index) => {
                    const isCurrentTrack = currentTrack?.id === track.id;
                    return (
                      <button
                        key={track.id}
                        onClick={() => handleTrackClick(track)}
                        className={`flex items-center gap-3 p-3 rounded-xl transition-colors text-left ${
                          isCurrentTrack 
                            ? 'bg-primary/20 border border-primary/30' 
                            : 'bg-card hover:bg-secondary'
                        }`}
                      >
                        <div className="w-14 h-14 rounded-lg overflow-hidden bg-muted shrink-0">
                          {track.coverUrl ? (
                            <img src={track.coverUrl} alt={track.title} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Music className="w-6 h-6 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`font-medium truncate ${isCurrentTrack ? 'text-primary' : 'text-foreground'}`}>
                            {track.title}
                          </p>
                          <p className="text-sm text-muted-foreground truncate">{track.artist}</p>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {index + 1}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Albums section (for artists) */}
            {detail.type === 'artist' && albums.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-2">Discografia</h3>
                <div className="grid grid-cols-3 lg:grid-cols-5 gap-3">
                  {albums.map((album) => (
                    <button
                      key={album.id}
                      onClick={() => handleAlbumClick(album)}
                      className="flex flex-col items-center p-2 rounded-xl bg-card hover:bg-secondary transition-colors"
                    >
                      <div className="w-full aspect-square rounded-lg overflow-hidden bg-muted mb-2">
                        {album.coverUrl ? (
                          <img src={album.coverUrl} alt={album.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Disc className="w-8 h-8 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <p className="font-medium text-foreground truncate w-full text-xs text-center">{album.title}</p>
                      <p className="text-[10px] text-muted-foreground">{album.releaseDate?.split('-')[0]}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AutoDetailView;
