import React, { useState, useEffect } from 'react';
import { Plus, Loader2, Sparkles, RefreshCw, Music, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Track } from '@/types/music';
import { searchTracks } from '@/lib/deezer';
import { usePlayer } from '@/contexts/PlayerContext';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface PlaylistRecommendationsProps {
  tracks: Track[];
  onAddTrack: (track: Track) => Promise<boolean>;
}

const PlaylistRecommendations: React.FC<PlaylistRecommendationsProps> = ({ 
  tracks, 
  onAddTrack 
}) => {
  const [recommendations, setRecommendations] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [addingTrackId, setAddingTrackId] = useState<string | null>(null);
  const { playTrack, currentTrack, isPlaying, toggle } = usePlayer();

  const fetchRecommendations = async () => {
    if (tracks.length === 0) {
      setRecommendations([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      // Get unique artists from playlist
      const uniqueArtists = [...new Set(tracks.map(t => t.artist))];
      
      // Pick up to 3 random artists to get recommendations from
      const shuffledArtists = uniqueArtists.sort(() => Math.random() - 0.5).slice(0, 3);
      
      // Get existing track IDs to filter out
      const existingTrackIds = new Set(tracks.map(t => t.id));
      
      // Fetch top tracks for each artist
      const allRecommendations: Track[] = [];
      
      for (const artist of shuffledArtists) {
        try {
          // Search for tracks by this artist
          const artistTracks = await searchTracks(artist);
          const filtered = artistTracks.filter(t => !existingTrackIds.has(t.id));
          allRecommendations.push(...filtered);
        } catch (err) {
          console.error(`Failed to get tracks for ${artist}:`, err);
        }
      }
      
      // Shuffle and pick 6 unique tracks
      const shuffled = allRecommendations.sort(() => Math.random() - 0.5);
      const uniqueTracks: Track[] = [];
      const seenIds = new Set<string>();
      
      for (const track of shuffled) {
        if (!seenIds.has(track.id) && uniqueTracks.length < 6) {
          seenIds.add(track.id);
          uniqueTracks.push(track);
        }
      }
      
      setRecommendations(uniqueTracks);
    } catch (error) {
      console.error('Failed to fetch recommendations:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRecommendations();
  }, [tracks.length]);

  const handleAddTrack = async (e: React.MouseEvent, track: Track) => {
    e.stopPropagation();
    setAddingTrackId(track.id);
    try {
      const success = await onAddTrack(track);
      if (success) {
        // Remove from recommendations
        setRecommendations(prev => prev.filter(t => t.id !== track.id));
        toast.success(`"${track.title}" aggiunto alla playlist`);
      }
    } finally {
      setAddingTrackId(null);
    }
  };

  const handlePlayTrack = (track: Track) => {
    const isCurrentTrack = currentTrack?.id === track.id;
    if (isCurrentTrack) {
      toggle();
    } else {
      // Play with full queue: playlist tracks + recommendations
      const fullQueue = [...tracks, ...recommendations];
      playTrack(track, fullQueue);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (tracks.length === 0) {
    return null;
  }

  return (
    <div className="mt-8 px-4 md:px-8">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">Brani consigliati</h2>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchRecommendations}
          disabled={isLoading}
          className="gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Aggiorna</span>
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : recommendations.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          Nessun suggerimento disponibile
        </p>
      ) : (
        <div className="space-y-1">
          {recommendations.map((track) => {
            const isCurrentTrack = currentTrack?.id === track.id;
            
            return (
              <div 
                key={track.id}
                onClick={() => handlePlayTrack(track)}
                className={cn(
                  "group flex items-center gap-3 md:gap-4 p-2 md:p-3 rounded-lg cursor-pointer transition-all duration-200 touch-manipulation select-none",
                  "hover:bg-secondary/80 active:scale-[0.99]",
                  isCurrentTrack && "bg-secondary"
                )}
              >
                {/* Cover */}
                <div className="w-10 h-10 rounded bg-muted flex items-center justify-center overflow-hidden flex-shrink-0 relative">
                  {track.coverUrl ? (
                    <img src={track.coverUrl} alt={track.album} className="w-full h-full object-cover pointer-events-none" draggable={false} />
                  ) : (
                    <Music className="w-4 h-4 text-muted-foreground" />
                  )}
                </div>
                
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    "font-medium text-sm md:text-base truncate",
                    isCurrentTrack ? "text-primary" : "text-foreground"
                  )}>
                    {track.title}
                  </p>
                  <p className="text-xs md:text-sm text-muted-foreground truncate">{track.artist}</p>
                </div>

                {/* Actions container */}
                <div className="flex items-center gap-1">
                  {/* Add button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => handleAddTrack(e, track)}
                    disabled={addingTrackId === track.id}
                    className="h-8 w-8 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity flex-shrink-0 text-primary"
                  >
                    {addingTrackId === track.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                  </Button>

                  {/* Duration */}
                  <span className="text-xs md:text-sm text-muted-foreground flex-shrink-0 min-w-[36px] text-right">
                    {formatDuration(track.duration)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PlaylistRecommendations;
