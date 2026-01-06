import React from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { MoreVertical, ListPlus, Plus, Loader2 } from 'lucide-react';
import { Track } from '@/types/music';
import { usePlaylists } from '@/hooks/usePlaylists';

interface AddToPlaylistMenuProps {
  track: Track;
  onCreatePlaylist?: () => void;
}

const AddToPlaylistMenu: React.FC<AddToPlaylistMenuProps> = ({ track, onCreatePlaylist }) => {
  const { playlists, addTrackToPlaylist, isLoading } = usePlaylists();
  const [isAdding, setIsAdding] = React.useState<string | null>(null);

  const handleAddToPlaylist = async (playlistId: string) => {
    setIsAdding(playlistId);
    await addTrackToPlaylist(playlistId, track);
    setIsAdding(null);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreVertical className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            onCreatePlaylist?.();
          }}
          className="flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Crea nuova playlist
        </DropdownMenuItem>
        
        {playlists.length > 0 && <DropdownMenuSeparator />}
        
        {isLoading ? (
          <div className="flex items-center justify-center py-2">
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
        ) : (
          playlists.map((playlist) => (
            <DropdownMenuItem
              key={playlist.id}
              onClick={(e) => {
                e.stopPropagation();
                handleAddToPlaylist(playlist.id);
              }}
              className="flex items-center gap-2"
              disabled={isAdding === playlist.id}
            >
              {isAdding === playlist.id ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ListPlus className="w-4 h-4" />
              )}
              <span className="truncate">{playlist.name}</span>
              <span className="text-xs text-muted-foreground ml-auto">
                {playlist.track_count}
              </span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default AddToPlaylistMenu;