import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Gift, Copy, Share2, ChevronRight } from 'lucide-react';

interface ReferralShareMinimalProps {
  language: 'en' | 'it';
  onCopied?: () => void;
}

const ReferralShareMinimal: React.FC<ReferralShareMinimalProps> = ({ language, onCopied }) => {
  const { user } = useAuth();
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [isEnabled, setIsEnabled] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!user?.id) return;

      const [{ data: settingsData }, { data: profile }] = await Promise.all([
        supabase.from('app_settings').select('value').eq('key', 'referral_system').single(),
        supabase.from('profiles').select('referral_code').eq('id', user.id).single(),
      ]);

      if (settingsData?.value) {
        const s = settingsData.value as { enabled?: boolean };
        setIsEnabled(s.enabled ?? true);
      }
      setReferralCode(profile?.referral_code || null);
    };
    load();
  }, [user?.id]);

  if (!isEnabled || !referralCode) return null;

  const referralLink = `${window.location.origin}/login?ref=${referralCode}`;

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'SoundFlow',
          text: language === 'it'
            ? 'Scarica SoundFlow e ricevi 1 mese di Premium gratis! 🎵'
            : 'Download SoundFlow and get 1 month of Premium for free! 🎵',
          url: referralLink,
        });
        return;
      } catch { /* cancelled */ }
    }
    // Fallback: copy
    try {
      await navigator.clipboard.writeText(referralLink);
      onCopied?.();
    } catch {
      const ta = document.createElement('textarea');
      ta.value = referralLink;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      onCopied?.();
    }
  };

  return (
    <button
      onClick={handleShare}
      className="flex items-center justify-between w-full group"
    >
      <div className="flex items-center gap-2">
        <Gift className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-sm text-foreground">
          {language === 'it' ? 'Invita un amico' : 'Invite a friend'}
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <span className="text-xs">
          {language === 'it' ? '1 mese Premium gratis' : '1 month Premium free'}
        </span>
        <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
      </div>
    </button>
  );
};

export default ReferralShareMinimal;
