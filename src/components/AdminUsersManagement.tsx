import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { 
  Crown, 
  Search, 
  Loader2, 
  User as UserIcon,
  Calendar,
  Clock,
  MoreVertical,
  Ban,
  Gift,
  MessageSquareOff,
  ShieldOff,
  Trash2,
  X,
  Music,
  Circle
} from 'lucide-react';
import { addYears, addMonths, addDays, format, isPast } from 'date-fns';
import { it, enUS } from 'date-fns/locale';

interface UserProfile {
  id: string;
  email: string | null;
  is_premium: boolean | null;
  premium_expires_at: string | null;
  created_at: string;
  payment_pending_since: string | null;
  posts_blocked_until: string | null;
  comments_blocked_until: string | null;
  last_seen_at: string | null;
  currently_playing_track_id: string | null;
  currently_playing_at: string | null;
}

interface AdminUsersManagementProps {
  language: 'en' | 'it';
}

const AdminUsersManagement: React.FC<AdminUsersManagementProps> = ({ language }) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [updatingUser, setUpdatingUser] = useState<string | null>(null);
  const [deleteDialogUser, setDeleteDialogUser] = useState<UserProfile | null>(null);

  const t = {
    title: language === 'it' ? 'Gestione Utenti' : 'User Management',
    search: language === 'it' ? 'Cerca per email...' : 'Search by email...',
    premium: 'Premium',
    free: language === 'it' ? 'Gratis' : 'Free',
    expired: language === 'it' ? 'Scaduto' : 'Expired',
    expiresAt: language === 'it' ? 'Scade il' : 'Expires',
    grantPremium: language === 'it' ? 'Attiva Premium' : 'Grant Premium',
    grantTrial: language === 'it' ? 'Prova 1 mese' : '1 Month Trial',
    revokePremium: language === 'it' ? 'Revoca Premium' : 'Revoke Premium',
    noUsers: language === 'it' ? 'Nessun utente trovato' : 'No users found',
    premiumGranted: language === 'it' ? 'Premium attivato!' : 'Premium granted!',
    trialGranted: language === 'it' ? 'Prova attivata!' : 'Trial granted!',
    premiumRevoked: language === 'it' ? 'Premium revocato' : 'Premium revoked',
    error: language === 'it' ? 'Errore' : 'Error',
    registeredAt: language === 'it' ? 'Registrato il' : 'Registered',
    banPosts: language === 'it' ? 'Blocca post (7gg)' : 'Ban posts (7d)',
    banComments: language === 'it' ? 'Blocca commenti (7gg)' : 'Ban comments (7d)',
    unbanPosts: language === 'it' ? 'Sblocca post' : 'Unban posts',
    unbanComments: language === 'it' ? 'Sblocca commenti' : 'Unban comments',
    banned: language === 'it' ? 'Bannato' : 'Banned',
    postsBanned: language === 'it' ? 'Post bloccati!' : 'Posts banned!',
    commentsBanned: language === 'it' ? 'Commenti bloccati!' : 'Comments banned!',
    postsUnbanned: language === 'it' ? 'Post sbloccati!' : 'Posts unbanned!',
    commentsUnbanned: language === 'it' ? 'Commenti sbloccati!' : 'Comments unbanned!',
    deleteAccount: language === 'it' ? 'Elimina account' : 'Delete account',
    deleteConfirmTitle: language === 'it' ? 'Eliminare questo account?' : 'Delete this account?',
    deleteConfirmDesc: language === 'it' ? 'Questa azione è irreversibile. Tutti i dati dell\'utente verranno eliminati permanentemente.' : 'This action cannot be undone. All user data will be permanently deleted.',
    cancel: language === 'it' ? 'Annulla' : 'Cancel',
    delete: language === 'it' ? 'Elimina' : 'Delete',
    accountDeleted: language === 'it' ? 'Account eliminato!' : 'Account deleted!',
    lastSeen: language === 'it' ? 'Ultimo accesso' : 'Last seen',
    online: language === 'it' ? 'Online' : 'Online',
    playing: language === 'it' ? 'In riproduzione' : 'Playing',
  };

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, is_premium, premium_expires_at, created_at, payment_pending_since, posts_blocked_until, comments_blocked_until, last_seen_at, currently_playing_track_id, currently_playing_at')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Failed to load users:', error);
      toast({
        title: t.error,
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const togglePremium = async (userId: string, currentlyPremium: boolean) => {
    setUpdatingUser(userId);
    try {
      const updateData = currentlyPremium 
        ? { is_premium: false, premium_expires_at: null }
        : { is_premium: true, premium_expires_at: addYears(new Date(), 1).toISOString(), payment_pending_since: null };

      const { error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', userId);

      if (error) throw error;

      // Update local state
      setUsers(prev => prev.map(u => 
        u.id === userId 
          ? { ...u, ...updateData }
          : u
      ));

      toast({
        title: currentlyPremium ? t.premiumRevoked : t.premiumGranted,
      });
    } catch (error) {
      console.error('Failed to update premium status:', error);
      toast({
        title: t.error,
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setUpdatingUser(null);
    }
  };

  const grantTrial = async (userId: string) => {
    setUpdatingUser(userId);
    try {
      const updateData = { is_premium: true, premium_expires_at: addMonths(new Date(), 1).toISOString(), payment_pending_since: null };

      const { error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', userId);

      if (error) throw error;

      // Update local state
      setUsers(prev => prev.map(u => 
        u.id === userId 
          ? { ...u, ...updateData }
          : u
      ));

      toast({
        title: t.trialGranted,
      });
    } catch (error) {
      console.error('Failed to grant trial:', error);
      toast({
        title: t.error,
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setUpdatingUser(null);
    }
  };

  const togglePostsBan = async (userId: string, isBanned: boolean) => {
    setUpdatingUser(userId);
    try {
      const updateData = isBanned 
        ? { posts_blocked_until: null }
        : { posts_blocked_until: addDays(new Date(), 7).toISOString() };

      const { error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', userId);

      if (error) throw error;

      setUsers(prev => prev.map(u => 
        u.id === userId ? { ...u, ...updateData } : u
      ));

      toast({ title: isBanned ? t.postsUnbanned : t.postsBanned });
    } catch (error) {
      console.error('Failed to toggle posts ban:', error);
      toast({ title: t.error, description: String(error), variant: 'destructive' });
    } finally {
      setUpdatingUser(null);
    }
  };

  const toggleCommentsBan = async (userId: string, isBanned: boolean) => {
    setUpdatingUser(userId);
    try {
      const updateData = isBanned 
        ? { comments_blocked_until: null }
        : { comments_blocked_until: addDays(new Date(), 7).toISOString() };

      const { error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', userId);

      if (error) throw error;

      setUsers(prev => prev.map(u => 
        u.id === userId ? { ...u, ...updateData } : u
      ));

      toast({ title: isBanned ? t.commentsUnbanned : t.commentsBanned });
    } catch (error) {
      console.error('Failed to toggle comments ban:', error);
      toast({ title: t.error, description: String(error), variant: 'destructive' });
    } finally {
      setUpdatingUser(null);
    }
  };

  const deleteUser = async (userId: string) => {
    setUpdatingUser(userId);
    setDeleteDialogUser(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-user`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ userId }),
        }
      );

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to delete user');
      }

      // Remove from local state
      setUsers(prev => prev.filter(u => u.id !== userId));
      toast({ title: t.accountDeleted });
    } catch (error) {
      console.error('Failed to delete user:', error);
      toast({ title: t.error, description: String(error), variant: 'destructive' });
    } finally {
      setUpdatingUser(null);
    }
  };

  const isPostsBanned = (user: UserProfile) => {
    return user.posts_blocked_until && !isPast(new Date(user.posts_blocked_until));
  };

  const isCommentsBanned = (user: UserProfile) => {
    return user.comments_blocked_until && !isPast(new Date(user.comments_blocked_until));
  };

  const isPremiumActive = (user: UserProfile) => {
    if (!user.is_premium) return false;
    if (!user.premium_expires_at) return user.is_premium;
    return !isPast(new Date(user.premium_expires_at));
  };

  // Check if user is online (last seen within 5 minutes)
  const isOnline = (user: UserProfile) => {
    if (!user.last_seen_at) return false;
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    return new Date(user.last_seen_at) > fiveMinutesAgo;
  };

  // Check if user is currently playing (played within last 30 seconds)
  const isPlaying = (user: UserProfile) => {
    if (!user.currently_playing_at || !user.currently_playing_track_id) return false;
    const thirtySecondsAgo = new Date(Date.now() - 30 * 1000);
    return new Date(user.currently_playing_at) > thirtySecondsAgo;
  };

  // Format relative time for last seen
  const formatLastSeen = (dateStr: string | null) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return language === 'it' ? 'Adesso' : 'Now';
    if (diffMins < 60) return `${diffMins} min`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return formatDate(dateStr);
  };

  const filteredUsers = users.filter(user => 
    !searchQuery || user.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr), 'dd MMM yyyy', { 
      locale: language === 'it' ? it : enUS 
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const totalUsers = users.length;
  const premiumUsers = users.filter(isPremiumActive).length;

  return (
    <div className="space-y-4">
      {/* User count stats */}
      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          <UserIcon className="w-4 h-4 text-muted-foreground" />
          <span className="text-muted-foreground">{language === 'it' ? 'Totale:' : 'Total:'}</span>
          <span className="font-semibold text-foreground">{totalUsers}</span>
        </div>
        <div className="flex items-center gap-2">
          <Crown className="w-4 h-4 text-[#8B5CF6]" />
          <span className="text-muted-foreground">Premium:</span>
          <span className="font-semibold text-[#8B5CF6]">{premiumUsers}</span>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t.search}
          className="pl-9 h-9 text-sm"
        />
      </div>

      {/* Users List */}
      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {filteredUsers.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">{t.noUsers}</p>
        ) : (
          filteredUsers.map((user) => {
            const isActive = isPremiumActive(user);
            const isExpired = user.is_premium && user.premium_expires_at && isPast(new Date(user.premium_expires_at));
            
            return (
              <div 
                key={user.id} 
                className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                <button 
                  onClick={() => navigate(`/profile/${user.id}`)}
                  className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0 hover:ring-2 hover:ring-primary/50 transition-all"
                >
                  <UserIcon className="w-4 h-4 text-muted-foreground" />
                </button>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {/* Playing music icon */}
                    {isPlaying(user) && (
                      <span title={t.playing}>
                        <Music className="w-4 h-4 text-primary shrink-0 animate-pulse" />
                      </span>
                    )}
                    {/* Payment pending icon */}
                    {user.payment_pending_since && !isPremiumActive(user) && (
                      <span title={`${language === 'it' ? 'Pagamento in attesa dal' : 'Payment pending since'} ${formatDate(user.payment_pending_since)}`}>
                        <Clock className="w-4 h-4 text-orange-500 shrink-0" />
                      </span>
                    )}
                    <button 
                      onClick={() => navigate(`/profile/${user.id}`)}
                      className="text-sm font-medium text-foreground truncate hover:text-primary transition-colors text-left"
                    >
                      {user.email || 'No email'}
                    </button>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                    <span>{t.registeredAt} {formatDate(user.created_at)}</span>
                    {/* Online status / Last seen */}
                    {isOnline(user) ? (
                      <>
                        <span>•</span>
                        <span className="flex items-center gap-1 text-green-500">
                          <Circle className="w-2 h-2 fill-green-500" />
                          {t.online}
                        </span>
                      </>
                    ) : user.last_seen_at && (
                      <>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          {t.lastSeen} {formatLastSeen(user.last_seen_at)}
                        </span>
                      </>
                    )}
                    {isActive && user.premium_expires_at && (
                      <>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {t.expiresAt} {formatDate(user.premium_expires_at)}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {/* Ban badges */}
                  {(isPostsBanned(user) || isCommentsBanned(user)) && (
                    <Badge variant="outline" className="text-red-500 border-red-500/50 text-xs">
                      <Ban className="w-3 h-3 mr-1" />
                      {t.banned}
                    </Badge>
                  )}
                  
                  {isActive ? (
                    <Badge className="bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] text-white border-0 text-xs">
                      <Crown className="w-3 h-3 mr-1" />
                      {t.premium}
                    </Badge>
                  ) : isExpired ? (
                    <Badge variant="outline" className="text-orange-500 border-orange-500/50 text-xs">
                      {t.expired}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs">
                      {t.free}
                    </Badge>
                  )}
                  
                  {/* 3-dot menu */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        disabled={updatingUser === user.id}
                      >
                        {updatingUser === user.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <MoreVertical className="w-4 h-4" />
                        )}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      {/* Premium actions */}
                      {!isActive && (
                        <DropdownMenuItem onClick={() => grantTrial(user.id)}>
                          <Gift className="w-4 h-4 mr-2 text-[#8B5CF6]" />
                          {t.grantTrial}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => togglePremium(user.id, isActive)}>
                        {isActive ? (
                          <>
                            <X className="w-4 h-4 mr-2 text-red-500" />
                            {t.revokePremium}
                          </>
                        ) : (
                          <>
                            <Crown className="w-4 h-4 mr-2 text-[#8B5CF6]" />
                            {t.grantPremium}
                          </>
                        )}
                      </DropdownMenuItem>
                      
                      <DropdownMenuSeparator />
                      
                      {/* Ban actions */}
                      <DropdownMenuItem onClick={() => togglePostsBan(user.id, !!isPostsBanned(user))}>
                        {isPostsBanned(user) ? (
                          <>
                            <ShieldOff className="w-4 h-4 mr-2 text-green-500" />
                            {t.unbanPosts}
                          </>
                        ) : (
                          <>
                            <MessageSquareOff className="w-4 h-4 mr-2 text-red-500" />
                            {t.banPosts}
                          </>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => toggleCommentsBan(user.id, !!isCommentsBanned(user))}>
                        {isCommentsBanned(user) ? (
                          <>
                            <ShieldOff className="w-4 h-4 mr-2 text-green-500" />
                            {t.unbanComments}
                          </>
                        ) : (
                          <>
                            <Ban className="w-4 h-4 mr-2 text-red-500" />
                            {t.banComments}
                          </>
                        )}
                      </DropdownMenuItem>
                      
                      <DropdownMenuSeparator />
                      
                      {/* Delete account */}
                      <DropdownMenuItem 
                        onClick={() => setDeleteDialogUser(user)}
                        className="text-red-500 focus:text-red-500"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        {t.deleteAccount}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteDialogUser} onOpenChange={(open) => !open && setDeleteDialogUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.deleteConfirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteDialogUser?.email && (
                <span className="font-medium text-foreground block mb-2">{deleteDialogUser.email}</span>
              )}
              {t.deleteConfirmDesc}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteDialogUser && deleteUser(deleteDialogUser.id)}
              className="bg-red-500 hover:bg-red-600"
            >
              {t.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminUsersManagement;
