import React from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Crown } from 'lucide-react';
import { SocialProfile } from '@/hooks/useSocialProfile';

interface UserCardProps {
  user: SocialProfile;
}

const UserCard: React.FC<UserCardProps> = ({ user }) => {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate(`/profile/${user.id}`)}
      className="flex items-center gap-3 p-3 rounded-xl bg-card hover:bg-accent transition-colors w-full text-left"
    >
      <div className="w-12 h-12 rounded-full bg-muted overflow-hidden shrink-0">
        {user.avatar_url ? (
          <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <User className="w-6 h-6 text-muted-foreground" />
          </div>
        )}
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="font-medium text-sm text-foreground truncate">
            {user.display_name || user.email?.split('@')[0] || 'Utente'}
          </p>
          {user.is_admin && (
            <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          )}
          {!user.is_admin && user.is_premium && (
            <Crown className="w-3.5 h-3.5 text-[#8B5CF6] shrink-0" />
          )}
        </div>
        {user.bio && (
          <p className="text-xs text-muted-foreground truncate">{user.bio}</p>
        )}
        <p className="text-xs text-muted-foreground">
          {user.followers_count} followers
        </p>
      </div>
    </button>
  );
};

export default UserCard;
