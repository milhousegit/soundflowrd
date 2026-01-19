import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, Search, Newspaper, Library, User } from 'lucide-react';
import { useSettings } from '@/contexts/SettingsContext';
import { cn } from '@/lib/utils';

const MobileNav: React.FC = () => {
  const location = useLocation();
  const { t } = useSettings();

  const navItems = [
    { icon: Home, label: t('home'), path: '/' },
    { icon: Search, label: t('search'), path: '/search' },
    { icon: Newspaper, label: 'Feed', path: '/feed' },
    { icon: Library, label: t('library'), path: '/library' },
    { icon: User, label: t('profile'), path: '/profile' },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 glass border-t border-border md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {/* Icons aligned towards top with small padding */}
      <div className="h-14 flex items-center justify-around px-4">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className="flex items-center justify-center w-14 h-14 transition-colors"
            >
              <item.icon className={cn(
                "w-6 h-6 transition-colors",
                isActive ? "text-primary" : "text-muted-foreground"
              )} />
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};

export default MobileNav;
