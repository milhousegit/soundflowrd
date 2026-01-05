import React, { useState } from 'react';
import { Plus, ListMusic, Disc, Heart, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { mockPlaylists, mockAlbums, mockTracks } from '@/data/mockData';
import TrackCard from '@/components/TrackCard';
import AlbumCard from '@/components/AlbumCard';

type Tab = 'playlists' | 'albums' | 'liked';

const Library: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('playlists');

  const tabs = [
    { id: 'playlists' as Tab, label: 'Playlist', icon: ListMusic },
    { id: 'albums' as Tab, label: 'Album', icon: Disc },
    { id: 'liked' as Tab, label: 'Brani piaciuti', icon: Heart },
  ];

  return (
    <div className="p-8 pb-32 animate-fade-in">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-4xl font-bold text-foreground">La tua libreria</h1>
        <Button variant="outline" className="gap-2">
          <Plus className="w-4 h-4" />
          Nuova playlist
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-8">
        {tabs.map((tab) => (
          <Button
            key={tab.id}
            variant={activeTab === tab.id ? 'default' : 'secondary'}
            onClick={() => setActiveTab(tab.id)}
            className="gap-2"
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </Button>
        ))}
      </div>

      {/* Content */}
      {activeTab === 'playlists' && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {/* Create Playlist Card */}
          <div className="group p-4 rounded-xl border-2 border-dashed border-border hover:border-primary/50 transition-colors cursor-pointer">
            <div className="aspect-square rounded-lg bg-secondary flex items-center justify-center mb-4">
              <Plus className="w-12 h-12 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <h3 className="font-semibold text-foreground">Crea playlist</h3>
            <p className="text-sm text-muted-foreground">Aggiungi i tuoi brani preferiti</p>
          </div>

          {/* Playlists */}
          {mockPlaylists.map((playlist) => (
            <div 
              key={playlist.id}
              className="group p-4 rounded-xl bg-card hover:bg-secondary/80 transition-all duration-300 cursor-pointer"
            >
              <div className="aspect-square rounded-lg overflow-hidden mb-4 bg-muted">
                {playlist.coverUrl && (
                  <img 
                    src={playlist.coverUrl} 
                    alt={playlist.name} 
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                )}
              </div>
              <h3 className="font-semibold text-foreground truncate">{playlist.name}</h3>
              <p className="text-sm text-muted-foreground truncate">{playlist.tracks.length} brani</p>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'albums' && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-6">
          {mockAlbums.map((album) => (
            <AlbumCard key={album.id} album={album} />
          ))}
        </div>
      )}

      {activeTab === 'liked' && (
        <div>
          {/* Liked Songs Header */}
          <div className="flex items-center gap-6 mb-8 p-6 rounded-xl bg-gradient-to-r from-purple-500/20 to-pink-500/20">
            <div className="w-32 h-32 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <Heart className="w-16 h-16 text-white fill-white" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground uppercase tracking-wider">Playlist</p>
              <h2 className="text-4xl font-bold text-foreground mb-2">Brani piaciuti</h2>
              <p className="text-muted-foreground">{mockTracks.length} brani</p>
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
