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
      {/* Left Menu - Large touch targets, well spaced */}
      <div 
        className="w-[138px] min-w-[138px] bg-card border-r border-border flex flex-col items-center justify-center shrink-0"
        style={{ paddingLeft: 'env(safe-area-inset-left, 0px)' }}
      >
        <div className="flex flex-col items-center justify-center gap-6 w-full px-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "w-20 h-20 flex items-center justify-center rounded-2xl transition-all touch-manipulation",
                activeTab === tab.id 
                  ? "bg-primary text-primary-foreground" 
                  : "text-muted-foreground hover:bg-secondary active:bg-secondary"
              )}
            >
              <tab.icon className="w-10 h-10" />
            </button>
          ))}
        </div>
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
