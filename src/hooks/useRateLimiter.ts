import { useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface RateLimitConfig {
  maxActions: number;       // Max actions allowed in the time window
  windowSeconds: number;    // Time window in seconds
  blockDurationMinutes: number; // How long to block if limit exceeded
}

// Rate limit configs
export const COMMENT_RATE_LIMIT: RateLimitConfig = {
  maxActions: 3,
  windowSeconds: 10,
  blockDurationMinutes: 15,
};

export const POST_RATE_LIMIT: RateLimitConfig = {
  maxActions: 3,
  windowSeconds: 10,
  blockDurationMinutes: 48 * 60, // 48 hours in minutes
};

export function useRateLimiter() {
  const { user, profile, refreshProfile } = useAuth();
  const commentTimestamps = useRef<number[]>([]);
  const postTimestamps = useRef<number[]>([]);

  // Check if user is currently blocked for comments
  const isCommentsBlocked = useCallback((): { blocked: boolean; until?: Date } => {
    const blockedUntil = profile?.comments_blocked_until;
    if (!blockedUntil) return { blocked: false };
    
    const blockedDate = new Date(blockedUntil);
    if (blockedDate > new Date()) {
      return { blocked: true, until: blockedDate };
    }
    return { blocked: false };
  }, [profile?.comments_blocked_until]);

  // Check if user is currently blocked for posts
  const isPostsBlocked = useCallback((): { blocked: boolean; until?: Date } => {
    const blockedUntil = profile?.posts_blocked_until;
    if (!blockedUntil) return { blocked: false };
    
    const blockedDate = new Date(blockedUntil);
    if (blockedDate > new Date()) {
      return { blocked: true, until: blockedDate };
    }
    return { blocked: false };
  }, [profile?.posts_blocked_until]);

  // Check rate limit for comments (returns true if allowed, false if blocked)
  const checkCommentRateLimit = useCallback(async (): Promise<boolean> => {
    if (!user?.id) return false;

    // First check if already blocked
    const blockStatus = isCommentsBlocked();
    if (blockStatus.blocked) {
      const mins = Math.ceil((blockStatus.until!.getTime() - Date.now()) / 60000);
      toast.error(`Commenti bloccati per ancora ${mins} minuti`);
      return false;
    }

    const now = Date.now();
    const windowStart = now - (COMMENT_RATE_LIMIT.windowSeconds * 1000);

    // Clean old timestamps
    commentTimestamps.current = commentTimestamps.current.filter(ts => ts > windowStart);

    // Check if we're at the limit
    if (commentTimestamps.current.length >= COMMENT_RATE_LIMIT.maxActions) {
      // Block the user
      const blockUntil = new Date(now + COMMENT_RATE_LIMIT.blockDurationMinutes * 60 * 1000);
      
      await supabase
        .from('profiles')
        .update({ comments_blocked_until: blockUntil.toISOString() })
        .eq('id', user.id);

      await refreshProfile();
      
      toast.error(`Troppi commenti! Bloccato per ${COMMENT_RATE_LIMIT.blockDurationMinutes} minuti`);
      return false;
    }

    // Add current timestamp
    commentTimestamps.current.push(now);
    return true;
  }, [user?.id, isCommentsBlocked, refreshProfile]);

  // Check rate limit for posts (returns true if allowed, false if blocked)
  const checkPostRateLimit = useCallback(async (): Promise<boolean> => {
    if (!user?.id) return false;

    // First check if already blocked
    const blockStatus = isPostsBlocked();
    if (blockStatus.blocked) {
      const hours = Math.ceil((blockStatus.until!.getTime() - Date.now()) / 3600000);
      toast.error(`Post bloccati per ancora ${hours} ore`);
      return false;
    }

    const now = Date.now();
    const windowStart = now - (POST_RATE_LIMIT.windowSeconds * 1000);

    // Clean old timestamps
    postTimestamps.current = postTimestamps.current.filter(ts => ts > windowStart);

    // Check if we're at the limit
    if (postTimestamps.current.length >= POST_RATE_LIMIT.maxActions) {
      // Block the user
      const blockUntil = new Date(now + POST_RATE_LIMIT.blockDurationMinutes * 60 * 1000);
      
      await supabase
        .from('profiles')
        .update({ posts_blocked_until: blockUntil.toISOString() })
        .eq('id', user.id);

      await refreshProfile();
      
      toast.error(`Troppi post! Bloccato per 48 ore`);
      return false;
    }

    // Add current timestamp
    postTimestamps.current.push(now);
    return true;
  }, [user?.id, isPostsBlocked, refreshProfile]);

  // Simulate blocks for testing
  const simulateCommentBlock = useCallback(async () => {
    if (!user?.id) return;
    
    const blockUntil = new Date(Date.now() + COMMENT_RATE_LIMIT.blockDurationMinutes * 60 * 1000);
    
    await supabase
      .from('profiles')
      .update({ comments_blocked_until: blockUntil.toISOString() })
      .eq('id', user.id);

    await refreshProfile();
    toast.error(`Commenti bloccati per ${COMMENT_RATE_LIMIT.blockDurationMinutes} minuti (TEST)`);
  }, [user?.id, refreshProfile]);

  const simulatePostBlock = useCallback(async () => {
    if (!user?.id) return;
    
    const blockUntil = new Date(Date.now() + POST_RATE_LIMIT.blockDurationMinutes * 60 * 1000);
    
    await supabase
      .from('profiles')
      .update({ posts_blocked_until: blockUntil.toISOString() })
      .eq('id', user.id);

    await refreshProfile();
    toast.error(`Post bloccati per 48 ore (TEST)`);
  }, [user?.id, refreshProfile]);

  // Remove blocks for testing
  const removeCommentBlock = useCallback(async () => {
    if (!user?.id) return;
    
    await supabase
      .from('profiles')
      .update({ comments_blocked_until: null })
      .eq('id', user.id);

    await refreshProfile();
    toast.success('Blocco commenti rimosso (TEST)');
  }, [user?.id, refreshProfile]);

  const removePostBlock = useCallback(async () => {
    if (!user?.id) return;
    
    await supabase
      .from('profiles')
      .update({ posts_blocked_until: null })
      .eq('id', user.id);

    await refreshProfile();
    toast.success('Blocco post rimosso (TEST)');
  }, [user?.id, refreshProfile]);

  return {
    isCommentsBlocked,
    isPostsBlocked,
    checkCommentRateLimit,
    checkPostRateLimit,
    simulateCommentBlock,
    simulatePostBlock,
    removeCommentBlock,
    removePostBlock,
  };
}
