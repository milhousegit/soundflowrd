// Layout component - Main app layout with sidebar, player and navigation
import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Player from './Player';
import MobileNav from './MobileNav';
import { QueuePrefetchIndicator } from './QueuePrefetchIndicator';
import { usePlayer } from '@/contexts/PlayerContext';

// Check if iOS PWA
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent);
const isPWA = () => window.matchMedia('(display-mode: standalone)').matches || 
                    (window.navigator as any).standalone === true;

const Layout: React.FC = () => {
  const { currentTrack, queuePrefetchState } = usePlayer();
  
  // Show prefetch indicator on iOS PWA when prefetching is active
  // Also show on iOS browsers when prefetching happens (for testing)
  const showPrefetchIndicator = isIOS() && currentTrack && queuePrefetchState.totalTracks > 0;

  return (
    <div className="flex h-screen bg-background overflow-hidden pt-[env(safe-area-inset-top)]">
      <Sidebar />
      <main className={`flex-1 overflow-y-auto ${currentTrack ? 'pb-28 md:pb-24' : 'pb-14 md:pb-0'}`}>
        <Outlet />
      </main>
      <Player />
      <MobileNav />
      <QueuePrefetchIndicator 
        state={queuePrefetchState} 
        isVisible={showPrefetchIndicator} 
      />
    </div>
  );
};

export default Layout;
