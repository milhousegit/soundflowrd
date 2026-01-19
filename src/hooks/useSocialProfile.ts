import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface SocialProfile {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  bio_track_id: string | null;
  bio_track_title: string | null;
  bio_track_artist: string | null;
  bio_track_cover_url: string | null;
  is_private: boolean;
  followers_count: number;
  following_count: number;
  is_premium: boolean | null;
}

export interface UserPost {
  id: string;
  user_id: string;
  content: string | null;
  track_id: string | null;
  track_title: string | null;
  track_artist: string | null;
  track_album: string | null;
  track_cover_url: string | null;
  track_duration: number | null;
  likes_count: number;
  comments_count: number;
  created_at: string;
  profile?: SocialProfile;
  is_liked?: boolean;
}

export function useSocialProfile(userId?: string) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<SocialProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [posts, setPosts] = useState<UserPost[]>([]);

  const targetUserId = userId || user?.id;

  const fetchProfile = useCallback(async () => {
    if (!targetUserId) {
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', targetUserId)
        .single();

      if (error) throw error;
      setProfile(data as SocialProfile);
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setIsLoading(false);
    }
  }, [targetUserId]);

  const checkFollowStatus = useCallback(async () => {
    if (!user?.id || !targetUserId || user.id === targetUserId) return;

    try {
      const { data } = await supabase
        .from('user_follows')
        .select('id')
        .eq('follower_id', user.id)
        .eq('following_id', targetUserId)
        .maybeSingle();

      setIsFollowing(!!data);
    } catch (error) {
      console.error('Error checking follow status:', error);
    }
  }, [user?.id, targetUserId]);

  const fetchUserPosts = useCallback(async () => {
    if (!targetUserId) return;

    try {
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .eq('user_id', targetUserId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setPosts((data || []) as UserPost[]);
    } catch (error) {
      console.error('Error fetching posts:', error);
    }
  }, [targetUserId]);

  useEffect(() => {
    fetchProfile();
    checkFollowStatus();
    fetchUserPosts();
  }, [fetchProfile, checkFollowStatus, fetchUserPosts]);

  const updateProfile = async (updates: Partial<SocialProfile>) => {
    if (!user?.id) return false;

    try {
      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id);

      if (error) throw error;
      setProfile(prev => prev ? { ...prev, ...updates } : null);
      return true;
    } catch (error) {
      console.error('Error updating profile:', error);
      return false;
    }
  };

  const followUser = async () => {
    if (!user?.id || !targetUserId) return false;

    try {
      const { error } = await supabase
        .from('user_follows')
        .insert({ follower_id: user.id, following_id: targetUserId });

      if (error) throw error;
      setIsFollowing(true);
      setProfile(prev => prev ? { ...prev, followers_count: prev.followers_count + 1 } : null);
      return true;
    } catch (error) {
      console.error('Error following user:', error);
      return false;
    }
  };

  const unfollowUser = async () => {
    if (!user?.id || !targetUserId) return false;

    try {
      const { error } = await supabase
        .from('user_follows')
        .delete()
        .eq('follower_id', user.id)
        .eq('following_id', targetUserId);

      if (error) throw error;
      setIsFollowing(false);
      setProfile(prev => prev ? { ...prev, followers_count: Math.max(0, prev.followers_count - 1) } : null);
      return true;
    } catch (error) {
      console.error('Error unfollowing user:', error);
      return false;
    }
  };

  const uploadAvatar = async (file: File) => {
    if (!user?.id) return null;

    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      await updateProfile({ avatar_url: publicUrl });
      return publicUrl;
    } catch (error) {
      console.error('Error uploading avatar:', error);
      return null;
    }
  };

  return {
    profile,
    isLoading,
    isFollowing,
    posts,
    updateProfile,
    followUser,
    unfollowUser,
    uploadAvatar,
    refetch: fetchProfile,
  };
}
