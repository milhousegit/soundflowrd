import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useSocialProfile } from '@/hooks/useSocialProfile';
import { useFeed, FeedPost, FeedPlaylist } from '@/hooks/useFeed';
import { usePlaylists, Playlist } from '@/hooks/usePlaylists';
import { useFavorites } from '@/hooks/useFavorites';
import SocialProfileHeader from '@/components/social/SocialProfileHeader';
import PostCard from '@/components/social/PostCard';
import PlaylistCard from '@/components/PlaylistCard';
import CreatePostModal from '@/components/social/CreatePostModal';
import { Loader2, Grid3X3, ListMusic, Share2, User, Crown, Bookmark, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const Profile: React.FC = () => {
  const navigate = useNavigate();
  const { user, profile: authProfile, isAdmin } = useAuth();
  const { settings } = useSettings();
  const { posts, isLoading } = useSocialProfile();
  const { playlists, isLoading: playlistsLoading } = usePlaylists();
  const { createPost, likePost, unlikePost, deletePost } = useFeed();
  const { isFavorite, toggleFavorite } = useFavorites();
  const [showCreatePost, setShowCreatePost] = React.useState(false);
  const [activeTab, setActiveTab] = useState<'feed' | 'playlists'>('feed');
  const [publicPlaylists, setPublicPlaylists] = useState<Playlist[]>([]);
  const [playlistSavesCounts, setPlaylistSavesCounts] = useState<Record<string, number>>({});

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
          
          // Fetch saves counts for each playlist
          const counts: Record<string, number> = {};
          await Promise.all(data.map(async (pl) => {
            const { count } = await supabase
              .from('favorites')
              .select('*', { count: 'exact', head: true })
              .eq('item_id', pl.id)
              .eq('item_type', 'playlist');
            counts[pl.id] = count || 0;
          }));
          setPlaylistSavesCounts(counts);
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
                  const playlist = item.data;
                  return (
                    <div 
                      key={`playlist-${playlist.id}`}
                      className="bg-card rounded-xl border border-border p-4 space-y-3"
                    >
                      {/* Header - same style as FeedCard */}
                      <div className="flex items-center gap-3">
                        <Avatar className="w-10 h-10">
                          <AvatarImage src={authProfile?.avatar_url || undefined} className="object-cover" />
                          <AvatarFallback><User className="w-5 h-5" /></AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="font-medium text-sm text-foreground">
                              {authProfile?.display_name || 'Utente'}
                            </p>
                            {isAdmin && <Crown className="w-3.5 h-3.5 text-amber-500" />}
                            {!isAdmin && authProfile?.is_premium && <Crown className="w-3.5 h-3.5 text-[#8B5CF6]" />}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {settings.language === 'it' ? 'Ha pubblicato una playlist' : 'Published a playlist'}
                          </p>
                        </div>
                      </div>

                      {/* Playlist card - large image on mobile */}
                      <button
                        onClick={() => navigate(`/playlist/${playlist.id}`)}
                        className="w-full text-left"
                      >
                        {/* Large cover on mobile */}
                        <div className="relative w-full aspect-square rounded-lg bg-muted overflow-hidden mb-3 md:hidden">
                          {playlist.cover_url ? (
                            <img src={playlist.cover_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/40">
                              <ListMusic className="w-16 h-16 text-primary" />
                            </div>
                          )}
                        </div>

                        {/* Compact row on desktop */}
                        <div className="hidden md:flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                          <div className="relative w-16 h-16 rounded-lg bg-muted overflow-hidden shrink-0">
                            {playlist.cover_url ? (
                              <img src={playlist.cover_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/40">
                                <ListMusic className="w-6 h-6 text-primary" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground truncate">{playlist.name}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {playlist.track_count || 0} {settings.language === 'it' ? 'brani' : 'tracks'}
                            </p>
                          </div>
                        </div>

                        {/* Title on mobile (below image) */}
                        <div className="md:hidden">
                          <p className="text-sm font-medium text-foreground truncate">{playlist.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {playlist.track_count || 0} {settings.language === 'it' ? 'brani' : 'tracks'}
                          </p>
                        </div>
                      </button>

                      {/* Actions - same as FeedCard: Save, Comment, Share */}
                      <div className="flex items-center gap-4 pt-1">
                        {/* Save button - disabled for owner */}
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled
                          className="gap-1.5 text-primary"
                        >
                          <Bookmark className="w-4 h-4 fill-current" />
                          <span className="text-xs">{playlistSavesCounts[playlist.id] || 0}</span>
                        </Button>

                        {/* Comment - navigates to playlist */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/playlist/${playlist.id}`)}
                          className="gap-1.5 text-muted-foreground"
                        >
                          <MessageCircle className="w-4 h-4" />
                        </Button>

                        {/* Share */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const url = `${window.location.origin}/playlist/${playlist.id}`;
                            if (navigator.share) {
                              navigator.share({ title: playlist.name, url }).catch(() => {});
                            } else {
                              navigator.clipboard.writeText(url);
                              toast.success(settings.language === 'it' ? 'Link copiato!' : 'Link copied!');
                            }
                          }}
                          className="gap-1.5 text-muted-foreground"
                        >
                          <Share2 className="w-4 h-4" />
                        </Button>
                      </div>
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
