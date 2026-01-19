import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useSocialProfile } from '@/hooks/useSocialProfile';
import { useFeed, FeedPost } from '@/hooks/useFeed';
import SocialProfileHeader from '@/components/social/SocialProfileHeader';
import PostCard from '@/components/social/PostCard';
import CreatePostModal from '@/components/social/CreatePostModal';
import { Button } from '@/components/ui/button';
import { Plus, Loader2 } from 'lucide-react';

const Profile: React.FC = () => {
  const navigate = useNavigate();
  const { user, profile: authProfile } = useAuth();
  const { settings } = useSettings();
  const { posts, isLoading } = useSocialProfile();
  const { createPost, likePost, unlikePost, deletePost } = useFeed();
  const [showCreatePost, setShowCreatePost] = React.useState(false);

  const handleSettingsClick = () => {
    navigate('/settings');
  };

  const handleCreatePost = async (content: string, track?: {
    id: string;
    title: string;
    artist: string;
    album?: string;
    coverUrl?: string;
    duration?: number;
  }) => {
    await createPost(content, track);
    // Refresh the page to show new post
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

  return (
    <div className="p-4 md:p-6 pb-32 max-w-xl md:max-w-3xl lg:max-w-4xl mx-auto animate-fade-in">
      {/* Profile Header with Settings button */}
      <SocialProfileHeader onSettingsClick={handleSettingsClick} />

      {/* Create Post Button */}
      <div className="mt-6 mb-4">
        <Button 
          onClick={() => setShowCreatePost(true)}
          className="w-full gap-2"
        >
          <Plus className="w-4 h-4" />
          {settings.language === 'it' ? 'Crea un post' : 'Create a post'}
        </Button>
      </div>

      {/* Posts Section */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">
          {settings.language === 'it' ? 'I tuoi post' : 'Your posts'}
        </h2>
        
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : postsWithProfile.length === 0 ? (
          <div className="text-center py-12 rounded-xl bg-card">
            <p className="text-muted-foreground text-sm">
              {settings.language === 'it' ? 'Non hai ancora pubblicato nulla' : "You haven't posted anything yet"}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {postsWithProfile.map((post) => (
              <PostCard 
                key={post.id} 
                post={post}
                onLike={() => likePost(post.id)}
                onUnlike={() => unlikePost(post.id)}
                onDelete={() => deletePost(post.id)}
              />
            ))}
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
