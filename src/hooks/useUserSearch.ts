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
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .or(`display_name.ilike.%${query}%,email.ilike.%${query}%`)
        .limit(10);

      if (error) throw error;
      setUsers((data || []) as SocialProfile[]);
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
