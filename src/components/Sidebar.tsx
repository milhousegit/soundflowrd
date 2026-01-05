import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, Search, Library, Settings, Headphones } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSettings } from '@/contexts/SettingsContext';
import { cn } from '@/lib/utils';

const Sidebar: React.FC = () => {
  const location = useLocation();
  const { t } = useSettings();

  const navItems = [
    { icon: Home, label: t('home'), path: '/' },
    { icon: Search, label: t('search'), path: '/search' },
    { icon: Library, label: t('library'), path: '/library' },
    { icon: Settings, label: t('settings'), path: '/settings' },
  ];

  return (
    <aside className="hidden md:flex w-64 h-full bg-sidebar flex-col border-r border-border">
      {/* Logo */}
      <div className="p-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
            <Headphones className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold text-foreground">SoundFlow</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 space-y-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <NavLink key={item.path} to={item.path}>
              <Button
                variant={isActive ? 'navActive' : 'nav'}
                size="nav"
                className={cn('w-full', isActive && 'shadow-glow')}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </Button>
            </NavLink>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-border">
        <p className="text-xs text-muted-foreground text-center">
          Powered by MusicBrainz & Real-Debrid
        </p>
      </div>
    </aside>
  );
};

export default Sidebar;
