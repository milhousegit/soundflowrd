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
      {/* Left Menu - Icons only, no labels */}
      <div className="w-20 min-w-[80px] bg-card border-r border-border flex flex-col justify-center gap-4 py-4 shrink-0 pl-[env(safe-area-inset-left)]">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center justify-center aspect-square mx-3 rounded-2xl transition-all",
              activeTab === tab.id 
                ? "bg-primary text-primary-foreground" 
                : "text-muted-foreground hover:bg-secondary"
            )}
          >
            <tab.icon className="w-8 h-8" />
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
