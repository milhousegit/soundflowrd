import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, MessageCircle, Share2, Play, MoreHorizontal, Trash2, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { FeedPost } from '@/hooks/useFeed';
import { useAuth } from '@/contexts/AuthContext';
import { usePlayer } from '@/contexts/PlayerContext';
import { useSettings } from '@/contexts/SettingsContext';
import { formatDistanceToNow } from 'date-fns';
import { it, enUS } from 'date-fns/locale';

interface PostCardProps {
  post: FeedPost;
  onLike: () => void;
  onUnlike: () => void;
  onDelete?: () => void;
  onComment?: () => void;
}

const PostCard: React.FC<PostCardProps> = ({ post, onLike, onUnlike, onDelete, onComment }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { playTrack } = usePlayer();
  const { settings } = useSettings();
  const [isLiking, setIsLiking] = useState(false);

  const isOwner = user?.id === post.user_id;
  const locale = settings.language === 'it' ? it : enUS;

  const handleLikeToggle = async () => {
    if (isLiking) return;
    setIsLiking(true);
    try {
      if (post.is_liked) {
        await onUnlike();
      } else {
        await onLike();
      }
    } finally {
      setIsLiking(false);
    }
  };

  const handlePlayTrack = () => {
    if (!post.track_id) return;
    
    const track = {
      id: post.track_id,
      title: post.track_title || '',
      artist: post.track_artist || '',
      album: post.track_album || '',
      coverUrl: post.track_cover_url || '',
      duration: post.track_duration || 0,
    };
    
    playTrack(track, [track]);
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/profile/${post.user_id}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Post', url });
      } catch {}
    } else {
      navigator.clipboard.writeText(url);
    }
  };

  return (
    <div className="bg-card rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button 
          onClick={() => navigate(`/profile/${post.user_id}`)}
          className="flex items-center gap-3 hover:opacity-80 transition-opacity"
        >
          <div className="w-10 h-10 rounded-full bg-muted overflow-hidden">
            {post.profile?.avatar_url ? (
              <img src={post.profile.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <User className="w-5 h-5 text-muted-foreground" />
              </div>
            )}
          </div>
          <div>
            <p className="font-medium text-sm text-foreground">
              {post.profile?.display_name || post.profile?.email?.split('@')[0] || 'Utente'}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(post.created_at), { addSuffix: true, locale })}
            </p>
          </div>
        </button>

        {isOwner && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="iconSm">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onDelete} className="text-destructive">
                <Trash2 className="w-4 h-4 mr-2" />
                {settings.language === 'it' ? 'Elimina' : 'Delete'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Content */}
      {post.content && (
        <p className="text-sm text-foreground whitespace-pre-wrap">{post.content}</p>
      )}

      {/* Track attachment */}
      {post.track_id && (
        <button
          onClick={handlePlayTrack}
          className="w-full flex items-center gap-3 p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors text-left"
        >
          <div className="relative w-12 h-12 rounded-lg bg-muted overflow-hidden shrink-0">
            {post.track_cover_url ? (
              <img src={post.track_cover_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Play className="w-5 h-5 text-muted-foreground" />
              </div>
            )}
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
              <Play className="w-5 h-5 text-white fill-white" />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground truncate">{post.track_title}</p>
            <p className="text-xs text-muted-foreground truncate">{post.track_artist}</p>
          </div>
        </button>
      )}

      {/* Actions */}
      <div className="flex items-center gap-4 pt-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLikeToggle}
          disabled={isLiking}
          className={`gap-1.5 ${post.is_liked ? 'text-red-500' : 'text-muted-foreground'}`}
        >
          <Heart className={`w-4 h-4 ${post.is_liked ? 'fill-current' : ''}`} />
          <span className="text-xs">{post.likes_count}</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={onComment}
          className="gap-1.5 text-muted-foreground"
        >
          <MessageCircle className="w-4 h-4" />
          <span className="text-xs">{post.comments_count}</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleShare}
          className="gap-1.5 text-muted-foreground"
        >
          <Share2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};

export default PostCard;
