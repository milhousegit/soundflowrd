import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { SocialProfile, UserPost } from './useSocialProfile';

export interface FeedPost extends UserPost {
  profile: SocialProfile;
  is_liked: boolean;
}

export interface FeedItem {
  type: 'post' | 'release' | 'comment';
  id: string;
  created_at: string;
  data: FeedPost | AlbumRelease | AlbumComment;
}

export interface AlbumRelease {
  id: string;
  title: string;
  artist: { id: string; name: string };
  cover_medium: string;
  release_date: string;
  record_type: string;
}

export interface AlbumComment {
  id: string;
  content: string;
  created_at: string;
  album_id: string;
  user_id: string;
  profile: SocialProfile;
  is_liked: boolean;
  likes_count: number;
  album_title?: string;
  album_artist?: string;
  album_cover?: string;
}

export function useFeed() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);

  // For backward compatibility
  const posts = feedItems
    .filter(item => item.type === 'post')
    .map(item => item.data as FeedPost);

  const fetchFeed = useCallback(async (offset = 0) => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    try {
      const allItems: FeedItem[] = [];
      const { showArtistReleases, showFollowingPosts, showAlbumComments } = settings.feedDisplayOptions;

      // Get users I follow
      const { data: follows } = await supabase
        .from('user_follows')
        .select('following_id')
        .eq('follower_id', user.id);

      const followingIds = follows?.map(f => f.following_id) || [];
      
      // Get albums I like
      const { data: likedAlbums } = await supabase
        .from('album_likes')
        .select('album_id, album_title, album_artist, album_cover_url')
        .eq('user_id', user.id);
      
      const likedAlbumIds = likedAlbums?.map(a => a.album_id) || [];
      const albumInfoMap = new Map(likedAlbums?.map(a => [a.album_id, { title: a.album_title, artist: a.album_artist, cover: a.album_cover_url }]) || []);

      // 1. Fetch posts from followed users (if enabled)
      if (showFollowingPosts) {
        const allUserIds = [...followingIds, user.id];

        const { data: postsFromFollowing } = await supabase
          .from('posts')
          .select('*')
          .in('user_id', allUserIds)
          .order('created_at', { ascending: false })
          .range(offset, offset + 19);

        // Also get posts with tracks from albums I like
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

        // Fetch profiles for posts
        const userIds = [...new Set(allPosts.map(p => p.user_id))];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('*')
          .in('id', userIds);

        const { data: adminRoles } = await supabase
          .from('user_roles')
          .select('user_id')
          .in('user_id', userIds)
          .eq('role', 'admin');
        
        const adminUserIds = new Set(adminRoles?.map(r => r.user_id) || []);
        const profileMap = new Map(profiles?.map(p => [p.id, { ...p, is_admin: adminUserIds.has(p.id) }]) || []);

        // Check liked posts
        const postIds = allPosts.map(p => p.id);
        const { data: likes } = await supabase
          .from('post_likes')
          .select('post_id')
          .eq('user_id', user.id)
          .in('post_id', postIds);

        const likedPostIds = new Set(likes?.map(l => l.post_id) || []);

        for (const post of allPosts) {
          allItems.push({
            type: 'post',
            id: `post-${post.id}`,
            created_at: post.created_at,
            data: {
              ...post,
              profile: profileMap.get(post.user_id) as SocialProfile,
              is_liked: likedPostIds.has(post.id),
            }
          });
        }
      }

      // 2. Fetch new releases from favorite artists (if enabled)
      if (showArtistReleases) {
        const { data: favorites } = await supabase
          .from('favorites')
          .select('item_id, item_title')
          .eq('user_id', user.id)
          .eq('item_type', 'artist');

        if (favorites && favorites.length > 0) {
          const artistIds = [...new Set(favorites.map(f => f.item_id))];
          
          // Fetch latest releases for each artist from Deezer API
          for (const artistId of artistIds.slice(0, 10)) { // Limit to 10 artists for performance
            try {
              const { data: releases } = await supabase.functions.invoke('deezer', {
                body: { action: 'getArtistAlbums', artistId, limit: 3 }
              });

              if (releases?.data) {
                const sevenDaysAgo = new Date();
                sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 30); // Last 30 days

                for (const album of releases.data) {
                  const releaseDate = new Date(album.release_date);
                  if (releaseDate >= sevenDaysAgo) {
                    allItems.push({
                      type: 'release',
                      id: `release-${album.id}`,
                      created_at: album.release_date,
                      data: album as AlbumRelease
                    });
                  }
                }
              }
            } catch (error) {
              console.error('Error fetching artist releases:', error);
            }
          }
        }
      }

      // 3. Fetch comments on liked albums (if enabled)
      if (showAlbumComments && likedAlbumIds.length > 0) {
        const { data: comments } = await supabase
          .from('comments')
          .select('*')
          .in('album_id', likedAlbumIds)
          .is('post_id', null)
          .order('created_at', { ascending: false })
          .limit(20);

        if (comments && comments.length > 0) {
          const commentUserIds = [...new Set(comments.map(c => c.user_id))];
          const { data: commentProfiles } = await supabase
            .from('profiles')
            .select('*')
            .in('id', commentUserIds);

          const { data: commentAdminRoles } = await supabase
            .from('user_roles')
            .select('user_id')
            .in('user_id', commentUserIds)
            .eq('role', 'admin');

          const commentAdminUserIds = new Set(commentAdminRoles?.map(r => r.user_id) || []);
          const commentProfileMap = new Map(commentProfiles?.map(p => [p.id, { ...p, is_admin: commentAdminUserIds.has(p.id) }]) || []);

          // Check liked comments
          const commentIds = comments.map(c => c.id);
          const { data: commentLikes } = await supabase
            .from('comment_likes')
            .select('comment_id')
            .eq('user_id', user.id)
            .in('comment_id', commentIds);

          const likedCommentIds = new Set(commentLikes?.map(l => l.comment_id) || []);

          for (const comment of comments) {
            const albumInfo = albumInfoMap.get(comment.album_id);
            allItems.push({
              type: 'comment',
              id: `comment-${comment.id}`,
              created_at: comment.created_at,
              data: {
                ...comment,
                profile: commentProfileMap.get(comment.user_id) as SocialProfile,
                is_liked: likedCommentIds.has(comment.id),
                album_title: albumInfo?.title,
                album_artist: albumInfo?.artist,
                album_cover: albumInfo?.cover,
              } as AlbumComment
            });
          }
        }
      }

      // Sort all items by created_at descending
      allItems.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      // Deduplicate
      const seenItemIds = new Set<string>();
      const dedupedItems = allItems.filter(item => {
        if (seenItemIds.has(item.id)) return false;
        seenItemIds.add(item.id);
        return true;
      });

      const paginatedItems = dedupedItems.slice(0, 20);

      if (paginatedItems.length < 20) {
        setHasMore(false);
      }

      if (offset === 0) {
        setFeedItems(paginatedItems);
      } else {
        setFeedItems(prev => [...prev, ...paginatedItems]);
      }
    } catch (error) {
      console.error('Error fetching feed:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, settings.feedDisplayOptions]);

  useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);

  const loadMore = () => {
    if (!isLoading && hasMore) {
      fetchFeed(feedItems.length);
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

      setFeedItems(prev => [{
        type: 'post',
        id: `post-${data.id}`,
        created_at: data.created_at,
        data: newPost
      }, ...prev]);
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
      setFeedItems(prev => prev.filter(item => item.id !== `post-${postId}`));
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
      
      setFeedItems(prev => prev.map(item => {
        if (item.type === 'post' && item.id === `post-${postId}`) {
          const post = item.data as FeedPost;
          return {
            ...item,
            data: { ...post, is_liked: true, likes_count: (post.likes_count || 0) + 1 }
          };
        }
        return item;
      }));
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
      
      setFeedItems(prev => prev.map(item => {
        if (item.type === 'post' && item.id === `post-${postId}`) {
          const post = item.data as FeedPost;
          return {
            ...item,
            data: { ...post, is_liked: false, likes_count: Math.max(0, (post.likes_count || 0) - 1) }
          };
        }
        return item;
      }));
      return true;
    } catch (error) {
      console.error('Error unliking post:', error);
      return false;
    }
  };

  return {
    posts,
    feedItems,
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
