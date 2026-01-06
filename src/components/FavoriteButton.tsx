import React from 'react';
import { Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFavorites } from '@/hooks/useFavorites';
import { Track, Album, Artist } from '@/types/music';
import { cn } from '@/lib/utils';

interface FavoriteButtonProps {
  itemType: 'track' | 'album' | 'artist';
  item: Track | Album | Artist;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  variant?: 'ghost' | 'outline' | 'default';
}

const FavoriteButton: React.FC<FavoriteButtonProps> = ({
  itemType,
  item,
  size = 'md',
  className,
  variant = 'ghost',
}) => {
  const { isFavorite, toggleFavorite } = useFavorites();
  const isLiked = isFavorite(itemType, item.id);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    await toggleFavorite(itemType, item);
  };

  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
  };

  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  };

  return (
    <Button
      variant={variant}
      size="icon"
      className={cn(sizeClasses[size], "border border-muted-foreground/30", className)}
      onClick={handleClick}
      title={isLiked ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}
    >
      <Heart
        className={cn(
          iconSizes[size],
          'transition-all',
          isLiked ? 'fill-primary text-primary' : 'text-muted-foreground'
        )}
      />
    </Button>
  );
};

export default FavoriteButton;
