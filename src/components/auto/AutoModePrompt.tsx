import React from 'react';
import { Car, Smartphone, X, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAutoMode } from './AutoModeContext';
import { useAuth } from '@/contexts/AuthContext';
import { isPast } from 'date-fns';

const AutoModePrompt: React.FC = () => {
  const { 
    showAutoModePrompt, 
    setShowAutoModePrompt, 
    setAutoMode, 
    pendingOrientation,
    setPendingOrientation 
  } = useAutoMode();
  const { profile, isAdmin, simulateFreeUser } = useAuth();

  // Check if user has active premium (respect simulation mode)
  const isPremium = !simulateFreeUser && (isAdmin || (profile?.is_premium && 
    (!profile?.premium_expires_at || !isPast(new Date(profile.premium_expires_at)))));

  if (!showAutoModePrompt || !pendingOrientation) return null;

  const isEnteringAuto = pendingOrientation === 'landscape';

  const handleConfirm = () => {
    if (isEnteringAuto) {
      setAutoMode(true);
    } else {
      setAutoMode(false);
    }
    setShowAutoModePrompt(false);
    setPendingOrientation(null);
  };

  const handleCancel = () => {
    setShowAutoModePrompt(false);
    setPendingOrientation(null);
  };

  const handleUnlockPremium = () => {
    setShowAutoModePrompt(false);
    setPendingOrientation(null);
    window.location.href = '/profile';
  };

  return (
    <div className="fixed inset-0 z-[200] bg-background/95 backdrop-blur-sm flex flex-col items-center justify-center p-4">
      <div className="text-center space-y-4 max-w-xs w-full">
        <div className="relative w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto">
          {isEnteringAuto ? (
            <Car className="w-8 h-8 text-primary" />
          ) : (
            <Smartphone className="w-8 h-8 text-primary" />
          )}
          {isEnteringAuto && !isPremium && (
            <span className="absolute -top-1 -right-1 px-1.5 py-0.5 text-[10px] font-bold bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] text-white rounded">
              PRO
            </span>
          )}
        </div>
        
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-foreground">
            {isEnteringAuto ? 'Modalità Auto' : 'Modalità Standard'}
          </h2>
          {(isPremium || !isEnteringAuto) && (
            <p className="text-sm text-muted-foreground">
              {isEnteringAuto 
                ? 'Interfaccia ottimizzata per la guida' 
                : 'Vuoi tornare alla modalità standard?'}
            </p>
          )}
        </div>

        {/* Simplified Premium banner for non-premium users */}
        {isEnteringAuto && !isPremium && (
          <div className="p-3 rounded-lg bg-gradient-to-r from-[#8B5CF6]/20 to-[#3B82F6]/20 border border-[#8B5CF6]/30">
            <p className="text-sm text-muted-foreground mb-2">
              Funzione riservata agli utenti Premium
            </p>
            <Button 
              onClick={handleUnlockPremium}
              size="sm"
              className="w-full bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] hover:opacity-90 border-0"
            >
              <Crown className="w-4 h-4 mr-2" />
              Sblocca Premium
            </Button>
          </div>
        )}

        <div className="flex gap-2 justify-center">
          <Button variant="outline" size="sm" onClick={handleCancel} className="min-w-[80px]">
            <X className="w-4 h-4 mr-1" />
            {isEnteringAuto && !isPremium ? 'Chiudi' : 'Annulla'}
          </Button>
          {(isPremium || !isEnteringAuto) && (
            <Button size="sm" onClick={handleConfirm} className="min-w-[80px]">
              {isEnteringAuto ? (
                <>
                  <Car className="w-4 h-4 mr-1" />
                  Entra
                </>
              ) : (
                <>
                  <Smartphone className="w-4 h-4 mr-1" />
                  Esci
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AutoModePrompt;
