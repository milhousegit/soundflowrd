import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import SocialProfileHeader from '@/components/social/SocialProfileHeader';
import PostCard from '@/components/social/PostCard';
import PlaylistCard from '@/components/PlaylistCard';
import { useSocialProfile } from '@/hooks/useSocialProfile';
import { useFeed } from '@/hooks/useFeed';
import { useFavorites } from '@/hooks/useFavorites';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Grid3X3, ListMusic, Share2, User, Crown, Bookmark, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import BackButton from '@/components/BackButton';
import { toast } from 'sonner';

interface ProfilePageProps {
  onSettingsClick?: () => void;
}

const UserProfile: React.FC<ProfilePageProps> = ({ onSettingsClick }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { settings } = useSettings();
  const { likePost, unlikePost, deletePost } = useFeed();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { profile, posts, isLoading } = useSocialProfile(id);
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [publicPlaylists, setPublicPlaylists] = useState<any[]>([]);
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(false);
  const [activeTab, setActiveTab] = useState<'feed' | 'playlists'>('feed');
  const [playlistSavesCounts, setPlaylistSavesCounts] = useState<Record<string, number>>({});
  const [isAdmin, setIsAdmin] = useState(false);

  const isOwnProfile = !id || id === user?.id;

  // Check if current user is admin
  useEffect(() => {
    const checkAdmin = async () => {
      if (!user?.id) return;
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle();
      setIsAdmin(!!data);
    };
    checkAdmin();
  }, [user?.id]);

  // Admins or profile owners can see all playlists
  const canSeeAllPlaylists = isOwnProfile || isAdmin;

  // Fetch playlists
  useEffect(() => {
    const fetchPlaylists = async () => {
      const targetId = id || user?.id;
      if (!targetId) return;

      setIsLoadingPlaylists(true);
      try {
        // Fetch all playlists for the tab (admins and owners see all, others see public only)
        let query = supabase
          .from('playlists')
          .select('*')
          .eq('user_id', targetId)
          .order('created_at', { ascending: false });

        if (!canSeeAllPlaylists) {
          query = query.eq('is_public', true);
        }

        const { data } = await query;
        setPlaylists(data || []);

        // Fetch public playlists for unified feed
        const { data: publicData } = await supabase
          .from('playlists')
          .select('*')
          .eq('user_id', targetId)
          .eq('is_public', true)
          .order('created_at', { ascending: false });

        setPublicPlaylists(publicData || []);

        // Fetch saves counts for each public playlist
        if (publicData && publicData.length > 0) {
          const counts: Record<string, number> = {};
          await Promise.all(publicData.map(async (pl) => {
            const { count } = await supabase
              .from('favorites')
              .select('*', { count: 'exact', head: true })
              .eq('item_id', pl.id)
              .eq('item_type', 'playlist');
            counts[pl.id] = count || 0;
          }));
          setPlaylistSavesCounts(counts);
        }
      } catch (error) {
        console.error('Error fetching playlists:', error);
      } finally {
        setIsLoadingPlaylists(false);
      }
    };

    fetchPlaylists();
  }, [id, user?.id, canSeeAllPlaylists]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Create unified feed items (posts + public playlists) sorted by date
  type FeedItem = 
    | { type: 'post'; data: any; date: Date }
    | { type: 'playlist'; data: any; date: Date };

  const unifiedFeed: FeedItem[] = [
    ...posts.map(post => ({
      type: 'post' as const,
      data: { ...post, profile: profile!, is_liked: false },
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
      {/* Back button for other profiles */}
      {id && id !== user?.id && (
        <div className="p-4 pb-0">
          <BackButton />
        </div>
      )}

      {/* Profile header */}
      <SocialProfileHeader 
        userId={id} 
        onSettingsClick={onSettingsClick}
      />

      {/* Tab Bar - Instagram/TikTok style */}
      <div className="border-t border-b border-border mt-4">
        <div className="flex max-w-xl mx-auto">
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
                      onDelete={isOwnProfile ? () => deletePost(item.data.id) : undefined}
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
                          <AvatarImage src={profile?.avatar_url || undefined} className="object-cover" />
                          <AvatarFallback><User className="w-5 h-5" /></AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="font-medium text-sm text-foreground">
                              {profile?.display_name || 'Utente'}
                            </p>
                            {profile?.is_admin && <Crown className="w-3.5 h-3.5 text-amber-500" />}
                            {!profile?.is_admin && profile?.is_premium && <Crown className="w-3.5 h-3.5 text-[#8B5CF6]" />}
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
                      {(() => {
                        const isPlaylistOwner = user?.id === playlist.user_id;
                        const isSaved = isPlaylistOwner || isFavorite('playlist', playlist.id);
                        
                        const handlePlaylistSaveToggle = async () => {
                          const playlistData = {
                            id: playlist.id,
                            title: playlist.name,
                            artist: profile?.display_name || '',
                            coverUrl: playlist.cover_url || '',
                          };
                          const wasSaved = isFavorite('playlist', playlist.id);
                          await toggleFavorite('playlist', playlistData as any);
                          setPlaylistSavesCounts(prev => ({
                            ...prev,
                            [playlist.id]: wasSaved ? Math.max(0, (prev[playlist.id] || 0) - 1) : (prev[playlist.id] || 0) + 1
                          }));
                          toast.success(wasSaved 
                            ? (settings.language === 'it' ? 'Rimosso dalla libreria' : 'Removed from library')
                            : (settings.language === 'it' ? 'Aggiunto alla libreria' : 'Added to library')
                          );
                        };

                        return (
                          <div className="flex items-center gap-4 pt-1">
                            {/* Save button */}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={isPlaylistOwner ? undefined : handlePlaylistSaveToggle}
                              disabled={isPlaylistOwner}
                              className={`gap-1.5 ${isSaved ? 'text-primary' : 'text-muted-foreground'}`}
                            >
                              <Bookmark className={`w-4 h-4 ${isSaved ? 'fill-current' : ''}`} />
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
                        );
                      })()}
                    </div>
                  );
                }
              })
            )}
          </div>
        ) : (
          /* Playlists Tab */
          <div className="space-y-4">
            {isLoadingPlaylists ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : playlists.length === 0 ? (
              <div className="text-center py-12 rounded-xl bg-card">
                <ListMusic className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
                <p className="text-muted-foreground text-sm">
                  {settings.language === 'it' 
                    ? (canSeeAllPlaylists ? 'Nessuna playlist' : 'Nessuna playlist pubblica')
                    : (canSeeAllPlaylists ? 'No playlists' : 'No public playlists')}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {playlists.map((playlist) => (
                  <PlaylistCard
                    key={playlist.id}
                    playlist={playlist}
                    showPrivateIndicator={canSeeAllPlaylists}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default UserProfile;
