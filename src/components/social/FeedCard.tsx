import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, MessageCircle, Share2, Play, MoreHorizontal, Trash2, User, Crown, Disc, ChevronDown, ChevronUp, Send, Loader2, Bookmark, ListMusic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { FeedPost, AlbumRelease, AlbumComment, FeedPlaylist } from '@/hooks/useFeed';
import { useAuth } from '@/contexts/AuthContext';
import { usePlayer } from '@/contexts/PlayerContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useComments, Comment } from '@/hooks/useComments';
import { useFavorites } from '@/hooks/useFavorites';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { it, enUS } from 'date-fns/locale';
import { toast } from 'sonner';

interface FeedCardProps {
  type: 'post' | 'release' | 'comment' | 'playlist';
  data: FeedPost | AlbumRelease | AlbumComment | FeedPlaylist;
  onLikePost?: () => Promise<boolean>;
  onUnlikePost?: () => Promise<boolean>;
  onDeletePost?: () => Promise<boolean>;
}

// Inline comment component for feed
const InlineComment: React.FC<{
  comment: Comment;
  onLike: (id: string) => Promise<boolean>;
  onUnlike: (id: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  onReply: (content: string, parentId: string) => Promise<any>;
  fetchReplies: (parentId: string) => Promise<Comment[]>;
  locale: any;
  isNested?: boolean;
}> = ({ comment, onLike, onUnlike, onDelete, onReply, fetchReplies, locale, isNested }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { settings } = useSettings();
  const [showReplies, setShowReplies] = useState(false);
  const [replies, setReplies] = useState<Comment[]>([]);
  const [isLoadingReplies, setIsLoadingReplies] = useState(false);
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLiking, setIsLiking] = useState(false);

  const isOwner = user?.id === comment.user_id;

  const handleToggleReplies = async () => {
    if (!showReplies && replies.length === 0) {
      setIsLoadingReplies(true);
      const fetchedReplies = await fetchReplies(comment.id);
      setReplies(fetchedReplies);
      setIsLoadingReplies(false);
    }
    setShowReplies(!showReplies);
  };

  const handleLike = async () => {
    if (isLiking) return;
    setIsLiking(true);
    if (comment.is_liked) {
      await onUnlike(comment.id);
    } else {
      await onLike(comment.id);
    }
    setIsLiking(false);
  };

  const handleSubmitReply = async () => {
    if (!replyContent.trim() || isSubmitting) return;
    setIsSubmitting(true);
    const newReply = await onReply(replyContent, comment.id);
    if (newReply) {
      setReplies(prev => [...prev, newReply]);
      setReplyContent('');
      setShowReplyInput(false);
      setShowReplies(true);
    }
    setIsSubmitting(false);
  };

  return (
    <div className="flex gap-2">
      <Avatar 
        className="w-7 h-7 cursor-pointer shrink-0"
        onClick={() => navigate(`/profile/${comment.user_id}`)}
      >
        <AvatarImage src={comment.profile?.avatar_url || undefined} />
        <AvatarFallback className="text-xs">
          {comment.profile?.display_name?.[0] || '?'}
        </AvatarFallback>
      </Avatar>
      
      <div className="flex-1 min-w-0">
        <div className="bg-muted/50 rounded-lg px-3 py-2">
          <span 
            className="text-xs font-medium text-foreground hover:underline cursor-pointer"
            onClick={() => navigate(`/profile/${comment.user_id}`)}
          >
            {comment.profile?.display_name || 'Utente'}
          </span>
          <p className="text-sm text-foreground">{comment.content}</p>
        </div>

        <div className="flex items-center gap-3 mt-1 px-1">
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(comment.created_at), { addSuffix: false, locale })}
          </span>
          
          <button
            onClick={handleLike}
            disabled={isLiking}
            className={`text-xs font-medium ${comment.is_liked ? 'text-red-500' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {comment.likes_count > 0 && `${comment.likes_count} `}
            {settings.language === 'it' ? 'Mi piace' : 'Like'}
          </button>

          {!isNested && (
            <button
              onClick={() => setShowReplyInput(!showReplyInput)}
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              {settings.language === 'it' ? 'Rispondi' : 'Reply'}
            </button>
          )}

          {isOwner && (
            <button
              onClick={() => onDelete(comment.id)}
              className="text-xs font-medium text-muted-foreground hover:text-destructive"
            >
              {settings.language === 'it' ? 'Elimina' : 'Delete'}
            </button>
          )}
        </div>

        {/* Reply input */}
        {showReplyInput && !isNested && (
          <div className="flex gap-2 mt-2">
            <Input
              placeholder={settings.language === 'it' ? 'Scrivi una risposta...' : 'Write a reply...'}
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmitReply()}
              className="h-8 text-sm"
            />
            <Button size="iconSm" onClick={handleSubmitReply} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
            </Button>
          </div>
        )}

        {/* Show/hide replies - only for main comments */}
        {!isNested && comment.replies_count > 0 && (
          <button
            onClick={handleToggleReplies}
            className="flex items-center gap-1 text-xs font-medium text-primary mt-2"
          >
            {showReplies ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {isLoadingReplies ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              `${comment.replies_count} ${settings.language === 'it' ? 'risposte' : 'replies'}`
            )}
          </button>
        )}

        {/* Replies - only 1 level deep */}
        {!isNested && showReplies && replies.length > 0 && (
          <div className="space-y-2 mt-2 pl-2 border-l-2 border-border">
            {replies.map((reply) => (
              <InlineComment
                key={reply.id}
                comment={reply}
                onLike={onLike}
                onUnlike={onUnlike}
                onDelete={onDelete}
                onReply={onReply}
                fetchReplies={fetchReplies}
                locale={locale}
                isNested={true}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const FeedCard: React.FC<FeedCardProps> = ({ type, data, onLikePost, onUnlikePost, onDeletePost }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { playTrack } = usePlayer();
  const { settings } = useSettings();
  const locale = settings.language === 'it' ? it : enUS;
  
  const [showComments, setShowComments] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [albumCommentsCount, setAlbumCommentsCount] = useState(0);
  const [albumSavesCount, setAlbumSavesCount] = useState(0);
  
  // Favorites hook for saving albums/tracks
  const { isFavorite, toggleFavorite } = useFavorites();

  // Get album ID based on type
  const getAlbumId = (): string | null => {
    if (type === 'release') return (data as AlbumRelease).id;
    if (type === 'comment') return (data as AlbumComment).album_id;
    return null;
  };

  // Get post ID for post type
  const getPostId = (): string | null => {
    if (type === 'post') return (data as FeedPost).id;
    return null;
  };

  const albumId = getAlbumId();
  const postId = getPostId();

  // Use comments hook - for albums or posts
  const { 
    comments, 
    isLoading: isLoadingComments, 
    addComment, 
    deleteComment, 
    likeComment, 
    unlikeComment, 
    fetchReplies,
    refetch: refetchComments 
  } = useComments({ 
    albumId: albumId || undefined,
    postId: postId || undefined 
  });

  // Fetch album comments count and saves count
  useEffect(() => {
    const fetchAlbumCounts = async () => {
      if (!albumId) return;

      try {
        // Fetch comments count
        const { count: totalComments } = await supabase
          .from('comments')
          .select('*', { count: 'exact', head: true })
          .eq('album_id', albumId);

        setAlbumCommentsCount(totalComments || 0);

        // Fetch saves count (from favorites table)
        const { count: totalSaves } = await supabase
          .from('favorites')
          .select('*', { count: 'exact', head: true })
          .eq('item_id', albumId)
          .eq('item_type', 'album');

        setAlbumSavesCount(totalSaves || 0);
      } catch (error) {
        console.error('Error fetching album counts:', error);
      }
    };

    fetchAlbumCounts();
  }, [albumId]);

  const formatDate = (dateStr: string) => {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale });
  };

  // Handle saving album to library
  const handleAlbumSaveToggle = async () => {
    if (!albumId) return;
    const albumInfo = getAlbumInfo();
    const album = {
      id: albumId,
      title: albumInfo.title,
      artist: albumInfo.artist,
      coverUrl: albumInfo.cover || '',
    };
    const wasSaved = isFavorite('album', albumId);
    await toggleFavorite('album', album as any);
    // Update local count
    setAlbumSavesCount(prev => wasSaved ? Math.max(0, prev - 1) : prev + 1);
  };

  // Handle saving track to library
  const handleTrackSaveToggle = async (trackData: {
    id: string;
    title: string;
    artist: string;
    album?: string;
    coverUrl?: string;
    duration?: number;
  }) => {
    const track = {
      id: trackData.id,
      title: trackData.title,
      artist: trackData.artist,
      album: trackData.album || '',
      coverUrl: trackData.coverUrl || '',
      duration: trackData.duration || 0,
    };
    await toggleFavorite('track', track as any);
  };

  const getAlbumInfo = () => {
    if (type === 'release') {
      const release = data as AlbumRelease;
      return { title: release.title, artist: release.artist?.name || '', cover: release.cover_medium };
    }
    if (type === 'comment') {
      const comment = data as AlbumComment;
      return { title: comment.album_title || '', artist: comment.album_artist || '', cover: comment.album_cover };
    }
    if (type === 'post') {
      const post = data as FeedPost;
      return { title: post.track_album || '', artist: post.track_artist || '', cover: post.track_cover_url };
    }
    return { title: '', artist: '', cover: '' };
  };

  const handleShare = async () => {
    const url = albumId ? `${window.location.origin}/album/${albumId}` : window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: getAlbumInfo().title, url });
      } catch {}
    } else {
      navigator.clipboard.writeText(url);
      toast.success(settings.language === 'it' ? 'Link copiato!' : 'Link copied!');
    }
  };

  const handleSubmitComment = async () => {
    if (!newComment.trim() || (!albumId && !postId)) return;
    await addComment(newComment);
    setNewComment('');
    if (albumId) {
      setAlbumCommentsCount(prev => prev + 1);
    }
  };

  // Render based on type
  const renderContent = () => {
    switch (type) {
      case 'post':
        return renderPost();
      case 'release':
        return renderRelease();
      case 'comment':
        return renderAlbumComment();
      case 'playlist':
        return renderPlaylist();
      default:
        return null;
    }
  };

  const renderPlaylist = () => {
    const playlist = data as FeedPlaylist;
    const isProfileAdmin = playlist.profile?.is_admin || false;

    return (
      <>
        {/* Header */}
        <div className="flex items-center justify-between">
          <button 
            onClick={() => navigate(`/profile/${playlist.user_id}`)}
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          >
            <Avatar className="w-10 h-10">
              <AvatarImage src={playlist.profile?.avatar_url || undefined} />
              <AvatarFallback><User className="w-5 h-5" /></AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-1.5">
                <p className="font-medium text-sm text-foreground">
                  {playlist.profile?.display_name || 'Utente'}
                </p>
                {isProfileAdmin && <Crown className="w-3.5 h-3.5 text-amber-500" />}
                {!isProfileAdmin && playlist.profile?.is_premium && <Crown className="w-3.5 h-3.5 text-[#8B5CF6]" />}
              </div>
              <p className="text-xs text-muted-foreground">
                {settings.language === 'it' ? 'Ha pubblicato una playlist' : 'Published a playlist'}
              </p>
            </div>
          </button>
        </div>

        {/* Playlist card */}
        <button
          onClick={() => navigate(`/playlist/${playlist.id}`)}
          className="w-full flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors text-left"
        >
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
            {playlist.description && (
              <p className="text-xs text-muted-foreground truncate">{playlist.description}</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {playlist.track_count || 0} {settings.language === 'it' ? 'brani' : 'tracks'}
            </p>
          </div>
        </button>

        {/* Actions */}
        <div className="flex items-center gap-4 pt-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleShare}
            className="gap-1.5 text-muted-foreground"
          >
            <Share2 className="w-4 h-4" />
            <span className="text-xs">{settings.language === 'it' ? 'Condividi' : 'Share'}</span>
          </Button>
          <span className="text-xs text-muted-foreground">
            {formatDate(playlist.created_at)}
          </span>
        </div>
      </>
    );
  };

  const renderPost = () => {
    const post = data as FeedPost;
    const isOwner = user?.id === post.user_id;
    const isProfileAdmin = post.profile?.is_admin || false;

    return (
      <>
        {/* Header */}
        <div className="flex items-center justify-between">
          <button 
            onClick={() => navigate(`/profile/${post.user_id}`)}
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          >
            <Avatar className="w-10 h-10">
              <AvatarImage src={post.profile?.avatar_url || undefined} />
              <AvatarFallback><User className="w-5 h-5" /></AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-1.5">
                <p className="font-medium text-sm text-foreground">
                  {post.profile?.display_name || 'Utente'}
                </p>
                {isProfileAdmin && <Crown className="w-3.5 h-3.5 text-amber-500" />}
                {!isProfileAdmin && post.profile?.is_premium && <Crown className="w-3.5 h-3.5 text-[#8B5CF6]" />}
              </div>
              <p className="text-xs text-muted-foreground">{formatDate(post.created_at)}</p>
            </div>
          </button>

          {isOwner && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="iconSm"><MoreHorizontal className="w-4 h-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onDeletePost} className="text-destructive">
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
            onClick={() => {
              const track = {
                id: post.track_id!,
                title: post.track_title || '',
                artist: post.track_artist || '',
                album: post.track_album || '',
                coverUrl: post.track_cover_url || '',
                duration: post.track_duration || 0,
              };
              playTrack(track, [track]);
            }}
            className="w-full flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors text-left"
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

        {/* Post actions - like/unlike post + save track */}
        <div className="flex items-center gap-4 pt-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              if (post.is_liked) {
                await onUnlikePost?.();
              } else {
                await onLikePost?.();
              }
            }}
            className={`gap-1.5 ${post.is_liked ? 'text-red-500' : 'text-muted-foreground'}`}
          >
            <Heart className={`w-4 h-4 ${post.is_liked ? 'fill-current' : ''}`} />
            <span className="text-xs">{post.likes_count || 0}</span>
          </Button>

          {/* Save track button - only if post has a track */}
          {post.track_id && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleTrackSaveToggle({
                id: post.track_id!,
                title: post.track_title || '',
                artist: post.track_artist || '',
                album: post.track_album || '',
                coverUrl: post.track_cover_url || '',
                duration: post.track_duration || 0,
              })}
              className={`gap-1.5 ${isFavorite('track', post.track_id) ? 'text-primary' : 'text-muted-foreground'}`}
            >
              <Bookmark className={`w-4 h-4 ${isFavorite('track', post.track_id) ? 'fill-current' : ''}`} />
              <span className="text-xs">{settings.language === 'it' ? 'Salva' : 'Save'}</span>
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowComments(!showComments)}
            className="gap-1.5 text-muted-foreground"
          >
            <MessageCircle className="w-4 h-4" />
            <span className="text-xs">{post.comments_count || 0}</span>
          </Button>

          <Button variant="ghost" size="sm" onClick={handleShare} className="gap-1.5 text-muted-foreground">
            <Share2 className="w-4 h-4" />
          </Button>
        </div>
      </>
    );
  };

  const renderRelease = () => {
    const release = data as AlbumRelease;

    return (
      <>
        {/* Header */}
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
        
        {/* Album info */}
        <button
          onClick={() => navigate(`/album/${release.id}`)}
          className="w-full flex gap-3 text-left hover:opacity-80 transition-opacity"
        >
          <img
            src={release.cover_medium}
            alt={release.title}
            className="w-16 h-16 rounded-lg object-cover shrink-0"
          />
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground truncate">{release.title}</h3>
            <p className="text-sm text-muted-foreground truncate">{release.artist?.name}</p>
            <span className="inline-block mt-1 px-2 py-0.5 text-xs rounded-full bg-primary/20 text-primary capitalize">
              {release.record_type}
            </span>
          </div>
        </button>

        {/* Album actions */}
        <div className="flex items-center gap-4 pt-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleAlbumSaveToggle}
            className={`gap-1.5 ${isFavorite('album', albumId || '') ? 'text-primary' : 'text-muted-foreground'}`}
          >
            <Bookmark className={`w-4 h-4 ${isFavorite('album', albumId || '') ? 'fill-current' : ''}`} />
            <span className="text-xs">{albumSavesCount}</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowComments(!showComments)}
            className="gap-1.5 text-muted-foreground"
          >
            <MessageCircle className="w-4 h-4" />
            <span className="text-xs">{albumCommentsCount}</span>
          </Button>

          <Button variant="ghost" size="sm" onClick={handleShare} className="gap-1.5 text-muted-foreground">
            <Share2 className="w-4 h-4" />
          </Button>
        </div>
      </>
    );
  };

  const renderAlbumComment = () => {
    const comment = data as AlbumComment;

    return (
      <>
        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center">
            <MessageCircle className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
          <span className="text-xs text-muted-foreground">
            {settings.language === 'it' ? 'Nuovo commento' : 'New comment'}
          </span>
          <span className="text-xs text-muted-foreground">•</span>
          <span className="text-xs text-muted-foreground">{formatDate(comment.created_at)}</span>
        </div>

        {/* Comment author + content */}
        <div className="flex items-start gap-3">
          <Avatar 
            className="w-10 h-10 cursor-pointer shrink-0"
            onClick={() => navigate(`/profile/${comment.user_id}`)}
          >
            <AvatarImage src={comment.profile?.avatar_url || undefined} />
            <AvatarFallback><User className="w-5 h-5" /></AvatarFallback>
          </Avatar>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span 
                className="text-sm font-medium text-foreground hover:underline cursor-pointer"
                onClick={() => navigate(`/profile/${comment.user_id}`)}
              >
                {comment.profile?.display_name || 'Utente'}
              </span>
            </div>
            <p className="text-sm text-foreground mb-3">{comment.content}</p>
          </div>
        </div>
        
        {/* Album info */}
        {comment.album_title && (
          <button
            onClick={() => navigate(`/album/${comment.album_id}`)}
            className="w-full flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors text-left"
          >
            {comment.album_cover && (
              <img src={comment.album_cover} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{comment.album_title}</p>
              <p className="text-xs text-muted-foreground truncate">{comment.album_artist}</p>
            </div>
          </button>
        )}

        {/* Album actions */}
        <div className="flex items-center gap-4 pt-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleAlbumSaveToggle}
            className={`gap-1.5 ${isFavorite('album', albumId || '') ? 'text-primary' : 'text-muted-foreground'}`}
          >
            <Bookmark className={`w-4 h-4 ${isFavorite('album', albumId || '') ? 'fill-current' : ''}`} />
            <span className="text-xs">{albumSavesCount}</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowComments(!showComments)}
            className="gap-1.5 text-muted-foreground"
          >
            <MessageCircle className="w-4 h-4" />
            <span className="text-xs">{albumCommentsCount}</span>
          </Button>

          <Button variant="ghost" size="sm" onClick={handleShare} className="gap-1.5 text-muted-foreground">
            <Share2 className="w-4 h-4" />
          </Button>
        </div>
      </>
    );
  };

  return (
    <div className="bg-card rounded-xl p-4 border border-border space-y-3">
      {renderContent()}

      {/* Comments section - inline expandable */}
      {showComments && (albumId || postId) && (
        <div className="pt-3 border-t border-border space-y-3">
          {/* Comment input */}
          {user && (
            <div className="flex gap-2">
              <Input
                placeholder={settings.language === 'it' ? 'Scrivi un commento...' : 'Write a comment...'}
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmitComment()}
                className="h-9"
              />
              <Button size="icon" onClick={handleSubmitComment} className="h-9 w-9 shrink-0">
                <Send className="w-4 h-4" />
              </Button>
            </div>
          )}

          {/* Comments list */}
          {isLoadingComments ? (
            <div className="flex justify-center py-4">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : comments.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-2">
              {settings.language === 'it' ? 'Nessun commento ancora' : 'No comments yet'}
            </p>
          ) : (
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {comments.slice(0, 5).map((comment) => (
                <InlineComment
                  key={comment.id}
                  comment={comment}
                  onLike={likeComment}
                  onUnlike={unlikeComment}
                  onDelete={deleteComment}
                  onReply={addComment}
                  fetchReplies={fetchReplies}
                  locale={locale}
                />
              ))}
              {comments.length > 5 && albumId && (
                <button 
                  onClick={() => navigate(`/album/${albumId}`)}
                  className="text-xs text-primary hover:underline"
                >
                  {settings.language === 'it' 
                    ? `Vedi tutti i ${comments.length} commenti` 
                    : `View all ${comments.length} comments`}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FeedCard;
