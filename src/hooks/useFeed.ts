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
  type: 'post' | 'release' | 'comment' | 'playlist';
  id: string;
  created_at: string;
  data: FeedPost | AlbumRelease | AlbumComment | FeedPlaylist;
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

export interface FeedPlaylist {
  id: string;
  name: string;
  cover_url: string | null;
  description: string | null;
  track_count: number | null;
  created_at: string;
  user_id: string;
  profile: SocialProfile;
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
      const { showArtistReleases, showFollowingPosts, showAlbumComments, showFollowingPlaylists } = settings.feedDisplayOptions;

      // Fetch base data in parallel for speed
      const [followsResult, likedAlbumsResult, favoritesResult] = await Promise.all([
        supabase.from('user_follows').select('following_id').eq('follower_id', user.id),
        supabase.from('album_likes').select('album_id, album_title, album_artist, album_cover_url').eq('user_id', user.id),
        showArtistReleases 
          ? supabase.from('favorites').select('item_id, item_title').eq('user_id', user.id).eq('item_type', 'artist')
          : Promise.resolve({ data: null }),
      ]);

      const followingIds = followsResult.data?.map(f => f.following_id) || [];
      const likedAlbumIds = likedAlbumsResult.data?.map(a => a.album_id) || [];
      const albumInfoMap = new Map(likedAlbumsResult.data?.map(a => [a.album_id, { title: a.album_title, artist: a.album_artist, cover: a.album_cover_url }]) || []);

      const allItems: FeedItem[] = [];

      // Prepare parallel fetch promises
      const fetchPromises: Promise<void>[] = [];

      // 1. Fetch posts from followed users (if enabled)
      if (showFollowingPosts && followingIds.length > 0) {
        fetchPromises.push((async () => {
          const allUserIds = [...followingIds, user.id];

          // Fetch posts and album posts in parallel
          const [postsResult, albumPostsResult] = await Promise.all([
            supabase
              .from('posts')
              .select('*')
              .in('user_id', allUserIds)
              .order('created_at', { ascending: false })
              .range(offset, offset + 19),
            likedAlbumIds.length > 0
              ? supabase
                  .from('posts')
                  .select('*')
                  .in('track_album_id', likedAlbumIds)
                  .order('created_at', { ascending: false })
                  .range(0, 19)
              : Promise.resolve({ data: [] }),
          ]);

          // Merge and deduplicate posts
          const allPosts = [...(postsResult.data || [])];
          const seenIds = new Set(allPosts.map(p => p.id));
          
          for (const post of (albumPostsResult.data || [])) {
            if (!seenIds.has(post.id)) {
              allPosts.push(post);
              seenIds.add(post.id);
            }
          }

          if (allPosts.length === 0) return;

          // Fetch profiles and likes in parallel
          const userIds = [...new Set(allPosts.map(p => p.user_id))];
          const postIds = allPosts.map(p => p.id);

          const [profilesResult, adminRolesResult, likesResult] = await Promise.all([
            supabase.from('profiles').select('*').in('id', userIds),
            supabase.from('user_roles').select('user_id').in('user_id', userIds).eq('role', 'admin'),
            supabase.from('post_likes').select('post_id').eq('user_id', user.id).in('post_id', postIds),
          ]);

          const adminUserIds = new Set(adminRolesResult.data?.map(r => r.user_id) || []);
          const profileMap = new Map(profilesResult.data?.map(p => [p.id, { ...p, is_admin: adminUserIds.has(p.id) }]) || []);
          const likedPostIds = new Set(likesResult.data?.map(l => l.post_id) || []);

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
        })());
      }

      // 2. Fetch new releases from favorite artists (if enabled) - OPTIMIZED: limit API calls
      if (showArtistReleases && favoritesResult.data && favoritesResult.data.length > 0) {
        fetchPromises.push((async () => {
          const artistIds = [...new Set(favoritesResult.data.map(f => f.item_id))];
          
          // Limit to 10 artists for performance and use Promise.allSettled for resilience
          const artistPromises = artistIds.slice(0, 10).map(async (artistId) => {
            try {
              const { data: artistData } = await supabase.functions.invoke('deezer', {
                body: { action: 'get-artist', id: artistId }
              });

              if (artistData?.releases) {
                return artistData.releases.slice(0, 3).map((album: any) => ({
                  type: 'release' as const,
                  id: `release-${album.id}`,
                  created_at: album.releaseDate || album.release_date || new Date().toISOString(),
                  data: {
                    id: album.id,
                    title: album.title,
                    artist: { id: artistData.id, name: artistData.name },
                    cover_medium: album.coverUrl,
                    release_date: album.releaseDate || album.release_date,
                    record_type: album.recordType || 'album',
                  } as AlbumRelease
                }));
              }
              return [];
            } catch {
              return [];
            }
          });

          const results = await Promise.allSettled(artistPromises);
          for (const result of results) {
            if (result.status === 'fulfilled') {
              allItems.push(...result.value);
            }
          }
        })());
      }

      // 3. Fetch comments on liked albums (if enabled)
      if (showAlbumComments && likedAlbumIds.length > 0) {
        fetchPromises.push((async () => {
          const { data: comments } = await supabase
            .from('comments')
            .select('*')
            .in('album_id', likedAlbumIds)
            .is('post_id', null)
            .order('created_at', { ascending: false })
            .limit(20);

          if (!comments || comments.length === 0) return;

          const commentUserIds = [...new Set(comments.map(c => c.user_id))];
          const commentIds = comments.map(c => c.id);

          const [profilesResult, adminRolesResult, likesResult] = await Promise.all([
            supabase.from('profiles').select('*').in('id', commentUserIds),
            supabase.from('user_roles').select('user_id').in('user_id', commentUserIds).eq('role', 'admin'),
            supabase.from('comment_likes').select('comment_id').eq('user_id', user.id).in('comment_id', commentIds),
          ]);

          const adminUserIds = new Set(adminRolesResult.data?.map(r => r.user_id) || []);
          const profileMap = new Map(profilesResult.data?.map(p => [p.id, { ...p, is_admin: adminUserIds.has(p.id) }]) || []);
          const likedCommentIds = new Set(likesResult.data?.map(l => l.comment_id) || []);

          for (const comment of comments) {
            const albumInfo = albumInfoMap.get(comment.album_id);
            allItems.push({
              type: 'comment',
              id: `comment-${comment.id}`,
              created_at: comment.created_at,
              data: {
                ...comment,
                profile: profileMap.get(comment.user_id) as SocialProfile,
                is_liked: likedCommentIds.has(comment.id),
                album_title: albumInfo?.title,
                album_artist: albumInfo?.artist,
                album_cover: albumInfo?.cover,
              } as AlbumComment
            });
          }
        })());
      }

      // 4. Fetch public playlists from followed users (if enabled)
      if (showFollowingPlaylists && followingIds.length > 0) {
        fetchPromises.push((async () => {
          const { data: playlists } = await supabase
            .from('playlists')
            .select('*')
            .in('user_id', followingIds)
            .eq('is_public', true)
            .order('created_at', { ascending: false })
            .limit(20);

          if (!playlists || playlists.length === 0) return;

          const playlistUserIds = [...new Set(playlists.map(p => p.user_id))];

          const [profilesResult, adminRolesResult] = await Promise.all([
            supabase.from('profiles').select('*').in('id', playlistUserIds),
            supabase.from('user_roles').select('user_id').in('user_id', playlistUserIds).eq('role', 'admin'),
          ]);

          const adminUserIds = new Set(adminRolesResult.data?.map(r => r.user_id) || []);
          const profileMap = new Map(profilesResult.data?.map(p => [p.id, { ...p, is_admin: adminUserIds.has(p.id) }]) || []);

          for (const playlist of playlists) {
            allItems.push({
              type: 'playlist',
              id: `playlist-${playlist.id}`,
              created_at: playlist.created_at,
              data: {
                id: playlist.id,
                name: playlist.name,
                cover_url: playlist.cover_url,
                description: playlist.description,
                track_count: playlist.track_count,
                created_at: playlist.created_at,
                user_id: playlist.user_id,
                profile: profileMap.get(playlist.user_id) as SocialProfile,
              } as FeedPlaylist
            });
          }
        })());
      }

      // Wait for all fetches to complete
      await Promise.all(fetchPromises);

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
