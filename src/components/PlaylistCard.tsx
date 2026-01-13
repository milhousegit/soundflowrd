import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Music, ListMusic } from 'lucide-react';
import { Playlist } from '@/hooks/usePlaylists';
import TapArea from './TapArea';

interface PlaylistCardProps {
  playlist: Playlist;
}

const PlaylistCard: React.FC<PlaylistCardProps> = ({ playlist }) => {
  const navigate = useNavigate();

  return (
    <TapArea
      onTap={() => navigate(`/playlist/${playlist.id}`)}
      className="group cursor-pointer touch-manipulation"
    >
      <div className="relative aspect-square rounded-lg overflow-hidden mb-2 md:mb-3 bg-muted">
        {playlist.cover_url ? (
          <img
            src={playlist.cover_url}
            alt={playlist.name}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
            <ListMusic className="w-12 h-12 text-primary/50" />
          </div>
        )}
      </div>
      <h3 className="font-medium text-sm text-foreground truncate">
        {playlist.name}
      </h3>
      <p className="text-xs text-muted-foreground truncate">
        {playlist.track_count || 0} brani
      </p>
    </TapArea>
  );
};

export default PlaylistCard;