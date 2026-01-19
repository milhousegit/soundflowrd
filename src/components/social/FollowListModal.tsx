import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSettings } from '@/contexts/SettingsContext';
import UserCard from './UserCard';
import { SocialProfile } from '@/hooks/useSocialProfile';

interface FollowListModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  type: 'followers' | 'following';
}

const FollowListModal: React.FC<FollowListModalProps> = ({ open, onOpenChange, userId, type }) => {
  const { settings } = useSettings();
  const [users, setUsers] = useState<SocialProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!open || !userId) return;

    const fetchUsers = async () => {
      setIsLoading(true);
      try {
        if (type === 'followers') {
          // Get users who follow this profile
          const { data: follows } = await supabase
            .from('user_follows')
            .select('follower_id')
            .eq('following_id', userId);

          if (follows && follows.length > 0) {
            const followerIds = follows.map(f => f.follower_id);
            
            // Fetch profiles
            const { data: profiles } = await supabase
              .from('profiles')
              .select('*')
              .in('id', followerIds);

            // Check admin status for each user
            const { data: roles } = await supabase
              .from('user_roles')
              .select('user_id, role')
              .in('user_id', followerIds)
              .eq('role', 'admin');

            const adminIds = new Set(roles?.map(r => r.user_id) || []);

            setUsers((profiles || []).map(p => ({
              ...p,
              is_admin: adminIds.has(p.id),
            })) as SocialProfile[]);
          } else {
            setUsers([]);
          }
        } else {
          // Get users this profile follows
          const { data: follows } = await supabase
            .from('user_follows')
            .select('following_id')
            .eq('follower_id', userId);

          if (follows && follows.length > 0) {
            const followingIds = follows.map(f => f.following_id);
            
            // Fetch profiles
            const { data: profiles } = await supabase
              .from('profiles')
              .select('*')
              .in('id', followingIds);

            // Check admin status for each user
            const { data: roles } = await supabase
              .from('user_roles')
              .select('user_id, role')
              .in('user_id', followingIds)
              .eq('role', 'admin');

            const adminIds = new Set(roles?.map(r => r.user_id) || []);

            setUsers((profiles || []).map(p => ({
              ...p,
              is_admin: adminIds.has(p.id),
            })) as SocialProfile[]);
          } else {
            setUsers([]);
          }
        }
      } catch (error) {
        console.error('Failed to fetch follow list:', error);
        setUsers([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUsers();
  }, [open, userId, type]);

  const title = type === 'followers'
    ? (settings.language === 'it' ? 'Follower' : 'Followers')
    : (settings.language === 'it' ? 'Seguiti' : 'Following');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[70vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto space-y-2 -mx-6 px-6">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : users.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">
              {type === 'followers'
                ? (settings.language === 'it' ? 'Nessun follower' : 'No followers')
                : (settings.language === 'it' ? 'Non segue nessuno' : 'Not following anyone')}
            </p>
          ) : (
            users.map(user => (
              <UserCard 
                key={user.id} 
                user={user} 
              />
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default FollowListModal;
