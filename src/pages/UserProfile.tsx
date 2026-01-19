import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import SocialProfileHeader from '@/components/social/SocialProfileHeader';
import PostCard from '@/components/social/PostCard';
import PlaylistCard from '@/components/PlaylistCard';
import { useSocialProfile, UserPost } from '@/hooks/useSocialProfile';
import { useFeed } from '@/hooks/useFeed';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';
import BackButton from '@/components/BackButton';

interface ProfilePageProps {
  onSettingsClick?: () => void;
}

const UserProfile: React.FC<ProfilePageProps> = ({ onSettingsClick }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { settings } = useSettings();
  const { likePost, unlikePost, deletePost } = useFeed();
  const { profile, posts, isLoading } = useSocialProfile(id);
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(false);

  const isOwnProfile = !id || id === user?.id;

  // Fetch public playlists
  React.useEffect(() => {
    const fetchPlaylists = async () => {
      const targetId = id || user?.id;
      if (!targetId) return;

      setIsLoadingPlaylists(true);
      try {
        let query = supabase
          .from('playlists')
          .select('*')
          .eq('user_id', targetId)
          .order('created_at', { ascending: false });

        // Only show public playlists for other users
        if (!isOwnProfile) {
          query = query.eq('is_public', true);
        }

        const { data } = await query;
        setPlaylists(data || []);
      } catch (error) {
        console.error('Error fetching playlists:', error);
      } finally {
        setIsLoadingPlaylists(false);
      }
    };

    fetchPlaylists();
  }, [id, user?.id, isOwnProfile]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 pb-32 animate-fade-in">
      <div className="max-w-xl mx-auto">
        {/* Back button for other profiles */}
        {id && id !== user?.id && (
          <div className="mb-4">
            <BackButton />
          </div>
        )}

        {/* Profile header */}
        <SocialProfileHeader 
          userId={id} 
          onSettingsClick={onSettingsClick}
        />

        {/* Tabs */}
        <Tabs defaultValue="posts" className="mt-6">
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="posts">
              {settings.language === 'it' ? 'Post' : 'Posts'}
            </TabsTrigger>
            <TabsTrigger value="playlists">
              Playlist
            </TabsTrigger>
          </TabsList>

          <TabsContent value="posts" className="mt-4 space-y-4">
            {posts.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">
                {settings.language === 'it' ? 'Nessun post ancora' : 'No posts yet'}
              </p>
            ) : (
              posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={{
                    ...post,
                    profile: profile!,
                    is_liked: false,
                  }}
                  onLike={() => likePost(post.id)}
                  onUnlike={() => unlikePost(post.id)}
                  onDelete={isOwnProfile ? () => deletePost(post.id) : undefined}
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="playlists" className="mt-4">
            {isLoadingPlaylists ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : playlists.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">
                {settings.language === 'it' 
                  ? (isOwnProfile ? 'Nessuna playlist' : 'Nessuna playlist pubblica')
                  : (isOwnProfile ? 'No playlists' : 'No public playlists')}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {playlists.map((playlist) => (
                  <PlaylistCard
                    key={playlist.id}
                    playlist={playlist}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default UserProfile;
