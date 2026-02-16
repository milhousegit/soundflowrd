import React from 'react';
import { createPortal } from 'react-dom';
import { X, Clock, CalendarDays, Copy, Check } from 'lucide-react';
import { useSettings } from '@/contexts/SettingsContext';
import { useAuth } from '@/contexts/AuthContext';
import { useState } from 'react';

interface KofiModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const KofiModal: React.FC<KofiModalProps> = ({ isOpen, onClose }) => {
  const { settings } = useSettings();
  const { profile } = useAuth();
  const [copied, setCopied] = useState(false);
  const isItalian = settings.language === 'it';

  if (!isOpen) return null;

  const userEmail = profile?.email || '';

  const handleCopy = async () => {
    if (userEmail) {
      await navigator.clipboard.writeText(userEmail);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 animate-fade-in">
      {/* Blurred backdrop */}
      <div 
        className="absolute inset-0 bg-background/60 backdrop-blur-md"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative z-10 w-full max-w-md max-h-[95dvh] overflow-y-auto scrollbar-hide">
        {/* Close button */}
        <button 
          onClick={onClose}
          className="absolute top-1 right-1 z-20 p-2 rounded-full bg-card border border-border shadow-lg hover:bg-muted transition-colors"
        >
          <X className="w-4 h-4 text-foreground" />
        </button>

        {/* Email hint */}
        {userEmail && (
          <div className="mb-3 p-3 rounded-xl bg-card/90 backdrop-blur-sm border border-border">
            <p className="text-xs text-muted-foreground mb-1.5">
              {isItalian 
                ? '⚠️ Inserisci questa email nel campo "Email" per attivare Premium automaticamente:'
                : '⚠️ Enter this email in the "Email" field to activate Premium automatically:'}
            </p>
            <button
              onClick={handleCopy}
              className="w-full flex items-center justify-between gap-2 p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
            >
              <span className="text-sm font-mono text-foreground truncate">{userEmail}</span>
              {copied ? (
                <Check className="w-4 h-4 text-green-500 shrink-0" />
              ) : (
                <Copy className="w-4 h-4 text-muted-foreground shrink-0" />
              )}
            </button>
          </div>
        )}

        {/* Duration info */}
        <div className="mb-3 grid grid-cols-2 gap-2">
          <div className="p-2.5 rounded-xl bg-card/90 backdrop-blur-sm border border-border text-center">
            <CalendarDays className="w-4 h-4 text-primary mx-auto mb-1" />
            <p className="text-xs font-semibold text-foreground">One-Time</p>
            <p className="text-[10px] text-muted-foreground">
              {isItalian ? 'Premium per 1 anno' : 'Premium for 1 year'}
            </p>
          </div>
          <div className="p-2.5 rounded-xl bg-card/90 backdrop-blur-sm border border-border text-center">
            <Clock className="w-4 h-4 text-primary mx-auto mb-1" />
            <p className="text-xs font-semibold text-foreground">Monthly</p>
            <p className="text-[10px] text-muted-foreground">
              {isItalian ? 'Si rinnova ogni mese' : 'Renews every month'}
            </p>
          </div>
        </div>

        {/* Ko-fi iframe */}
        <div className="rounded-2xl overflow-hidden">
          <iframe
            id="kofiframe"
            src="https://ko-fi.com/milhousedhl/?hidefeed=true&widget=true&embed=true&preview=true"
            className="w-full border-none"
            style={{ background: 'transparent', padding: '4px' }}
            height="712"
            title="milhousedhl"
          />
        </div>
      </div>
    </div>,
    document.body
  );
};

export default KofiModal;
