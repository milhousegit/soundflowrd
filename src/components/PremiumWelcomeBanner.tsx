import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { Crown, X, Sparkles, Download, Music } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isPast } from 'date-fns';

const STORAGE_KEY = 'premium_welcome_shown';

const PremiumWelcomeBanner: React.FC = () => {
  const { profile, isAuthenticated } = useAuth();
  const { settings } = useSettings();
  const [isVisible, setIsVisible] = useState(false);
  const isItalian = settings.language === 'it';

  const isPremiumActive = profile?.is_premium && 
    profile?.premium_expires_at && 
    !isPast(new Date(profile.premium_expires_at));

  useEffect(() => {
    if (!isAuthenticated || !isPremiumActive) return;

    // Check if we already showed the banner for this user
    const shownForUser = localStorage.getItem(STORAGE_KEY);
    const currentUserId = profile?.id;
    
    if (shownForUser !== currentUserId) {
      // Show banner with a small delay for better UX
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, isPremiumActive, profile?.id]);

  const handleDismiss = () => {
    setIsVisible(false);
    // Mark as shown for this user
    if (profile?.id) {
      localStorage.setItem(STORAGE_KEY, profile.id);
    }
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-fade-in">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={handleDismiss}
      />
      
      {/* Banner */}
      <div className="relative z-10 w-full max-w-md bg-gradient-to-br from-amber-500/20 via-yellow-500/10 to-orange-500/20 border border-amber-500/30 rounded-2xl p-6 shadow-2xl animate-scale-in">
        {/* Close button */}
        <button 
          onClick={handleDismiss}
          className="absolute top-3 right-3 p-1.5 rounded-full bg-background/50 hover:bg-background/80 transition-colors"
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>

        {/* Crown icon */}
        <div className="flex justify-center mb-4">
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg">
              <Crown className="w-10 h-10 text-white" />
            </div>
            <Sparkles className="absolute -top-1 -right-1 w-6 h-6 text-amber-400 animate-pulse" />
          </div>
        </div>

        {/* Title */}
        <h2 className="text-2xl font-bold text-center text-foreground mb-2">
          {isItalian ? 'Benvenuto Premium! 🎉' : 'Welcome Premium! 🎉'}
        </h2>

        {/* Subtitle */}
        <p className="text-center text-muted-foreground mb-6">
          {isItalian 
            ? 'Congratulazioni! Ora hai accesso a tutte le funzionalità esclusive.'
            : 'Congratulations! You now have access to all exclusive features.'}
        </p>

        {/* Features list */}
        <div className="space-y-3 mb-6">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-background/50">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Download className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                {isItalian ? 'Download offline' : 'Offline downloads'}
              </p>
              <p className="text-xs text-muted-foreground">
                {isItalian ? 'Scarica musica per ascoltarla senza connessione' : 'Download music to listen offline'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 p-3 rounded-lg bg-background/50">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Music className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                {isItalian ? 'Qualità audio superiore' : 'Superior audio quality'}
              </p>
              <p className="text-xs text-muted-foreground">
                {isItalian ? 'Streaming in alta qualità FLAC' : 'High quality FLAC streaming'}
              </p>
            </div>
          </div>
        </div>

        {/* CTA Button */}
        <Button 
          onClick={handleDismiss}
          className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold"
        >
          {isItalian ? 'Inizia a esplorare' : 'Start exploring'}
        </Button>
      </div>
    </div>
  );
};

export default PremiumWelcomeBanner;
