import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { SocialProfile } from './useSocialProfile';

export interface Comment {
  id: string;
  user_id: string;
  content: string;
  post_id: string | null;
  album_id: string | null;
  parent_id: string | null;
  likes_count: number;
  replies_count: number;
  created_at: string;
  profile?: SocialProfile;
  is_liked?: boolean;
  replies?: Comment[];
}

interface UseCommentsOptions {
  postId?: string;
  albumId?: string;
}

export function useComments({ postId, albumId }: UseCommentsOptions) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchComments = useCallback(async () => {
    if (!postId && !albumId) {
      setIsLoading(false);
      return;
    }

    try {
      let query = supabase
        .from('comments')
        .select('*')
        .is('parent_id', null)
        .order('created_at', { ascending: false });

      if (postId) {
        query = query.eq('post_id', postId);
      } else if (albumId) {
        query = query.eq('album_id', albumId);
      }

      const { data: commentsData, error } = await query;
      if (error) throw error;

      // Fetch profiles
      const userIds = [...new Set(commentsData?.map(c => c.user_id) || [])];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('*')
        .in('id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      // Check likes
      const commentIds = commentsData?.map(c => c.id) || [];
      let likedCommentIds = new Set<string>();
      
      if (user?.id && commentIds.length > 0) {
        const { data: likes } = await supabase
          .from('comment_likes')
          .select('comment_id')
          .eq('user_id', user.id)
          .in('comment_id', commentIds);

        likedCommentIds = new Set(likes?.map(l => l.comment_id) || []);
      }

      const commentsWithProfiles: Comment[] = (commentsData || []).map(comment => ({
        ...comment,
        profile: profileMap.get(comment.user_id) as SocialProfile,
        is_liked: likedCommentIds.has(comment.id),
      }));

      setComments(commentsWithProfiles);
    } catch (error) {
      console.error('Error fetching comments:', error);
    } finally {
      setIsLoading(false);
    }
  }, [postId, albumId, user?.id]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const fetchReplies = async (parentId: string): Promise<Comment[]> => {
    try {
      const { data: repliesData, error } = await supabase
        .from('comments')
        .select('*')
        .eq('parent_id', parentId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Fetch profiles
      const userIds = [...new Set(repliesData?.map(c => c.user_id) || [])];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('*')
        .in('id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      // Check likes
      const replyIds = repliesData?.map(c => c.id) || [];
      let likedReplyIds = new Set<string>();
      
      if (user?.id && replyIds.length > 0) {
        const { data: likes } = await supabase
          .from('comment_likes')
          .select('comment_id')
          .eq('user_id', user.id)
          .in('comment_id', replyIds);

        likedReplyIds = new Set(likes?.map(l => l.comment_id) || []);
      }

      return (repliesData || []).map(reply => ({
        ...reply,
        profile: profileMap.get(reply.user_id) as SocialProfile,
        is_liked: likedReplyIds.has(reply.id),
      }));
    } catch (error) {
      console.error('Error fetching replies:', error);
      return [];
    }
  };

  const addComment = async (content: string, parentId?: string) => {
    if (!user?.id || (!postId && !albumId)) return null;

    try {
      const { data, error } = await supabase
        .from('comments')
        .insert({
          user_id: user.id,
          content,
          post_id: postId || null,
          album_id: albumId || null,
          parent_id: parentId || null,
        })
        .select()
        .single();

      if (error) throw error;

      // Fetch profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      const newComment: Comment = {
        ...data,
        profile: profile as SocialProfile,
        is_liked: false,
      };

      if (parentId) {
        // Update parent's replies count
        setComments(prev => prev.map(c => 
          c.id === parentId 
            ? { ...c, replies_count: c.replies_count + 1 }
            : c
        ));
      } else {
        setComments(prev => [newComment, ...prev]);
      }

      return newComment;
    } catch (error) {
      console.error('Error adding comment:', error);
      return null;
    }
  };

  const deleteComment = async (commentId: string) => {
    if (!user?.id) return false;

    try {
      const { error } = await supabase
        .from('comments')
        .delete()
        .eq('id', commentId)
        .eq('user_id', user.id);

      if (error) throw error;
      setComments(prev => prev.filter(c => c.id !== commentId));
      return true;
    } catch (error) {
      console.error('Error deleting comment:', error);
      return false;
    }
  };

  const likeComment = async (commentId: string) => {
    if (!user?.id) return false;

    try {
      const { error } = await supabase
        .from('comment_likes')
        .insert({ comment_id: commentId, user_id: user.id });

      if (error) throw error;
      
      setComments(prev => prev.map(c => 
        c.id === commentId 
          ? { ...c, is_liked: true, likes_count: c.likes_count + 1 }
          : c
      ));
      return true;
    } catch (error) {
      console.error('Error liking comment:', error);
      return false;
    }
  };

  const unlikeComment = async (commentId: string) => {
    if (!user?.id) return false;

    try {
      const { error } = await supabase
        .from('comment_likes')
        .delete()
        .eq('comment_id', commentId)
        .eq('user_id', user.id);

      if (error) throw error;
      
      setComments(prev => prev.map(c => 
        c.id === commentId 
          ? { ...c, is_liked: false, likes_count: Math.max(0, c.likes_count - 1) }
          : c
      ));
      return true;
    } catch (error) {
      console.error('Error unliking comment:', error);
      return false;
    }
  };

  return {
    comments,
    isLoading,
    addComment,
    deleteComment,
    likeComment,
    unlikeComment,
    fetchReplies,
    refetch: fetchComments,
  };
}
