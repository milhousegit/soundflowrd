import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Gift, Copy, Share2, Users, Crown, Loader2 } from 'lucide-react';

interface ReferralShareProps {
  language: 'en' | 'it';
}

interface ReferralStats {
  referralCode: string | null;
  totalReferrals: number;
}

const ReferralShare: React.FC<ReferralShareProps> = ({ language }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [stats, setStats] = useState<ReferralStats>({ referralCode: null, totalReferrals: 0 });
  const [isLoading, setIsLoading] = useState(true);

  const t = {
    title: language === 'it' ? 'Invita un amico' : 'Invite a friend',
    description: language === 'it' 
      ? 'Condividi il tuo link e ricevete entrambi 1 mese di Premium!' 
      : 'Share your link and both get 1 month of Premium!',
    copyLink: language === 'it' ? 'Copia link' : 'Copy link',
    share: language === 'it' ? 'Condividi' : 'Share',
    copied: language === 'it' ? 'Link copiato!' : 'Link copied!',
    referrals: language === 'it' ? 'Amici invitati' : 'Friends invited',
    yourCode: language === 'it' ? 'Il tuo codice' : 'Your code',
  };

  useEffect(() => {
    const loadStats = async () => {
      if (!user?.id) return;

      try {
        // Get referral code
        const { data: profile } = await supabase
          .from('profiles')
          .select('referral_code')
          .eq('id', user.id)
          .single();

        // Get referral count
        const { count } = await supabase
          .from('referrals')
          .select('*', { count: 'exact', head: true })
          .eq('referrer_id', user.id);

        setStats({
          referralCode: profile?.referral_code || null,
          totalReferrals: count || 0,
        });
      } catch (error) {
        console.error('Error loading referral stats:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadStats();
  }, [user?.id]);

  const referralLink = stats.referralCode 
    ? `${window.location.origin}/login?ref=${stats.referralCode}`
    : null;

  const handleCopy = async () => {
    if (!referralLink) return;
    
    try {
      await navigator.clipboard.writeText(referralLink);
      toast({ title: t.copied });
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = referralLink;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      toast({ title: t.copied });
    }
  };

  const handleShare = async () => {
    if (!referralLink) return;

    const shareText = language === 'it'
      ? `Scarica SoundFlow e ricevi 1 mese di Premium gratis! 🎵\n${referralLink}`
      : `Download SoundFlow and get 1 month of Premium for free! 🎵\n${referralLink}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'SoundFlow',
          text: shareText,
          url: referralLink,
        });
      } catch (err) {
        // User cancelled or error
      }
    } else {
      handleCopy();
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 rounded-xl bg-gradient-to-r from-[#8B5CF6]/10 to-[#3B82F6]/10 border border-[#8B5CF6]/20">
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-6 h-6 animate-spin text-[#8B5CF6]" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-xl bg-gradient-to-r from-[#8B5CF6]/10 to-[#3B82F6]/10 border border-[#8B5CF6]/20 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] flex items-center justify-center">
          <Gift className="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 className="font-semibold text-foreground">{t.title}</h3>
          <p className="text-xs text-muted-foreground">{t.description}</p>
        </div>
      </div>

      {/* Referral code display */}
      {stats.referralCode && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-background/50">
          <span className="text-sm text-muted-foreground">{t.yourCode}:</span>
          <span className="font-mono font-bold text-[#8B5CF6] text-lg">{stats.referralCode}</span>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1 border-[#8B5CF6]/50 text-[#8B5CF6] hover:bg-[#8B5CF6]/10"
          onClick={handleCopy}
          disabled={!referralLink}
        >
          <Copy className="w-4 h-4 mr-2" />
          {t.copyLink}
        </Button>
        <Button
          className="flex-1 bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] hover:opacity-90 border-0"
          onClick={handleShare}
          disabled={!referralLink}
        >
          <Share2 className="w-4 h-4 mr-2" />
          {t.share}
        </Button>
      </div>

      {/* Stats */}
      <div className="flex items-center justify-center gap-2 pt-2 border-t border-[#8B5CF6]/20">
        <Users className="w-4 h-4 text-[#8B5CF6]" />
        <span className="text-sm text-muted-foreground">{t.referrals}:</span>
        <span className="font-bold text-[#8B5CF6]">{stats.totalReferrals}</span>
        {stats.totalReferrals > 0 && (
          <span className="text-xs text-muted-foreground">
            (+{stats.totalReferrals} {language === 'it' ? 'mesi' : 'months'} <Crown className="w-3 h-3 inline text-[#8B5CF6]" />)
          </span>
        )}
      </div>
    </div>
  );
};

export default ReferralShare;
