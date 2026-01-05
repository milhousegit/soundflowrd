import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Artist } from '@/types/music';
import { Play, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSettings } from '@/contexts/SettingsContext';

interface ArtistCardProps {
  artist: Artist;
}

const ArtistCard: React.FC<ArtistCardProps> = ({ artist }) => {
  const navigate = useNavigate();
  const { t } = useSettings();

  return (
    <div
      onClick={() => navigate(`/artist/${artist.id}`)}
      className="group p-3 md:p-4 rounded-xl bg-card hover:bg-secondary/80 transition-all duration-300 cursor-pointer"
    >
      {/* Image */}
      <div className="relative aspect-square rounded-full overflow-hidden mb-3 md:mb-4 bg-muted">
        {artist.imageUrl ? (
          <img 
            src={artist.imageUrl} 
            alt={artist.name} 
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <User className="w-8 md:w-12 h-8 md:h-12 text-muted-foreground" />
          </div>
        )}
        
        {/* Play button overlay */}
        <Button
          variant="player"
          size="player"
          className="absolute bottom-2 right-2 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 h-10 w-10 md:h-12 md:w-12"
          onClick={(e) => {
            e.stopPropagation();
            // Play artist top tracks
          }}
        >
          <Play className="w-4 md:w-5 h-4 md:h-5 ml-0.5" />
        </Button>
      </div>

      {/* Info */}
      <h3 className="font-semibold text-sm md:text-base text-foreground truncate text-center">{artist.name}</h3>
      <p className="text-xs md:text-sm text-muted-foreground text-center">{t('artist')}</p>
    </div>
  );
};

export default ArtistCard;
