import React, { useState } from 'react';
import { X, Music, Search, Loader2, User } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useSettings } from '@/contexts/SettingsContext';
import { useAuth } from '@/contexts/AuthContext';
import { searchAll } from '@/lib/deezer';
import { Track } from '@/types/music';
import { useDebounce } from '@/hooks/useDebounce';

interface CreatePostModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (content: string, track?: {
    id: string;
    title: string;
    artist: string;
    album?: string;
    coverUrl?: string;
    duration?: number;
  }) => Promise<any>;
}

const CreatePostModal: React.FC<CreatePostModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const { settings } = useSettings();
  const { profile } = useAuth();
  const [content, setContent] = useState('');
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);
  const [showTrackSearch, setShowTrackSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const performSearch = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const data = await searchAll(query);
      setSearchResults(data.tracks.slice(0, 5));
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const debouncedSearch = useDebounce(performSearch, 300);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    debouncedSearch(value);
  };

  const handleSelectTrack = (track: Track) => {
    setSelectedTrack(track);
    setShowTrackSearch(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleSubmit = async () => {
    if (!content.trim() && !selectedTrack) return;

    setIsSubmitting(true);
    try {
      await onSubmit(
        content,
        selectedTrack ? {
          id: selectedTrack.id,
          title: selectedTrack.title,
          artist: selectedTrack.artist,
          album: selectedTrack.album,
          coverUrl: selectedTrack.coverUrl,
          duration: selectedTrack.duration,
        } : undefined
      );
      setContent('');
      setSelectedTrack(null);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setContent('');
    setSelectedTrack(null);
    setShowTrackSearch(false);
    setSearchQuery('');
    setSearchResults([]);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {settings.language === 'it' ? 'Nuovo post' : 'New post'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* User info */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-muted overflow-hidden">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <User className="w-5 h-5 text-muted-foreground" />
                </div>
              )}
            </div>
            <p className="font-medium text-sm">
              {profile?.display_name || profile?.email?.split('@')[0] || 'Utente'}
            </p>
          </div>

          {/* Content */}
          <Textarea
            placeholder={settings.language === 'it' ? 'Cosa stai ascoltando?' : "What are you listening to?"}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="min-h-[100px] resize-none"
            maxLength={500}
          />

          {/* Selected track */}
          {selectedTrack && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary">
              <div className="w-12 h-12 rounded-lg bg-muted overflow-hidden shrink-0">
                {selectedTrack.coverUrl ? (
                  <img src={selectedTrack.coverUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Music className="w-5 h-5 text-muted-foreground" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{selectedTrack.title}</p>
                <p className="text-xs text-muted-foreground truncate">{selectedTrack.artist}</p>
              </div>
              <Button variant="ghost" size="iconSm" onClick={() => setSelectedTrack(null)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          )}

          {/* Track search */}
          {showTrackSearch && (
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder={settings.language === 'it' ? 'Cerca un brano...' : 'Search for a track...'}
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="pl-9"
                  autoFocus
                />
              </div>
              
              {isSearching && (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              )}

              {searchResults.length > 0 && (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {searchResults.map((track) => (
                    <button
                      key={track.id}
                      onClick={() => handleSelectTrack(track)}
                      className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-secondary transition-colors text-left"
                    >
                      <div className="w-10 h-10 rounded bg-muted overflow-hidden shrink-0">
                        {track.coverUrl ? (
                          <img src={track.coverUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Music className="w-4 h-4 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{track.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{track.artist}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowTrackSearch(!showTrackSearch)}
              className="gap-2"
            >
              <Music className="w-4 h-4" />
              {settings.language === 'it' ? 'Aggiungi brano' : 'Add track'}
            </Button>

            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || (!content.trim() && !selectedTrack)}
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                settings.language === 'it' ? 'Pubblica' : 'Post'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CreatePostModal;
