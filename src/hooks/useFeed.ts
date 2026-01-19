import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { SocialProfile, UserPost } from './useSocialProfile';

export interface FeedPost extends UserPost {
  profile: SocialProfile;
  is_liked: boolean;
}

export function useFeed() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);

  const fetchFeed = useCallback(async (offset = 0) => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    try {
      // Get users I follow
      const { data: follows } = await supabase
        .from('user_follows')
        .select('following_id')
        .eq('follower_id', user.id);

      const followingIds = follows?.map(f => f.following_id) || [];
      
      // Get albums I follow (from album_likes)
      const { data: likedAlbums } = await supabase
        .from('album_likes')
        .select('album_id')
        .eq('user_id', user.id);
      
      const likedAlbumIds = likedAlbums?.map(a => a.album_id) || [];
      
      // Include my own posts + followed users posts
      const allUserIds = [...followingIds, user.id];

      // Fetch posts from followed users and self
      let postsQuery = supabase
        .from('posts')
        .select('*')
        .order('created_at', { ascending: false })
        .range(offset, offset + 19);

      // We need to get posts where:
      // 1. user_id is in allUserIds (my posts or followed users)
      // 2. OR track_album_id is in likedAlbumIds (posts with tracks from albums I follow)
      
      const { data: postsFromFollowing, error: error1 } = await supabase
        .from('posts')
        .select('*')
        .in('user_id', allUserIds)
        .order('created_at', { ascending: false })
        .range(offset, offset + 19);

      if (error1) throw error1;

      // Also get posts with tracks from albums I follow
      let postsFromAlbums: any[] = [];
      if (likedAlbumIds.length > 0) {
        const { data: albumPosts } = await supabase
          .from('posts')
          .select('*')
          .in('track_album_id', likedAlbumIds)
          .order('created_at', { ascending: false })
          .range(0, 19);
        
        postsFromAlbums = albumPosts || [];
      }

      // Merge and deduplicate posts
      const allPosts = [...(postsFromFollowing || [])];
      const seenIds = new Set(allPosts.map(p => p.id));
      
      for (const post of postsFromAlbums) {
        if (!seenIds.has(post.id)) {
          allPosts.push(post);
          seenIds.add(post.id);
        }
      }

      // Sort by created_at descending
      allPosts.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      const postsData = allPosts.slice(0, 20);

      if (!postsData || postsData.length < 20) {
        setHasMore(false);
      }

      // Fetch profiles for these posts
      const userIds = [...new Set(postsData?.map(p => p.user_id) || [])];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('*')
        .in('id', userIds);

      // Check which users are admins
      const { data: adminRoles } = await supabase
        .from('user_roles')
        .select('user_id')
        .in('user_id', userIds)
        .eq('role', 'admin');
      
      const adminUserIds = new Set(adminRoles?.map(r => r.user_id) || []);

      const profileMap = new Map(profiles?.map(p => [p.id, { ...p, is_admin: adminUserIds.has(p.id) }]) || []);

      // Check which posts I've liked
      const postIds = postsData?.map(p => p.id) || [];
      const { data: likes } = await supabase
        .from('post_likes')
        .select('post_id')
        .eq('user_id', user.id)
        .in('post_id', postIds);

      const likedPostIds = new Set(likes?.map(l => l.post_id) || []);

      const feedPosts: FeedPost[] = (postsData || []).map(post => ({
        ...post,
        profile: profileMap.get(post.user_id) as SocialProfile,
        is_liked: likedPostIds.has(post.id),
      }));

      if (offset === 0) {
        setPosts(feedPosts);
      } else {
        setPosts(prev => [...prev, ...feedPosts]);
      }
    } catch (error) {
      console.error('Error fetching feed:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);

  const loadMore = () => {
    if (!isLoading && hasMore) {
      fetchFeed(posts.length);
    }
  };

  const createPost = async (content: string, track?: {
    id: string;
    title: string;
    artist: string;
    album?: string;
    albumId?: string;
    coverUrl?: string;
    duration?: number;
  }) => {
    if (!user?.id) return null;

    try {
      const { data, error } = await supabase
        .from('posts')
        .insert({
          user_id: user.id,
          content,
          track_id: track?.id,
          track_title: track?.title,
          track_artist: track?.artist,
          track_album: track?.album,
          track_album_id: track?.albumId,
          track_cover_url: track?.coverUrl,
          track_duration: track?.duration,
        })
        .select()
        .single();

      if (error) throw error;

      // Add to local state with profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      const newPost: FeedPost = {
        ...data,
        profile: profile as SocialProfile,
        is_liked: false,
      };

      setPosts(prev => [newPost, ...prev]);
      return data;
    } catch (error) {
      console.error('Error creating post:', error);
      return null;
    }
  };

  const deletePost = async (postId: string) => {
    if (!user?.id) return false;

    try {
      const { error } = await supabase
        .from('posts')
        .delete()
        .eq('id', postId)
        .eq('user_id', user.id);

      if (error) throw error;
      setPosts(prev => prev.filter(p => p.id !== postId));
      return true;
    } catch (error) {
      console.error('Error deleting post:', error);
      return false;
    }
  };

  const likePost = async (postId: string) => {
    if (!user?.id) return false;

    try {
      const { error } = await supabase
        .from('post_likes')
        .insert({ post_id: postId, user_id: user.id });

      if (error) throw error;
      
      setPosts(prev => prev.map(p => 
        p.id === postId 
          ? { ...p, is_liked: true, likes_count: p.likes_count + 1 }
          : p
      ));
      return true;
    } catch (error) {
      console.error('Error liking post:', error);
      return false;
    }
  };

  const unlikePost = async (postId: string) => {
    if (!user?.id) return false;

    try {
      const { error } = await supabase
        .from('post_likes')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', user.id);

      if (error) throw error;
      
      setPosts(prev => prev.map(p => 
        p.id === postId 
          ? { ...p, is_liked: false, likes_count: Math.max(0, p.likes_count - 1) }
          : p
      ));
      return true;
    } catch (error) {
      console.error('Error unliking post:', error);
      return false;
    }
  };

  return {
    posts,
    isLoading,
    hasMore,
    loadMore,
    createPost,
    deletePost,
    likePost,
    unlikePost,
    refetch: () => fetchFeed(0),
  };
}
