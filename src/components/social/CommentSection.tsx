import React, { useState } from 'react';
import { Heart, Reply, Trash2, ChevronDown, ChevronUp, Loader2, User, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useComments, Comment } from '@/hooks/useComments';
import { formatDistanceToNow } from 'date-fns';
import { it, enUS } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';

interface CommentSectionProps {
  postId?: string;
  albumId?: string;
}

const CommentItem: React.FC<{
  comment: Comment;
  onLike: (id: string) => Promise<boolean>;
  onUnlike: (id: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  onReply: (content: string, parentId: string) => Promise<any>;
  fetchReplies: (parentId: string) => Promise<Comment[]>;
  locale: any;
}> = ({ comment, onLike, onUnlike, onDelete, onReply, fetchReplies, locale }) => {
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
    <div className="space-y-2">
      <div className="flex gap-3">
        <button 
          onClick={() => navigate(`/profile/${comment.user_id}`)}
          className="shrink-0"
        >
          <div className="w-8 h-8 rounded-full bg-muted overflow-hidden">
            {comment.profile?.avatar_url ? (
              <img src={comment.profile.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <User className="w-4 h-4 text-muted-foreground" />
              </div>
            )}
          </div>
        </button>

        <div className="flex-1 min-w-0">
          <div className="bg-secondary rounded-lg px-3 py-2">
            <button 
              onClick={() => navigate(`/profile/${comment.user_id}`)}
              className="text-sm font-medium text-foreground hover:underline"
            >
              {comment.profile?.display_name || comment.profile?.email?.split('@')[0] || 'Utente'}
            </button>
            <p className="text-sm text-foreground">{comment.content}</p>
          </div>

          <div className="flex items-center gap-3 mt-1 px-1">
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true, locale })}
            </span>
            
            <button
              onClick={handleLike}
              disabled={isLiking}
              className={`text-xs font-medium ${comment.is_liked ? 'text-red-500' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {comment.likes_count > 0 && `${comment.likes_count} `}
              {settings.language === 'it' ? 'Mi piace' : 'Like'}
            </button>

            <button
              onClick={() => setShowReplyInput(!showReplyInput)}
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              {settings.language === 'it' ? 'Rispondi' : 'Reply'}
            </button>

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
          {showReplyInput && (
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

          {/* Show/hide replies */}
          {comment.replies_count > 0 && (
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

          {/* Replies */}
          {showReplies && replies.length > 0 && (
            <div className="space-y-2 mt-2 pl-4 border-l-2 border-border">
              {replies.map((reply) => (
                <CommentItem
                  key={reply.id}
                  comment={reply}
                  onLike={onLike}
                  onUnlike={onUnlike}
                  onDelete={onDelete}
                  onReply={onReply}
                  fetchReplies={fetchReplies}
                  locale={locale}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const CommentSection: React.FC<CommentSectionProps> = ({ postId, albumId }) => {
  const { user, profile } = useAuth();
  const { settings } = useSettings();
  const { comments, isLoading, addComment, deleteComment, likeComment, unlikeComment, fetchReplies } = useComments({ postId, albumId });
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const locale = settings.language === 'it' ? it : enUS;

  const handleSubmit = async () => {
    if (!newComment.trim() || isSubmitting) return;
    setIsSubmitting(true);
    await addComment(newComment);
    setNewComment('');
    setIsSubmitting(false);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* New comment input */}
      {user && (
        <div className="flex gap-3">
          <div className="w-8 h-8 rounded-full bg-muted overflow-hidden shrink-0">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <User className="w-4 h-4 text-muted-foreground" />
              </div>
            )}
          </div>
          <div className="flex-1 flex gap-2">
            <Input
              placeholder={settings.language === 'it' ? 'Scrivi un commento...' : 'Write a comment...'}
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              className="h-9"
            />
            <Button size="icon" onClick={handleSubmit} disabled={isSubmitting} className="h-9 w-9">
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      )}

      {/* Comments list */}
      {comments.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-4">
          {settings.language === 'it' ? 'Nessun commento ancora' : 'No comments yet'}
        </p>
      ) : (
        <div className="space-y-4">
          {comments.map((comment) => (
            <CommentItem
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
        </div>
      )}
    </div>
  );
};

export default CommentSection;
