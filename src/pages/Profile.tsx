import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useSocialProfile } from '@/hooks/useSocialProfile';
import { useFeed, FeedPost, FeedPlaylist } from '@/hooks/useFeed';
import { usePlaylists, Playlist } from '@/hooks/usePlaylists';
import SocialProfileHeader from '@/components/social/SocialProfileHeader';
import PostCard from '@/components/social/PostCard';
import PlaylistCard from '@/components/PlaylistCard';
import CreatePostModal from '@/components/social/CreatePostModal';
import { Loader2, Grid3X3, ListMusic, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const Profile: React.FC = () => {
  const navigate = useNavigate();
  const { user, profile: authProfile } = useAuth();
  const { settings } = useSettings();
  const { posts, isLoading } = useSocialProfile();
  const { playlists, isLoading: playlistsLoading } = usePlaylists();
  const { createPost, likePost, unlikePost, deletePost } = useFeed();
  const [showCreatePost, setShowCreatePost] = React.useState(false);
  const [activeTab, setActiveTab] = useState<'feed' | 'playlists'>('feed');
  const [publicPlaylists, setPublicPlaylists] = useState<Playlist[]>([]);

  // Fetch public playlists for unified feed
  useEffect(() => {
    if (user) {
      const fetchPublicPlaylists = async () => {
        const { data } = await supabase
          .from('playlists')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_public', true)
          .order('created_at', { ascending: false });
        
        if (data) {
          setPublicPlaylists(data as Playlist[]);
        }
      };
      fetchPublicPlaylists();
    }
  }, [user]);

  const handleSettingsClick = () => {
    navigate('/settings');
  };

  const handleCreatePost = async (content: string, track?: {
    id: string;
    title: string;
    artist: string;
    album?: string;
    albumId?: string;
    coverUrl?: string;
    duration?: number;
  }) => {
    await createPost(content, track);
    window.location.reload();
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Transform posts to include profile for PostCard compatibility
  const postsWithProfile: FeedPost[] = posts.map(post => ({
    ...post,
    profile: {
      id: user.id,
      email: authProfile?.email || null,
      display_name: authProfile?.display_name || null,
      avatar_url: authProfile?.avatar_url || null,
      bio: authProfile?.bio || null,
      bio_track_id: authProfile?.bio_track_id || null,
      bio_track_title: authProfile?.bio_track_title || null,
      bio_track_artist: authProfile?.bio_track_artist || null,
      bio_track_cover_url: authProfile?.bio_track_cover_url || null,
      is_private: authProfile?.is_private || false,
      followers_count: authProfile?.followers_count || 0,
      following_count: authProfile?.following_count || 0,
      is_premium: authProfile?.is_premium || null,
    },
    is_liked: post.is_liked || false,
  }));

  // Create unified feed items (posts + public playlists) sorted by date
  type FeedItem = 
    | { type: 'post'; data: FeedPost; date: Date }
    | { type: 'playlist'; data: Playlist; date: Date };

  const unifiedFeed: FeedItem[] = [
    ...postsWithProfile.map(post => ({
      type: 'post' as const,
      data: post,
      date: new Date(post.created_at)
    })),
    ...publicPlaylists.map(playlist => ({
      type: 'playlist' as const,
      data: playlist,
      date: new Date(playlist.created_at)
    }))
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  return (
    <div className="pb-32 animate-fade-in">
      {/* Profile Header */}
      <SocialProfileHeader onSettingsClick={handleSettingsClick} />

      {/* Tab Bar - Instagram/TikTok style */}
      <div className="border-t border-border mt-4">
        <div className="flex">
          <button
            onClick={() => setActiveTab('feed')}
            className={`flex-1 py-3 flex items-center justify-center transition-colors relative ${
              activeTab === 'feed' 
                ? 'text-foreground' 
                : 'text-muted-foreground'
            }`}
          >
            <Grid3X3 className="w-6 h-6" />
            {activeTab === 'feed' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('playlists')}
            className={`flex-1 py-3 flex items-center justify-center transition-colors relative ${
              activeTab === 'playlists' 
                ? 'text-foreground' 
                : 'text-muted-foreground'
            }`}
          >
            <ListMusic className="w-6 h-6" />
            {activeTab === 'playlists' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" />
            )}
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="p-4 md:p-6 max-w-xl md:max-w-3xl lg:max-w-4xl mx-auto">
        {activeTab === 'feed' ? (
          /* Unified Feed: Posts + Public Playlists */
          <div className="space-y-4">
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : unifiedFeed.length === 0 ? (
              <div className="text-center py-12 rounded-xl bg-card">
                <Grid3X3 className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
                <p className="text-muted-foreground text-sm">
                  {settings.language === 'it' 
                    ? 'Nessun contenuto ancora' 
                    : 'No content yet'}
                </p>
              </div>
            ) : (
              unifiedFeed.map((item) => {
                if (item.type === 'post') {
                  return (
                    <PostCard 
                      key={`post-${item.data.id}`} 
                      post={item.data}
                      onLike={() => likePost(item.data.id)}
                      onUnlike={() => unlikePost(item.data.id)}
                      onDelete={() => deletePost(item.data.id)}
                    />
                  );
                } else {
                  return (
                    <div 
                      key={`playlist-${item.data.id}`}
                      className="bg-card rounded-xl border border-border p-4"
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <ListMusic className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-muted-foreground">
                            {settings.language === 'it' 
                              ? 'Ha pubblicato una playlist' 
                              : 'Published a playlist'}
                          </p>
                        </div>
                      </div>
                      <PlaylistCard playlist={item.data} />
                    </div>
                  );
                }
              })
            )}
          </div>
        ) : (
          /* Playlists Tab */
          <div className="space-y-4">
            {playlistsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : playlists.length === 0 ? (
              <div className="text-center py-12 rounded-xl bg-card">
                <ListMusic className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
                <p className="text-muted-foreground text-sm">
                  {settings.language === 'it' 
                    ? 'Nessuna playlist creata' 
                    : 'No playlists created'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {playlists.map((playlist) => (
                  <PlaylistCard
                    key={playlist.id}
                    playlist={playlist}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Post Modal */}
      <CreatePostModal 
        isOpen={showCreatePost} 
        onClose={() => setShowCreatePost(false)}
        onSubmit={handleCreatePost}
      />
    </div>
  );
};

export default Profile;
