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
    <nav className="fixed bottom-0 left-0 right-0 z-40 glass border-t border-border md:hidden">
      <div className="flex items-center justify-around py-2 px-4 pb-safe">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={cn(
                "flex flex-col items-center gap-1 py-2 px-4 rounded-lg transition-colors",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              <item.icon className={cn("w-5 h-5", isActive && "text-primary")} />
              <span className="text-xs font-medium">{item.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};

export default MobileNav;
