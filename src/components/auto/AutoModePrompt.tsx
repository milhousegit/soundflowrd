import React from 'react';
import { Car, Smartphone, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAutoMode } from './AutoModeContext';

const AutoModePrompt: React.FC = () => {
  const { 
    showAutoModePrompt, 
    setShowAutoModePrompt, 
    setAutoMode, 
    pendingOrientation,
    setPendingOrientation 
  } = useAutoMode();

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

  return (
    <div className="fixed inset-0 z-[200] bg-background/95 backdrop-blur-sm flex flex-col items-center justify-center p-8">
      <div className="text-center space-y-6 max-w-sm">
        <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center mx-auto">
          {isEnteringAuto ? (
            <Car className="w-12 h-12 text-primary" />
          ) : (
            <Smartphone className="w-12 h-12 text-primary" />
          )}
        </div>
        
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-foreground">
            {isEnteringAuto ? 'Modalità Auto' : 'Modalità Standard'}
          </h2>
          <p className="text-muted-foreground">
            {isEnteringAuto 
              ? 'Vuoi entrare in modalità Auto con un\'interfaccia ottimizzata per la guida?' 
              : 'Vuoi tornare alla modalità standard?'}
          </p>
        </div>

        <div className="flex gap-3 justify-center">
          <Button variant="outline" onClick={handleCancel} className="min-w-[100px]">
            <X className="w-4 h-4 mr-2" />
            Annulla
          </Button>
          <Button onClick={handleConfirm} className="min-w-[100px]">
            {isEnteringAuto ? (
              <>
                <Car className="w-4 h-4 mr-2" />
                Entra
              </>
            ) : (
              <>
                <Smartphone className="w-4 h-4 mr-2" />
                Esci
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AutoModePrompt;
