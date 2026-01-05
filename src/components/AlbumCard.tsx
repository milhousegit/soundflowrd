import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Album } from '@/types/music';
import { Play, Music } from 'lucide-react';
import { Button } from '@/components/ui/button';
import FavoriteButton from './FavoriteButton';
import { useTap } from '@/hooks/useTap';

interface AlbumCardProps {
  album: Album;
}

const AlbumCard: React.FC<AlbumCardProps> = ({ album }) => {
  const navigate = useNavigate();

  const handleNavigate = () => {
    navigate(`/album/${album.id}`);
  };

  const tap = useTap({ onTap: handleNavigate });

  return (
    <div
      {...tap}
      className="group p-3 md:p-4 rounded-xl bg-card hover:bg-secondary/80 transition-all duration-300 cursor-pointer touch-manipulation"
    >
      {/* Cover */}
      <div className="relative aspect-square rounded-lg overflow-hidden mb-3 md:mb-4 bg-muted">
        {album.coverUrl ? (
          <img 
            src={album.coverUrl} 
            alt={album.title} 
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Music className="w-8 md:w-12 h-8 md:h-12 text-muted-foreground" />
          </div>
        )}
        
        {/* Play button overlay */}
        <Button
          variant="player"
          size="player"
          className="absolute bottom-2 right-2 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 h-10 w-10 md:h-12 md:w-12"
          onClick={(e) => {
            e.stopPropagation();
            // Play album
          }}
        >
          <Play className="w-4 md:w-5 h-4 md:h-5 ml-0.5" />
        </Button>
      </div>

      {/* Info */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-sm md:text-base text-foreground truncate mb-1">{album.title}</h3>
          <p className="text-xs md:text-sm text-muted-foreground truncate">
            {album.releaseDate?.split('-')[0]} • {album.artist}
          </p>
        </div>
        <FavoriteButton
          itemType="album"
          item={album}
          size="sm"
          className="opacity-0 group-hover:opacity-100 transition-opacity -mt-1"
        />
      </div>
    </div>
  );
};

export default AlbumCard;
