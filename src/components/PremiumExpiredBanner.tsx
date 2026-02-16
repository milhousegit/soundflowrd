import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { supabase } from '@/integrations/supabase/client';
import { Crown, X, AlertTriangle, Download, Car, Music, Mic2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isPast } from 'date-fns';
import PaymentPendingBanner from './PaymentPendingBanner';

const STORAGE_KEY = 'premium_expired_dismissed';

interface PremiumExpiredBannerProps {
  forceShow?: boolean;
  onClose?: () => void;
}

const PremiumExpiredBanner: React.FC<PremiumExpiredBannerProps> = ({ forceShow = false, onClose }) => {
  const { profile, isAuthenticated } = useAuth();
  const { settings } = useSettings();
  const [isVisible, setIsVisible] = useState(false);
  const [showPaymentPending, setShowPaymentPending] = useState(false);
  const isItalian = settings.language === 'it';

  // Check if premium has expired (had premium but now expired)
  const hadPremium = profile?.premium_expires_at;
  const isPremiumExpired = hadPremium && isPast(new Date(profile.premium_expires_at!));

  useEffect(() => {
    if (forceShow) {
      setIsVisible(true);
      return;
    }

    if (!isAuthenticated || !profile?.id) return;

    // Only show if premium has expired
    if (isPremiumExpired) {
      const dismissedKey = `${STORAGE_KEY}_${profile.id}`;
      const lastDismissed = localStorage.getItem(dismissedKey);
      
      // Show if never dismissed or dismissed more than 24 hours ago
      if (!lastDismissed || Date.now() - parseInt(lastDismissed) > 24 * 60 * 60 * 1000) {
        const timer = setTimeout(() => {
          setIsVisible(true);
        }, 2000);
        return () => clearTimeout(timer);
      }
    }
  }, [isAuthenticated, isPremiumExpired, profile?.id, forceShow]);

  const handleDismiss = () => {
    setIsVisible(false);
    if (onClose) onClose();
    
    // Store dismissal time
    if (profile?.id && !forceShow) {
      localStorage.setItem(`${STORAGE_KEY}_${profile.id}`, Date.now().toString());
    }
  };

  const handleRenewPremium = async () => {
    // Open Ko-fi link
    window.open('https://ko-fi.com/tony271202', '_blank');
    // Save payment pending timestamp
    if (profile?.id) {
      await supabase
        .from('profiles')
        .update({ payment_pending_since: new Date().toISOString() })
        .eq('id', profile.id);
    }
    // Close this banner and show payment pending
    handleDismiss();
    setTimeout(() => {
      setShowPaymentPending(true);
    }, 1500);
  };

  if (!isVisible && !showPaymentPending) return null;

  const lostFeatures = [
    {
      icon: Car,
      label: isItalian ? 'Modalità Auto' : 'Auto Mode',
      desc: isItalian ? 'Interfaccia guida non disponibile' : 'Driving UI not available'
    },
    {
      icon: Music,
      label: isItalian ? 'Importa Playlist' : 'Playlist Import',
      desc: isItalian ? 'Non puoi importare da altri servizi' : 'Cannot import from other services'
    },
    {
      icon: Download,
      label: isItalian ? 'Download Offline' : 'Offline Downloads',
      desc: isItalian ? 'Non puoi più scaricare brani' : 'You can no longer download tracks'
    },
    {
      icon: Mic2,
      label: isItalian ? 'Testi Sincronizzati' : 'Synced Lyrics',
      desc: isItalian ? 'Karaoke e testi non disponibili' : 'Karaoke and lyrics not available'
    },
    {
      icon: Zap,
      label: isItalian ? 'Modalità Ibrida' : 'Hybrid Mode',
      desc: isItalian ? 'Fallback audio disattivato' : 'Audio fallback disabled'
    }
  ];

  return (
    <>
      {isVisible && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-fade-in">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={handleDismiss}
          />
          
          {/* Banner */}
          <div className="relative z-10 w-full max-w-md bg-gradient-to-br from-violet-500/20 via-purple-500/10 to-blue-500/20 border border-violet-500/30 rounded-2xl p-6 shadow-2xl animate-scale-in">
            {/* Close button */}
            <button 
              onClick={handleDismiss}
              className="absolute top-3 right-3 p-1.5 rounded-full bg-background/50 hover:bg-background/80 transition-colors"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>

            {/* Warning icon */}
            <div className="flex justify-center mb-4">
              <div className="relative">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center shadow-lg">
                  <AlertTriangle className="w-10 h-10 text-white" />
                </div>
                <Crown className="absolute -top-1 -right-1 w-6 h-6 text-violet-400" />
              </div>
            </div>

            {/* Title */}
            <h2 className="text-2xl font-bold text-center text-foreground mb-2">
              {isItalian ? 'Premium Scaduto' : 'Premium Expired'} 😢
            </h2>

            {/* Subtitle */}
            <p className="text-center text-muted-foreground mb-4">
              {isItalian 
                ? 'Il tuo abbonamento Premium è terminato. Ecco cosa non puoi più fare:'
                : 'Your Premium subscription has ended. Here\'s what you\'ve lost:'}
            </p>

            {/* Lost features list */}
            <div className="space-y-2 mb-6">
              {lostFeatures.map(({ icon: Icon, label, desc }) => (
                <div key={label} className="flex items-center gap-3 p-2.5 rounded-lg bg-background/50">
                  <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center">
                    <Icon className="w-4 h-4 text-red-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground line-through opacity-70">{label}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* CTA Buttons */}
            <div className="space-y-2">
              <Button 
                onClick={handleRenewPremium}
                className="w-full bg-gradient-to-r from-violet-500 to-blue-600 hover:opacity-90 text-white font-semibold"
              >
                <Crown className="w-4 h-4 mr-2" />
                {isItalian ? 'Rinnova Premium' : 'Renew Premium'}
              </Button>
              <Button 
                variant="ghost"
                onClick={handleDismiss}
                className="w-full text-muted-foreground"
              >
                {isItalian ? 'Continua senza Premium' : 'Continue without Premium'}
              </Button>
            </div>
          </div>
        </div>
      )}
      
      {/* Payment Pending Banner */}
      {showPaymentPending && (
        <PaymentPendingBanner onClose={() => setShowPaymentPending(false)} />
      )}
    </>
  );
};

export default PremiumExpiredBanner;
