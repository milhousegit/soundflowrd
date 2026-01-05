import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Player from './Player';
import { usePlayer } from '@/contexts/PlayerContext';

const Layout: React.FC = () => {
  const { currentTrack } = usePlayer();

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar />
      <main className={`flex-1 overflow-y-auto ${currentTrack ? 'pb-24' : ''}`}>
        <Outlet />
      </main>
      <Player />
    </div>
  );
};

export default Layout;
