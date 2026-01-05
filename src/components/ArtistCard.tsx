import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Artist } from '@/types/music';
import { Play, User } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ArtistCardProps {
  artist: Artist;
}

const ArtistCard: React.FC<ArtistCardProps> = ({ artist }) => {
  const navigate = useNavigate();

  return (
    <div
      onClick={() => navigate(`/artist/${artist.id}`)}
      className="group p-4 rounded-xl bg-card hover:bg-secondary/80 transition-all duration-300 cursor-pointer"
    >
      {/* Image */}
      <div className="relative aspect-square rounded-full overflow-hidden mb-4 bg-muted">
        {artist.imageUrl ? (
          <img 
            src={artist.imageUrl} 
            alt={artist.name} 
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <User className="w-12 h-12 text-muted-foreground" />
          </div>
        )}
        
        {/* Play button overlay */}
        <Button
          variant="player"
          size="player"
          className="absolute bottom-2 right-2 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300"
          onClick={(e) => {
            e.stopPropagation();
            // Play artist top tracks
          }}
        >
          <Play className="w-5 h-5 ml-0.5" />
        </Button>
      </div>

      {/* Info */}
      <h3 className="font-semibold text-foreground truncate text-center">{artist.name}</h3>
      <p className="text-sm text-muted-foreground text-center">Artista</p>
    </div>
  );
};

export default ArtistCard;
