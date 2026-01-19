import React, { useState } from 'react';
import { Plus, Loader2, RefreshCw, Disc, MessageCircle, Music } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import PostCard from '@/components/social/PostCard';
import CreatePostModal from '@/components/social/CreatePostModal';
import { useFeed, FeedPost, AlbumRelease, AlbumComment } from '@/hooks/useFeed';
import { useSettings } from '@/contexts/SettingsContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatDistanceToNow } from 'date-fns';
import { it, enUS } from 'date-fns/locale';

const Feed: React.FC = () => {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const { feedItems, isLoading, hasMore, loadMore, createPost, deletePost, likePost, unlikePost, refetch } = useFeed();
  const [showCreateModal, setShowCreateModal] = useState(false);

  const formatDate = (dateStr: string) => {
    return formatDistanceToNow(new Date(dateStr), {
      addSuffix: true,
      locale: settings.language === 'it' ? it : enUS
    });
  };

  const renderFeedItem = (item: { type: string; id: string; data: FeedPost | AlbumRelease | AlbumComment }) => {
    switch (item.type) {
      case 'post':
        const post = item.data as FeedPost;
        return (
          <PostCard
            key={item.id}
            post={post}
            onLike={() => likePost(post.id)}
            onUnlike={() => unlikePost(post.id)}
            onDelete={() => deletePost(post.id)}
          />
        );

      case 'release':
        const release = item.data as AlbumRelease;
        return (
          <div
            key={item.id}
            className="bg-card rounded-xl p-4 border border-border hover:border-primary/30 transition-colors cursor-pointer"
            onClick={() => navigate(`/album/${release.id}`)}
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
                <Disc className="w-3.5 h-3.5 text-primary" />
              </div>
              <span className="text-xs text-muted-foreground">
                {settings.language === 'it' ? 'Nuova uscita' : 'New release'}
              </span>
              <span className="text-xs text-muted-foreground">•</span>
              <span className="text-xs text-muted-foreground">{formatDate(release.release_date)}</span>
            </div>
            
            <div className="flex gap-3">
              <img
                src={release.cover_medium}
                alt={release.title}
                className="w-16 h-16 rounded-lg object-cover"
              />
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground truncate">{release.title}</h3>
                <p className="text-sm text-muted-foreground truncate">{release.artist?.name}</p>
                <span className="inline-block mt-1 px-2 py-0.5 text-xs rounded-full bg-primary/20 text-primary capitalize">
                  {release.record_type}
                </span>
              </div>
            </div>
          </div>
        );

      case 'comment':
        const comment = item.data as AlbumComment;
        return (
          <div
            key={item.id}
            className="bg-card rounded-xl p-4 border border-border hover:border-primary/30 transition-colors cursor-pointer"
            onClick={() => comment.album_id && navigate(`/album/${comment.album_id}`)}
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center">
                <MessageCircle className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
              <span className="text-xs text-muted-foreground">
                {settings.language === 'it' ? 'Commento su un album che ti piace' : 'Comment on an album you like'}
              </span>
            </div>

            <div className="flex items-start gap-3">
              <Avatar 
                className="w-8 h-8 cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/user/${comment.user_id}`);
                }}
              >
                <AvatarImage src={comment.profile?.avatar_url || undefined} />
                <AvatarFallback className="text-xs">
                  {comment.profile?.display_name?.[0] || '?'}
                </AvatarFallback>
              </Avatar>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span 
                    className="text-sm font-medium text-foreground hover:underline cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/user/${comment.user_id}`);
                    }}
                  >
                    {comment.profile?.display_name || 'User'}
                  </span>
                  <span className="text-xs text-muted-foreground">{formatDate(comment.created_at)}</span>
                </div>
                
                <p className="text-sm text-foreground mb-2">{comment.content}</p>
                
                {comment.album_title && (
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                    {comment.album_cover && (
                      <img src={comment.album_cover} alt="" className="w-8 h-8 rounded" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{comment.album_title}</p>
                      <p className="text-xs text-muted-foreground truncate">{comment.album_artist}</p>
                    </div>
                    <Music className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

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

        {/* Feed Items */}
        {isLoading && feedItems.length === 0 ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : feedItems.length === 0 ? (
          <div className="text-center py-12 space-y-4">
            <p className="text-muted-foreground">
              {settings.language === 'it' 
                ? 'Nessun contenuto nel tuo feed. Inizia a seguire artisti e utenti!' 
                : 'No content in your feed. Start following artists and users!'}
            </p>
            <Button onClick={() => setShowCreateModal(true)} variant="outline">
              {settings.language === 'it' ? 'Crea il tuo primo post' : 'Create your first post'}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {feedItems.map(renderFeedItem)}

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
