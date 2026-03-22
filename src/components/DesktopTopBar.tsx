import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { Search, Settings, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import NotificationsDropdown from './NotificationsDropdown';
import { useSettings } from '@/contexts/SettingsContext';
import { useAuth } from '@/contexts/AuthContext';
import appLogo from '@/assets/logo.png';
import { cn } from '@/lib/utils';

const DesktopTopBar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { t } = useSettings();
  const { profile } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');

  // Sync search input with URL query param when on search page
  useEffect(() => {
    if (location.pathname === '/app/search') {
      const q = searchParams.get('q') || '';
      setSearchQuery(q);
    }
  }, [location.pathname, searchParams]);

  const navItems = [
    { label: t('home'), path: '/app' },
    { label: 'Feed', path: '/app/feed' },
    { label: t('library'), path: '/app/library' },
  ];

  const handleSearchFocus = () => {
    if (location.pathname !== '/app/search') {
      navigate('/app/search');
    }
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    navigate(`/app/search${value ? `?q=${encodeURIComponent(value)}` : ''}`, { replace: true });
  };

  return (
    <header className="hidden md:flex h-14 items-center px-4 gap-4 border-b border-border bg-card/80 backdrop-blur-md z-40 shrink-0">
      {/* Logo + Nav */}
      <div className="flex items-center gap-1 mr-2">
        <img src={appLogo} alt="SoundFlow" className="w-8 h-8 rounded-lg" />
      </div>

      <nav className="flex items-center gap-1">
        {navItems.map((item) => {
          const isActive = item.path === '/app'
            ? location.pathname === '/app'
            : location.pathname.startsWith(item.path);
          return (
            <NavLink key={item.path} to={item.path}>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'text-sm font-medium px-4 rounded-full transition-all',
                  isActive
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {item.label}
              </Button>
            </NavLink>
          );
        })}
      </nav>

      {/* Center - Search */}
      <div className="flex-1 max-w-md mx-auto">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            onFocus={handleSearchFocus}
            placeholder={t('search') + '...'}
            className="h-9 pl-9 rounded-full bg-secondary/60 border-transparent focus-visible:border-primary text-sm"
          />
        </div>
      </div>

      {/* Right - Actions */}
      <div className="flex items-center gap-1">
        <NotificationsDropdown />
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground h-9 w-9"
          onClick={() => navigate('/app/settings')}
        >
          <Settings className="w-4.5 h-4.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 p-0"
          onClick={() => navigate('/app/profile')}
        >
          <Avatar className="h-7 w-7">
            {profile?.avatar_url ? (
              <AvatarImage src={profile.avatar_url} />
            ) : null}
            <AvatarFallback className="text-xs bg-secondary">
              <User className="w-3.5 h-3.5" />
            </AvatarFallback>
          </Avatar>
        </Button>
      </div>
    </header>
  );
};

export default DesktopTopBar;
