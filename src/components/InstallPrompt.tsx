import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { X, Download, Share } from 'lucide-react';
import { useSettings } from '@/contexts/SettingsContext';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const InstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const { t } = useSettings();

  useEffect(() => {
    // Check if already installed
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    if (isStandalone) return;

    // Check if dismissed recently
    const dismissed = localStorage.getItem('installPromptDismissed');
    if (dismissed) {
      const dismissedTime = parseInt(dismissed, 10);
      // Show again after 7 days
      if (Date.now() - dismissedTime < 7 * 24 * 60 * 60 * 1000) return;
    }

    // Detect iOS
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(isIOSDevice);

    // Show iOS prompt after delay
    if (isIOSDevice) {
      const timer = setTimeout(() => setShowPrompt(true), 3000);
      return () => clearTimeout(timer);
    }

    // Android/Desktop PWA prompt
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setTimeout(() => setShowPrompt(true), 3000);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowPrompt(false);
      }
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('installPromptDismissed', Date.now().toString());
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed top-4 left-4 right-4 z-[100] animate-slide-up md:left-auto md:right-4 md:max-w-sm">
      <div className="glass rounded-xl p-4 shadow-lg border border-border">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
            <Download className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground">
              {t('language') === 'it' ? 'Installa SoundFlow' : 'Install SoundFlow'}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {isIOS ? (
                t('language') === 'it' 
                  ? 'Tocca il pulsante Condividi, poi "Aggiungi a Home"'
                  : 'Tap the Share button, then "Add to Home Screen"'
              ) : (
                t('language') === 'it'
                  ? 'Aggiungi l\'app alla schermata home'
                  : 'Add the app to your home screen'
              )}
            </p>
            {!isIOS && deferredPrompt && (
              <Button 
                onClick={handleInstall} 
                size="sm" 
                className="mt-3"
              >
                {t('language') === 'it' ? 'Installa' : 'Install'}
              </Button>
            )}
            {isIOS && (
              <div className="flex items-center gap-2 mt-3 text-sm text-primary">
                <Share className="w-4 h-4" />
                <span>{t('language') === 'it' ? 'Condividi → Aggiungi a Home' : 'Share → Add to Home Screen'}</span>
              </div>
            )}
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            className="flex-shrink-0 -mt-1 -mr-1"
            onClick={handleDismiss}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default InstallPrompt;
