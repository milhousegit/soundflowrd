import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, X, Trash2, Music, Disc, ListMusic } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { DeezerPlaylist } from '@/lib/deezer';

interface HiddenItem {
  id: string;
  artist_id: string;
  item_id: string;
  item_type: 'track' | 'album' | 'playlist';
  item_title: string;
  hidden_by: string;
  created_at: string;
}

interface AdminArtistEditorProps {
  artistId: string;
  artistName: string;
  tracks: Track[];
  albums: Album[];
  playlists: DeezerPlaylist[];
  onHiddenItemsChange: (hiddenItems: HiddenItem[]) => void;
}

const AdminArtistEditor: React.FC<AdminArtistEditorProps> = ({
  artistId,
  artistName,
  tracks,
  albums,
  playlists,
  onHiddenItemsChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [hiddenItems, setHiddenItems] = useState<HiddenItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
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

  const playlistItems = playlists.map(p => ({
    id: String(p.id),
    title: p.title,
    subtitle: `${p.trackCount} brani`,
    coverUrl: p.coverUrl,
  }));

  const hiddenCount = hiddenItems.length;

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <EyeOff className="w-4 h-4" />
          Gestisci contenuti
          {hiddenCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-destructive text-destructive-foreground">
              {hiddenCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-lg pt-[calc(env(safe-area-inset-top)+1rem)]">
        <SheetHeader className="pr-[env(safe-area-inset-right)]">
          <SheetTitle className="flex items-center gap-2">
            <EyeOff className="w-5 h-5" />
            Gestisci {artistName}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4">
          <p className="text-sm text-muted-foreground mb-4">
            Nascondi brani, album o playlist per tutti gli utenti. Gli elementi nascosti non appariranno nella pagina dell'artista.
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

          <Tabs defaultValue="tracks" className="w-full">
            <TabsList className="w-full grid grid-cols-3">
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
            
            <ScrollArea className="h-[calc(100vh-280px)] mt-4">
              <TabsContent value="tracks" className="mt-0">
                {renderItemList(trackItems, 'track', <Music className="w-4 h-4" />)}
              </TabsContent>
              <TabsContent value="albums" className="mt-0">
                {renderItemList(albumItems, 'album', <Disc className="w-4 h-4" />)}
              </TabsContent>
              <TabsContent value="playlists" className="mt-0">
                {renderItemList(playlistItems, 'playlist', <ListMusic className="w-4 h-4" />)}
              </TabsContent>
            </ScrollArea>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default AdminArtistEditor;
