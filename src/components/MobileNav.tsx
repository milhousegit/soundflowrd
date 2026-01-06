import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, Search, Library, Settings } from 'lucide-react';
import { useSettings } from '@/contexts/SettingsContext';
import { cn } from '@/lib/utils';

const MobileNav: React.FC = () => {
  const location = useLocation();
  const { t } = useSettings();

  const navItems = [
    { icon: Home, label: t('home'), path: '/' },
    { icon: Search, label: t('search'), path: '/search' },
    { icon: Library, label: t('library'), path: '/library' },
    { icon: Settings, label: t('settings'), path: '/settings' },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 glass border-t border-border md:hidden"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)' }}
    >
      <div className="h-16 flex items-center justify-around px-4 pt-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center justify-center w-14 h-14 rounded-xl transition-colors",
                isActive ? "text-primary bg-primary/10" : "text-muted-foreground active:bg-secondary"
              )}
            >
              <item.icon className={cn("w-6 h-6", isActive && "text-primary")} />
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};

export default MobileNav;
