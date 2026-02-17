import React, { useState } from 'react';
import { Tv, Wifi } from 'lucide-react';
import { useTVConnection } from '@/contexts/TVConnectionContext';
import { useSettings } from '@/contexts/SettingsContext';
import { Button } from '@/components/ui/button';

const TVBanner: React.FC = () => {
  const { isConnected, roomCode, disconnect } = useTVConnection();
  const { settings } = useSettings();
  const isItalian = settings.language === 'it';
  const [showConfirm, setShowConfirm] = useState(false);

  if (!isConnected) return null;

  return (
    <>
      <div
        className="bg-primary text-primary-foreground px-4 py-2.5 flex items-center justify-between cursor-pointer active:opacity-80 transition-opacity z-50"
        onClick={() => setShowConfirm(true)}
      >
        <div className="flex items-center gap-2">
          <Tv className="w-4 h-4" />
          <span className="text-sm font-medium">
            {isItalian ? 'In riproduzione su TV' : 'Playing on TV'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Wifi className="w-3.5 h-3.5" />
          <span className="text-xs font-mono opacity-80">{roomCode}</span>
        </div>
      </div>

      {showConfirm && (
        <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-lg">
            <div className="flex items-center gap-3">
              <Tv className="w-6 h-6 text-primary" />
              <h3 className="text-lg font-semibold">
                {isItalian ? 'Disconnetti dalla TV?' : 'Disconnect from TV?'}
              </h3>
            </div>
            <p className="text-sm text-muted-foreground">
              {isItalian
                ? "L'audio tornerà a essere riprodotto dal telefono."
                : 'Audio will play from your phone again.'}
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setShowConfirm(false)}>
                {isItalian ? 'Annulla' : 'Cancel'}
              </Button>
              <Button variant="destructive" className="flex-1" onClick={() => { disconnect(); setShowConfirm(false); }}>
                {isItalian ? 'Disconnetti' : 'Disconnect'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default TVBanner;
