import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SocialProfile } from './useSocialProfile';

export function useUserSearch() {
  const [users, setUsers] = useState<SocialProfile[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const searchUsers = useCallback(async (query: string) => {
    if (!query.trim()) {
      setUsers([]);
      return;
    }

    setIsSearching(true);

    try {
      // Search by display_name (username) - case insensitive, partial match
      const searchTerm = query.toLowerCase().trim();
      const { data, error } = await supabase
        .from('public_profiles')
        .select('id, display_name, avatar_url, bio, bio_track_id, bio_track_title, bio_track_artist, bio_track_cover_url, is_private, followers_count, following_count, currently_playing_track_id, currently_playing_at, last_seen_at, created_at')
        .or(`display_name.ilike.%${searchTerm}%`)
        .not('display_name', 'is', null)
        .limit(10);

      if (error) throw error;
      
      // Fetch admin roles for found users
      const userIds = (data || []).map(u => u.id);
      const { data: adminRoles } = await supabase
        .from('user_roles')
        .select('user_id')
        .in('user_id', userIds)
        .eq('role', 'admin');
      
      const adminUserIds = new Set(adminRoles?.map(r => r.user_id) || []);
      
      // Map users with is_admin flag
      const usersWithRoles = (data || []).map(user => ({
        ...user,
        is_admin: adminUserIds.has(user.id),
      })) as SocialProfile[];
      
      setUsers(usersWithRoles);
    } catch (error) {
      console.error('Error searching users:', error);
      setUsers([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const clearResults = useCallback(() => {
    setUsers([]);
  }, []);

  return {
    users,
    isSearching,
    searchUsers,
    clearResults,
  };
}
