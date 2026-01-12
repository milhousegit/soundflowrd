import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Track, Album, Artist } from '@/types/music';
import { toast } from 'sonner';
import { syncTrackInBackground } from '@/hooks/useSyncTrack';

interface Favorite {
  id: string;
  user_id: string;
  item_type: string;
  item_id: string;
  item_title: string;
  item_artist: string | null;
  item_cover_url: string | null;
  item_data: any;
  created_at: string;
}

export function useFavorites() {
  const { user, isAuthenticated, credentials } = useAuth();
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchFavorites = useCallback(async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('favorites')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setFavorites(data || []);
    } catch (error) {
      console.error('Error fetching favorites:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (isAuthenticated && user) {
      fetchFavorites();
    } else {
      setFavorites([]);
    }
  }, [isAuthenticated, user, fetchFavorites]);

  const isFavorite = useCallback((itemType: 'track' | 'album' | 'artist', itemId: string) => {
    return favorites.some(f => f.item_type === itemType && f.item_id === itemId);
  }, [favorites]);

  const addFavorite = useCallback(async (
    itemType: 'track' | 'album' | 'artist',
    item: Track | Album | Artist
  ) => {
    if (!user) {
      toast.error('Devi effettuare il login per aggiungere ai preferiti');
      return false;
    }

    try {
      const itemTitle = 'title' in item ? item.title : item.name;
      const itemArtist = 'artist' in item ? item.artist : null;
      const itemCoverUrl = 'coverUrl' in item ? item.coverUrl : ('imageUrl' in item ? item.imageUrl : null);

      const { error } = await supabase
        .from('favorites')
        .insert([{
          user_id: user.id,
          item_type: itemType,
          item_id: item.id,
          item_title: itemTitle,
          item_artist: itemArtist,
          item_cover_url: itemCoverUrl,
          item_data: item as any,
        }]);

      if (error) throw error;
      
      await fetchFavorites();
      toast.success('Aggiunto ai preferiti');

      // Auto-sync track to Real-Debrid in background when favoriting
      if (itemType === 'track' && credentials?.realDebridApiKey) {
        syncTrackInBackground(item as Track, credentials.realDebridApiKey);
      }

      // Track artist for new release notifications (in background, don't block)
      if (itemType === 'artist') {
        const artistName = 'name' in item ? item.name : (item as any).title || 'Unknown';
        supabase.from('artist_release_tracking').upsert({
          user_id: user.id,
          artist_id: item.id,
          artist_name: artistName,
        }, { onConflict: 'user_id,artist_id', ignoreDuplicates: true })
        .then(() => console.log('Artist tracking saved'))
        .then(undefined, (e) => console.log('Failed to track artist for notifications:', e));
      }

      return true;
    } catch (error) {
      console.error('Error adding favorite:', error);
      toast.error('Errore durante l\'aggiunta ai preferiti');
      return false;
    }
  }, [user, fetchFavorites, credentials]);

  const removeFavorite = useCallback(async (itemType: 'track' | 'album' | 'artist', itemId: string) => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('favorites')
        .delete()
        .eq('user_id', user.id)
        .eq('item_type', itemType)
        .eq('item_id', itemId);

      if (error) throw error;
      
      await fetchFavorites();
      toast.success('Rimosso dai preferiti');
      return true;
    } catch (error) {
      console.error('Error removing favorite:', error);
      toast.error('Errore durante la rimozione dai preferiti');
      return false;
    }
  }, [user, fetchFavorites]);

  const toggleFavorite = useCallback(async (
    itemType: 'track' | 'album' | 'artist',
    item: Track | Album | Artist
  ) => {
    if (isFavorite(itemType, item.id)) {
      return removeFavorite(itemType, item.id);
    } else {
      return addFavorite(itemType, item);
    }
  }, [isFavorite, addFavorite, removeFavorite]);

  const getFavoritesByType = useCallback((itemType: 'track' | 'album' | 'artist') => {
    return favorites.filter(f => f.item_type === itemType);
  }, [favorites]);

  return {
    favorites,
    isLoading,
    isFavorite,
    addFavorite,
    removeFavorite,
    toggleFavorite,
    getFavoritesByType,
    refetch: fetchFavorites,
  };
}
