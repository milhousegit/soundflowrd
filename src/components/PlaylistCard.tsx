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
      className="group flex flex-col items-center text-center p-3 md:p-4 rounded-xl bg-card hover:bg-secondary transition-all cursor-pointer touch-manipulation"
    >
      <div className="w-full aspect-square rounded-lg bg-secondary overflow-hidden mb-3 relative">
        {playlist.cover_url ? (
          <img
            src={playlist.cover_url}
            alt={playlist.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
            <ListMusic className="w-12 h-12 text-primary/50" />
          </div>
        )}
      </div>
      <h3 className="font-semibold text-sm md:text-base text-foreground truncate w-full">
        {playlist.name}
      </h3>
      <p className="text-xs md:text-sm text-muted-foreground">
        {playlist.track_count} {playlist.track_count === 1 ? 'brano' : 'brani'}
      </p>
    </TapArea>
  );
};

export default PlaylistCard;