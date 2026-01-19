import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function useAlbumSocial(albumId: string, albumTitle: string, albumArtist: string, albumCoverUrl?: string) {
  const { user } = useAuth();
  const [isLiked, setIsLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [commentsCount, setCommentsCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    if (!albumId) {
      setIsLoading(false);
      return;
    }

    try {
      // Get total likes count
      const { count: totalLikes } = await supabase
        .from('album_likes')
        .select('*', { count: 'exact', head: true })
        .eq('album_id', albumId);

      setLikesCount(totalLikes || 0);

      // Get comments count
      const { count: totalComments } = await supabase
        .from('comments')
        .select('*', { count: 'exact', head: true })
        .eq('album_id', albumId);

      setCommentsCount(totalComments || 0);

      // Check if current user liked
      if (user?.id) {
        const { data } = await supabase
          .from('album_likes')
          .select('id')
          .eq('album_id', albumId)
          .eq('user_id', user.id)
          .maybeSingle();

        setIsLiked(!!data);
      }
    } catch (error) {
      console.error('Error fetching album social status:', error);
    } finally {
      setIsLoading(false);
    }
  }, [albumId, user?.id]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const likeAlbum = async () => {
    if (!user?.id || !albumId) return false;

    try {
      const { error } = await supabase
        .from('album_likes')
        .insert({
          album_id: albumId,
          album_title: albumTitle,
          album_artist: albumArtist,
          album_cover_url: albumCoverUrl,
          user_id: user.id,
        });

      if (error) throw error;
      setIsLiked(true);
      setLikesCount(prev => prev + 1);
      return true;
    } catch (error) {
      console.error('Error liking album:', error);
      return false;
    }
  };

  const unlikeAlbum = async () => {
    if (!user?.id || !albumId) return false;

    try {
      const { error } = await supabase
        .from('album_likes')
        .delete()
        .eq('album_id', albumId)
        .eq('user_id', user.id);

      if (error) throw error;
      setIsLiked(false);
      setLikesCount(prev => Math.max(0, prev - 1));
      return true;
    } catch (error) {
      console.error('Error unliking album:', error);
      return false;
    }
  };

  const toggleLike = async () => {
    if (isLiked) {
      return unlikeAlbum();
    } else {
      return likeAlbum();
    }
  };

  return {
    isLiked,
    likesCount,
    commentsCount,
    isLoading,
    toggleLike,
    refetch: fetchStatus,
  };
}
