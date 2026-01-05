import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Album } from '@/types/music';
import { Play, Music } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AlbumCardProps {
  album: Album;
}

const AlbumCard: React.FC<AlbumCardProps> = ({ album }) => {
  const navigate = useNavigate();

  return (
    <div
      onClick={() => navigate(`/album/${album.id}`)}
      className="group p-4 rounded-xl bg-card hover:bg-secondary/80 transition-all duration-300 cursor-pointer"
    >
      {/* Cover */}
      <div className="relative aspect-square rounded-lg overflow-hidden mb-4 bg-muted">
        {album.coverUrl ? (
          <img 
            src={album.coverUrl} 
            alt={album.title} 
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Music className="w-12 h-12 text-muted-foreground" />
          </div>
        )}
        
        {/* Play button overlay */}
        <Button
          variant="player"
          size="player"
          className="absolute bottom-2 right-2 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300"
          onClick={(e) => {
            e.stopPropagation();
            // Play album
          }}
        >
          <Play className="w-5 h-5 ml-0.5" />
        </Button>
      </div>

      {/* Info */}
      <h3 className="font-semibold text-foreground truncate mb-1">{album.title}</h3>
      <p className="text-sm text-muted-foreground truncate">
        {album.releaseDate?.split('-')[0]} • {album.artist}
      </p>
    </div>
  );
};

export default AlbumCard;
