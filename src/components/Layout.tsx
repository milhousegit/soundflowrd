// Layout component - Main app layout with top bar, player sidebar and navigation
import React from 'react';
import { Outlet } from 'react-router-dom';
import DesktopTopBar from './DesktopTopBar';
import DesktopPlayerSidebar from './DesktopPlayerSidebar';
import Player from './Player';
import MobileNav from './MobileNav';
import TVBanner from './TVBanner';
import ServiceBanner from './ServiceBanner';
import { usePlayer } from '@/contexts/PlayerContext';

const Layout: React.FC = () => {
  const { currentTrack } = usePlayer();

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden pt-[env(safe-area-inset-top)]">
      <DesktopTopBar />
      <div className="flex flex-1 overflow-hidden">
        <DesktopPlayerSidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <ServiceBanner />
          <TVBanner />
          <main className={`flex-1 overflow-y-auto ${currentTrack ? 'pb-28 md:pb-0' : 'pb-14 md:pb-0'}`}>
            <Outlet />
          </main>
        </div>
      </div>
      <Player />
      <MobileNav />
    </div>
  );
};

export default Layout;
