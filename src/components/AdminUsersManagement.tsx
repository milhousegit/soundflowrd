import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  Crown, 
  Search, 
  Loader2, 
  User as UserIcon,
  Calendar,
  Check,
  X
} from 'lucide-react';
import { addYears, format, isPast } from 'date-fns';
import { it, enUS } from 'date-fns/locale';

interface UserProfile {
  id: string;
  email: string | null;
  is_premium: boolean | null;
  premium_expires_at: string | null;
  created_at: string;
}

interface AdminUsersManagementProps {
  language: 'en' | 'it';
}

const AdminUsersManagement: React.FC<AdminUsersManagementProps> = ({ language }) => {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [updatingUser, setUpdatingUser] = useState<string | null>(null);

  const t = {
    title: language === 'it' ? 'Gestione Utenti' : 'User Management',
    search: language === 'it' ? 'Cerca per email...' : 'Search by email...',
    premium: 'Premium',
    free: language === 'it' ? 'Gratis' : 'Free',
    expired: language === 'it' ? 'Scaduto' : 'Expired',
    expiresAt: language === 'it' ? 'Scade il' : 'Expires',
    grantPremium: language === 'it' ? 'Attiva Premium' : 'Grant Premium',
    revokePremium: language === 'it' ? 'Revoca Premium' : 'Revoke Premium',
    noUsers: language === 'it' ? 'Nessun utente trovato' : 'No users found',
    premiumGranted: language === 'it' ? 'Premium attivato!' : 'Premium granted!',
    premiumRevoked: language === 'it' ? 'Premium revocato' : 'Premium revoked',
    error: language === 'it' ? 'Errore' : 'Error',
    registeredAt: language === 'it' ? 'Registrato il' : 'Registered',
  };

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, is_premium, premium_expires_at, created_at')
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
        : { is_premium: true, premium_expires_at: addYears(new Date(), 1).toISOString() };

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

  const isPremiumActive = (user: UserProfile) => {
    if (!user.is_premium) return false;
    if (!user.premium_expires_at) return user.is_premium;
    return !isPast(new Date(user.premium_expires_at));
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

  return (
    <div className="space-y-4">
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
                <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                  <UserIcon className="w-4 h-4 text-muted-foreground" />
                </div>
                
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {user.email || 'No email'}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{t.registeredAt} {formatDate(user.created_at)}</span>
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
                  
                  <Button
                    size="sm"
                    variant={isActive ? "outline" : "default"}
                    className={`h-7 text-xs ${!isActive ? 'bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] hover:opacity-90 border-0' : ''}`}
                    onClick={() => togglePremium(user.id, isActive)}
                    disabled={updatingUser === user.id}
                  >
                    {updatingUser === user.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : isActive ? (
                      <><X className="w-3 h-3 mr-1" /> {t.revokePremium}</>
                    ) : (
                      <><Check className="w-3 h-3 mr-1" /> {t.grantPremium}</>
                    )}
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default AdminUsersManagement;
