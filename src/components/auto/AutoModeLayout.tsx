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
    <div className="fixed inset-0 z-[150] bg-background flex">
      {/* Left Menu */}
      <div className="w-24 md:w-32 bg-card border-r border-border flex flex-col py-4">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex flex-col items-center justify-center py-6 gap-2 transition-all",
              activeTab === tab.id 
                ? "bg-primary/20 text-primary border-r-2 border-primary" 
                : "text-muted-foreground hover:bg-secondary"
            )}
          >
            <tab.icon className="w-8 h-8" />
            <span className="text-xs font-medium">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'playback' && <AutoPlaybackView />}
        {activeTab === 'search' && <AutoSearchView />}
        {activeTab === 'library' && <AutoLibraryView />}
      </div>
    </div>
  );
};

export default AutoModeLayout;
