import React, { useState } from 'react';
import { Plus, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PostCard from '@/components/social/PostCard';
import CreatePostModal from '@/components/social/CreatePostModal';
import { useFeed } from '@/hooks/useFeed';
import { useSettings } from '@/contexts/SettingsContext';

const Feed: React.FC = () => {
  const { settings } = useSettings();
  const { posts, isLoading, hasMore, loadMore, createPost, deletePost, likePost, unlikePost, refetch } = useFeed();
  const [showCreateModal, setShowCreateModal] = useState(false);

  return (
    <div className="p-4 md:p-8 pb-32 animate-fade-in">
      <div className="max-w-xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-foreground">Feed</h1>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={refetch}>
              <RefreshCw className="w-5 h-5" />
            </Button>
            <Button onClick={() => setShowCreateModal(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              {settings.language === 'it' ? 'Nuovo post' : 'New post'}
            </Button>
          </div>
        </div>

        {/* Posts */}
        {isLoading && posts.length === 0 ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-12 space-y-4">
            <p className="text-muted-foreground">
              {settings.language === 'it' 
                ? 'Nessun post nel tuo feed. Inizia a seguire altri utenti!' 
                : 'No posts in your feed. Start following other users!'}
            </p>
            <Button onClick={() => setShowCreateModal(true)} variant="outline">
              {settings.language === 'it' ? 'Crea il tuo primo post' : 'Create your first post'}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                onLike={() => likePost(post.id)}
                onUnlike={() => unlikePost(post.id)}
                onDelete={() => deletePost(post.id)}
              />
            ))}

            {hasMore && (
              <div className="flex justify-center pt-4">
                <Button variant="outline" onClick={loadMore} disabled={isLoading}>
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    settings.language === 'it' ? 'Carica altri' : 'Load more'
                  )}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create post modal */}
      <CreatePostModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={createPost}
      />
    </div>
  );
};

export default Feed;
