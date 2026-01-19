import React, { useState, useEffect, useRef } from 'react';
import { Eye, EyeOff, Trash2, Music, Disc, ListMusic, GripVertical, Plus, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle, 
  SheetTrigger 
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Track, Album } from '@/types/music';
import { DeezerPlaylist, searchDeezerPlaylists } from '@/lib/deezer';

// Custom hook for debounced value
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    
    return () => clearTimeout(timer);
  }, [value, delay]);
  
  return debouncedValue;
}

interface HiddenItem {
  id: string;
  artist_id: string;
  item_id: string;
  item_type: 'track' | 'album' | 'playlist';
  item_title: string;
  hidden_by: string;
  created_at: string;
}

interface PlaylistOrder {
  id: string;
  artist_id: string;
  playlist_id: string;
  position: number;
  playlist_title: string;
  playlist_cover_url: string | null;
  created_at: string;
}

interface AdminArtistEditorProps {
  artistId: string;
  artistName: string;
  tracks: Track[];
  albums: Album[];
  playlists: DeezerPlaylist[];
  onHiddenItemsChange: (hiddenItems: HiddenItem[]) => void;
  onPlaylistsChange?: (playlists: DeezerPlaylist[]) => void;
}

const AdminArtistEditor: React.FC<AdminArtistEditorProps> = ({
  artistId,
  artistName,
  tracks,
  albums,
  playlists,
  onHiddenItemsChange,
  onPlaylistsChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [hiddenItems, setHiddenItems] = useState<HiddenItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('tracks');
  
  // Playlist ordering state
  const [orderedPlaylists, setOrderedPlaylists] = useState<DeezerPlaylist[]>(playlists);
  const [playlistOrders, setPlaylistOrders] = useState<PlaylistOrder[]>([]);
  const [isReordering, setIsReordering] = useState(false);
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);
  
  // Add playlist state
  const [showAddPlaylist, setShowAddPlaylist] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<DeezerPlaylist[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  
  const { toast } = useToast();

  // Fetch hidden items for this artist
  useEffect(() => {
    const fetchHiddenItems = async () => {
      const { data, error } = await supabase
        .from('artist_hidden_items')
        .select('*')
        .eq('artist_id', artistId);

      if (!error && data) {
        setHiddenItems(data as HiddenItem[]);
        onHiddenItemsChange(data as HiddenItem[]);
      }
    };

    if (artistId) {
      fetchHiddenItems();
    }
  }, [artistId, onHiddenItemsChange]);

  // Update ordered playlists when playlists prop changes
  useEffect(() => {
    setOrderedPlaylists(playlists);
  }, [playlists]);

  // Search for playlists to add - prioritize SoundFlow playlists
  useEffect(() => {
    const searchPlaylists = async () => {
      if (!debouncedSearch.trim() || debouncedSearch.length < 2) {
        setSearchResults([]);
        return;
      }

      setIsSearching(true);
      try {
        const existingIds = orderedPlaylists.map(p => String(p.id));
        
        // First, search local SoundFlow public playlists
        const { data: localPlaylists } = await supabase
          .from('playlists')
          .select('id, name, cover_url, track_count, is_public')
          .eq('is_public', true)
          .ilike('name', `%${debouncedSearch}%`)
          .limit(10);
        
        const localResults: DeezerPlaylist[] = (localPlaylists || [])
          .filter(p => !existingIds.includes(`local-${p.id}`))
          .map(p => ({
            id: `local-${p.id}`,
            title: p.name,
            coverUrl: p.cover_url || '',
            trackCount: p.track_count || 0,
            creator: 'SoundFlow',
          }));
        
        // Then search Deezer playlists
        const deezerResults = await searchDeezerPlaylists(debouncedSearch);
        const filteredDeezer = deezerResults.filter(p => !existingIds.includes(String(p.id)));
        
        // Combine: SoundFlow first, then Deezer
        setSearchResults([...localResults, ...filteredDeezer]);
      } catch (error) {
        console.error('Error searching playlists:', error);
      } finally {
        setIsSearching(false);
      }
    };

    searchPlaylists();
  }, [debouncedSearch, orderedPlaylists]);

  const hideItem = async (itemId: string, itemType: 'track' | 'album' | 'playlist', itemTitle: string) => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('artist_hidden_items')
        .insert({
          artist_id: artistId,
          item_id: itemId,
          item_type: itemType,
          item_title: itemTitle,
          hidden_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      const newHiddenItems = [...hiddenItems, data as HiddenItem];
      setHiddenItems(newHiddenItems);
      onHiddenItemsChange(newHiddenItems);
      
      toast({
        title: 'Elemento nascosto',
        description: `"${itemTitle}" è stato nascosto per tutti gli utenti.`,
      });
    } catch (error: any) {
      toast({
        title: 'Errore',
        description: error.message || 'Impossibile nascondere l\'elemento.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const unhideItem = async (hiddenItem: HiddenItem) => {
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('artist_hidden_items')
        .delete()
        .eq('id', hiddenItem.id);

      if (error) throw error;

      const newHiddenItems = hiddenItems.filter(h => h.id !== hiddenItem.id);
      setHiddenItems(newHiddenItems);
      onHiddenItemsChange(newHiddenItems);
      
      toast({
        title: 'Elemento ripristinato',
        description: `"${hiddenItem.item_title}" è di nuovo visibile.`,
      });
    } catch (error: any) {
      toast({
        title: 'Errore',
        description: error.message || 'Impossibile ripristinare l\'elemento.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Drag and drop handlers for playlist reordering
  const handleDragStart = (index: number) => {
    dragItem.current = index;
    setIsReordering(true);
  };

  const handleDragEnter = (index: number) => {
    dragOverItem.current = index;
  };

  const handleDragEnd = () => {
    if (dragItem.current === null || dragOverItem.current === null) {
      setIsReordering(false);
      return;
    }

    const newPlaylists = [...orderedPlaylists];
    const draggedItem = newPlaylists[dragItem.current];
    newPlaylists.splice(dragItem.current, 1);
    newPlaylists.splice(dragOverItem.current, 0, draggedItem);
    
    setOrderedPlaylists(newPlaylists);
    onPlaylistsChange?.(newPlaylists);
    
    dragItem.current = null;
    dragOverItem.current = null;
    setIsReordering(false);

    toast({
      title: 'Ordine aggiornato',
      description: 'L\'ordine delle playlist è stato modificato.',
    });
  };

  // Add playlist to artist
  const addPlaylist = (playlist: DeezerPlaylist) => {
    const newPlaylists = [...orderedPlaylists, playlist];
    setOrderedPlaylists(newPlaylists);
    onPlaylistsChange?.(newPlaylists);
    setSearchQuery('');
    setSearchResults([]);
    setShowAddPlaylist(false);

    toast({
      title: 'Playlist aggiunta',
      description: `"${playlist.title}" è stata aggiunta all'artista.`,
    });
  };

  // Remove playlist from artist
  const removePlaylist = (playlistId: string) => {
    const playlist = orderedPlaylists.find(p => String(p.id) === playlistId);
    const newPlaylists = orderedPlaylists.filter(p => String(p.id) !== playlistId);
    setOrderedPlaylists(newPlaylists);
    onPlaylistsChange?.(newPlaylists);

    if (playlist) {
      toast({
        title: 'Playlist rimossa',
        description: `"${playlist.title}" è stata rimossa dall'artista.`,
      });
    }
  };

  const isHidden = (itemId: string, itemType: string) => 
    hiddenItems.some(h => h.item_id === itemId && h.item_type === itemType);

  const getHiddenItem = (itemId: string, itemType: string) =>
    hiddenItems.find(h => h.item_id === itemId && h.item_type === itemType);

  const renderItemList = (
    items: { id: string; title: string; subtitle?: string; coverUrl?: string }[],
    itemType: 'track' | 'album' | 'playlist',
    icon: React.ReactNode
  ) => (
    <div className="space-y-2">
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">Nessun elemento</p>
      ) : (
        items.map((item) => {
          const hidden = isHidden(item.id, itemType);
          const hiddenItem = getHiddenItem(item.id, itemType);
          return (
            <div
              key={item.id}
              className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${
                hidden ? 'bg-destructive/10 opacity-60' : 'bg-secondary/50'
              }`}
            >
              <div className="w-10 h-10 rounded overflow-hidden bg-muted flex-shrink-0">
                {item.coverUrl ? (
                  <img src={item.coverUrl} alt={item.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                    {icon}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${hidden ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                  {item.title}
                </p>
                {item.subtitle && (
                  <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>
                )}
              </div>
              <Button
                variant={hidden ? 'outline' : 'ghost'}
                size="sm"
                disabled={isLoading}
                onClick={() => {
                  if (hidden && hiddenItem) {
                    unhideItem(hiddenItem);
                  } else {
                    hideItem(item.id, itemType, item.title);
                  }
                }}
                className={hidden ? 'text-primary' : 'text-destructive hover:text-destructive'}
              >
                {hidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </Button>
            </div>
          );
        })
      )}
    </div>
  );

  const renderPlaylistList = () => (
    <div className="space-y-2">
      {/* Add playlist button */}
      <Button
        variant="outline"
        size="sm"
        className="w-full gap-2 mb-3"
        onClick={() => setShowAddPlaylist(true)}
      >
        <Plus className="w-4 h-4" />
        Aggiungi playlist
      </Button>

      {/* Add playlist search modal */}
      {showAddPlaylist && (
        <div className="mb-4 p-3 rounded-lg bg-secondary border">
          <div className="flex items-center gap-2 mb-3">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Cerca playlist..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-9"
                autoFocus
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowAddPlaylist(false);
                setSearchQuery('');
                setSearchResults([]);
              }}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          {isSearching && (
            <p className="text-sm text-muted-foreground text-center py-2">Ricerca...</p>
          )}

          {searchResults.length > 0 && (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {searchResults.slice(0, 5).map((playlist) => (
                <div
                  key={playlist.id}
                  className="flex items-center gap-3 p-2 rounded-lg bg-background hover:bg-accent cursor-pointer transition-colors"
                  onClick={() => addPlaylist(playlist)}
                >
                  <div className="w-10 h-10 rounded overflow-hidden bg-muted flex-shrink-0">
                    {playlist.coverUrl ? (
                      <img src={playlist.coverUrl} alt={playlist.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                        <ListMusic className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{playlist.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{playlist.trackCount} brani</p>
                  </div>
                  <Plus className="w-4 h-4 text-primary" />
                </div>
              ))}
            </div>
          )}

          {!isSearching && searchQuery.length >= 2 && searchResults.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-2">Nessuna playlist trovata</p>
          )}
        </div>
      )}

      {/* Playlist list with drag-and-drop */}
      {orderedPlaylists.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">Nessuna playlist</p>
      ) : (
        orderedPlaylists.map((playlist, index) => {
          const playlistId = String(playlist.id);
          const hidden = isHidden(playlistId, 'playlist');
          const hiddenItem = getHiddenItem(playlistId, 'playlist');
          
          return (
            <div
              key={playlistId}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragEnter={() => handleDragEnter(index)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => e.preventDefault()}
              className={`flex items-center gap-2 p-2 rounded-lg transition-all ${
                hidden ? 'bg-destructive/10 opacity-60' : 'bg-secondary/50'
              } ${isReordering ? 'cursor-grabbing' : 'cursor-grab'}`}
            >
              <GripVertical className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <div className="w-10 h-10 rounded overflow-hidden bg-muted flex-shrink-0">
                {playlist.coverUrl ? (
                  <img src={playlist.coverUrl} alt={playlist.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                    <ListMusic className="w-4 h-4" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${hidden ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                  {playlist.title}
                </p>
                <p className="text-xs text-muted-foreground truncate">{playlist.trackCount} brani</p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removePlaylist(playlistId)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
                <Button
                  variant={hidden ? 'outline' : 'ghost'}
                  size="sm"
                  disabled={isLoading}
                  onClick={() => {
                    if (hidden && hiddenItem) {
                      unhideItem(hiddenItem);
                    } else {
                      hideItem(playlistId, 'playlist', playlist.title);
                    }
                  }}
                  className={hidden ? 'text-primary' : 'text-destructive hover:text-destructive'}
                >
                  {hidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );

  const trackItems = tracks.map(t => ({
    id: t.id,
    title: t.title,
    subtitle: t.album,
    coverUrl: t.coverUrl,
  }));

  const albumItems = albums.map(a => ({
    id: a.id,
    title: a.title,
    subtitle: a.releaseDate ? new Date(a.releaseDate).getFullYear().toString() : undefined,
    coverUrl: a.coverUrl,
  }));

  const hiddenCount = hiddenItems.length;

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="relative">
          <EyeOff className="w-4 h-4" />
          {hiddenCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 text-xs rounded-full bg-destructive text-destructive-foreground flex items-center justify-center">
              {hiddenCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent 
        side="right" 
        className="w-full sm:max-w-lg flex flex-col"
        style={{
          paddingTop: 'max(env(safe-area-inset-top), 1rem)',
          paddingBottom: 'max(env(safe-area-inset-bottom), 1rem)',
          paddingRight: 'max(env(safe-area-inset-right), 1.5rem)',
        }}
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <EyeOff className="w-5 h-5" />
            Gestisci {artistName}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 flex-1 flex flex-col min-h-0">
          <p className="text-sm text-muted-foreground mb-4">
            Nascondi brani, album o playlist per tutti gli utenti. Riordina e aggiungi playlist all'artista.
          </p>

          {/* Hidden items summary */}
          {hiddenCount > 0 && (
            <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-destructive">
                  {hiddenCount} elementi nascosti
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-destructive"
                  onClick={async () => {
                    for (const item of hiddenItems) {
                      await unhideItem(item);
                    }
                  }}
                  disabled={isLoading}
                >
                  <Trash2 className="w-3 h-3 mr-1" />
                  Ripristina tutti
                </Button>
              </div>
            </div>
          )}

          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
            <TabsList className="w-full grid grid-cols-3 flex-shrink-0">
              <TabsTrigger value="tracks" className="gap-1">
                <Music className="w-3 h-3" />
                Brani
              </TabsTrigger>
              <TabsTrigger value="albums" className="gap-1">
                <Disc className="w-3 h-3" />
                Album
              </TabsTrigger>
              <TabsTrigger value="playlists" className="gap-1">
                <ListMusic className="w-3 h-3" />
                Playlist
              </TabsTrigger>
            </TabsList>
            
            <ScrollArea className="flex-1 mt-4">
              <TabsContent value="tracks" className="mt-0">
                {renderItemList(trackItems, 'track', <Music className="w-4 h-4" />)}
              </TabsContent>
              <TabsContent value="albums" className="mt-0">
                {renderItemList(albumItems, 'album', <Disc className="w-4 h-4" />)}
              </TabsContent>
              <TabsContent value="playlists" className="mt-0">
                {renderPlaylistList()}
              </TabsContent>
            </ScrollArea>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default AdminArtistEditor;
