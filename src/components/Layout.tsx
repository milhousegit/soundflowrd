// Layout component - Main app layout with sidebar, player and navigation
import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Player from './Player';
import MobileNav from './MobileNav';
import IOSPreloadIndicator from './IOSPreloadIndicator';
import { usePlayer } from '@/contexts/PlayerContext';

const Layout: React.FC = () => {
  const { currentTrack } = usePlayer();

  return (
    <div className="flex h-screen bg-background overflow-hidden pt-[env(safe-area-inset-top)]">
      <IOSPreloadIndicator />
      <Sidebar />
      <main className={`flex-1 overflow-y-auto ${currentTrack ? 'pb-28 md:pb-24' : 'pb-14 md:pb-0'}`}>
        <Outlet />
      </main>
      <Player />
      <MobileNav />
    </div>
  );
};

export default Layout;
