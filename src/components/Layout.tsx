// Layout component - Main app layout with sidebar, player and navigation
import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Player from './Player';
import MobileNav from './MobileNav';
import TVBanner from './TVBanner';
import { usePlayer } from '@/contexts/PlayerContext';

const Layout: React.FC = () => {
  const { currentTrack } = usePlayer();

  return (
    <div className="flex h-screen bg-background overflow-hidden pt-[env(safe-area-inset-top)]">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TVBanner />
        <main className={`flex-1 overflow-y-auto ${currentTrack ? 'pb-28 md:pb-24' : 'pb-14 md:pb-0'}`}>
          <Outlet />
        </main>
      </div>
      <Player />
      <MobileNav />
    </div>
  );
};

export default Layout;
