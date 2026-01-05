import React, { useState } from 'react';
import { Plus, ListMusic, Disc, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSettings } from '@/contexts/SettingsContext';
import { mockPlaylists, mockAlbums, mockTracks } from '@/data/mockData';
import TrackCard from '@/components/TrackCard';
import AlbumCard from '@/components/AlbumCard';

type Tab = 'playlists' | 'albums' | 'liked';

const Library: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('playlists');
  const { t } = useSettings();

  const tabs = [
    { id: 'playlists' as Tab, label: t('yourPlaylists').split(' ').pop() || 'Playlist', icon: ListMusic },
    { id: 'albums' as Tab, label: t('albums'), icon: Disc },
    { id: 'liked' as Tab, label: t('likedSongs'), icon: Heart },
  ];

  return (
    <div className="p-4 md:p-8 pb-32 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 md:mb-8">
        <h1 className="text-2xl md:text-4xl font-bold text-foreground">{t('library')}</h1>
        <Button variant="outline" className="gap-2 w-full sm:w-auto">
          <Plus className="w-4 h-4" />
          {t('createPlaylist')}
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 md:mb-8 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0">
        {tabs.map((tab) => (
          <Button
            key={tab.id}
            variant={activeTab === tab.id ? 'default' : 'secondary'}
            onClick={() => setActiveTab(tab.id)}
            className="gap-2 flex-shrink-0"
            size="sm"
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </Button>
        ))}
      </div>

      {/* Content */}
      {activeTab === 'playlists' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-6">
          {/* Create Playlist Card */}
          <div className="group p-3 md:p-4 rounded-xl border-2 border-dashed border-border hover:border-primary/50 transition-colors cursor-pointer">
            <div className="aspect-square rounded-lg bg-secondary flex items-center justify-center mb-3 md:mb-4">
              <Plus className="w-8 md:w-12 h-8 md:h-12 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <h3 className="font-semibold text-sm md:text-base text-foreground">{t('createPlaylist')}</h3>
            <p className="text-xs md:text-sm text-muted-foreground">{t('addYourFavorites')}</p>
          </div>

          {/* Playlists */}
          {mockPlaylists.map((playlist) => (
            <div 
              key={playlist.id}
              className="group p-3 md:p-4 rounded-xl bg-card hover:bg-secondary/80 transition-all duration-300 cursor-pointer"
            >
              <div className="aspect-square rounded-lg overflow-hidden mb-3 md:mb-4 bg-muted">
                {playlist.coverUrl && (
                  <img 
                    src={playlist.coverUrl} 
                    alt={playlist.name} 
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                )}
              </div>
              <h3 className="font-semibold text-sm md:text-base text-foreground truncate">{playlist.name}</h3>
              <p className="text-xs md:text-sm text-muted-foreground truncate">{playlist.tracks.length} {t('tracks').toLowerCase()}</p>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'albums' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 md:gap-6">
          {mockAlbums.map((album) => (
            <AlbumCard key={album.id} album={album} />
          ))}
        </div>
      )}

      {activeTab === 'liked' && (
        <div>
          {/* Liked Songs Header */}
          <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 mb-6 md:mb-8 p-4 md:p-6 rounded-xl bg-gradient-to-r from-purple-500/20 to-pink-500/20">
            <div className="w-24 h-24 md:w-32 md:h-32 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
              <Heart className="w-12 md:w-16 h-12 md:h-16 text-white fill-white" />
            </div>
            <div className="text-center sm:text-left">
              <p className="text-xs md:text-sm text-muted-foreground uppercase tracking-wider">{t('playlist')}</p>
              <h2 className="text-2xl md:text-4xl font-bold text-foreground mb-1 md:mb-2">{t('likedSongs')}</h2>
              <p className="text-sm md:text-base text-muted-foreground">{mockTracks.length} {t('tracks').toLowerCase()}</p>
            </div>
          </div>

          {/* Tracks */}
          <div className="space-y-1">
            {mockTracks.map((track, index) => (
              <TrackCard 
                key={track.id} 
                track={track} 
                queue={mockTracks}
                index={index}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Library;
