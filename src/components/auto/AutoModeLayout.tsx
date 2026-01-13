import React, { useState } from 'react';
import { Play, Search, Library } from 'lucide-react';
import { cn } from '@/lib/utils';
import AutoPlaybackView from './AutoPlaybackView';
import AutoSearchView from './AutoSearchView';
import AutoLibraryView from './AutoLibraryView';

type AutoTab = 'playback' | 'search' | 'library';

const AutoModeLayout: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AutoTab>('playback');

  const tabs = [
    { id: 'playback' as AutoTab, label: 'Riproduzione', icon: Play },
    { id: 'search' as AutoTab, label: 'Cerca', icon: Search },
    { id: 'library' as AutoTab, label: 'Libreria', icon: Library },
  ];

  return (
    <div className="fixed inset-0 z-[150] bg-background flex flex-row h-screen w-screen overflow-hidden">
      {/* Left Menu - Horizontal in landscape */}
      <div className="w-24 min-w-[96px] bg-card border-r border-border flex flex-col justify-center py-1 shrink-0 pl-[env(safe-area-inset-left)]">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex flex-col items-center justify-center py-6 gap-2 transition-all mx-2 my-1 rounded-xl",
              activeTab === tab.id 
                ? "bg-primary text-primary-foreground" 
                : "text-muted-foreground hover:bg-secondary"
            )}
          >
            <tab.icon className="w-8 h-8" />
            <span className="text-xs font-medium leading-tight">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Main Content - Takes remaining space */}
      <div className="flex-1 overflow-hidden h-full">
        {activeTab === 'playback' && <AutoPlaybackView />}
        {activeTab === 'search' && <AutoSearchView />}
        {activeTab === 'library' && <AutoLibraryView />}
      </div>
    </div>
  );
};

export default AutoModeLayout;
