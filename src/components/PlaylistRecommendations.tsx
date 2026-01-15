import React, { useState, useEffect } from 'react';
import { Plus, Loader2, Sparkles, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Track } from '@/types/music';
import { getArtistTopTracks, searchTracks } from '@/lib/deezer';
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

  const handleAddTrack = async (track: Track) => {
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
        <div className="space-y-2">
          {recommendations.map((track) => (
            <div 
              key={track.id}
              className="flex items-center gap-3 p-3 rounded-lg bg-card/30 hover:bg-card/50 transition-colors group"
            >
              {/* Cover */}
              <img 
                src={track.coverUrl || '/placeholder.svg'} 
                alt={track.title}
                className="w-12 h-12 rounded object-cover flex-shrink-0"
              />
              
              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{track.title}</p>
                <p className="text-sm text-muted-foreground truncate">{track.artist}</p>
              </div>
              
              {/* Add button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleAddTrack(track)}
                disabled={addingTrackId === track.id}
                className="w-10 h-10 rounded-full bg-primary/10 hover:bg-primary/20 text-primary opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
              >
                {addingTrackId === track.id ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Plus className="w-5 h-5" />
                )}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PlaylistRecommendations;
