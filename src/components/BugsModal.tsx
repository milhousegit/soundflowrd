import React from 'react';
import { useSettings } from '@/contexts/SettingsContext';
import { StreamResult } from '@/lib/realdebrid';
import { X, Music, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BugsModalProps {
  isOpen: boolean;
  onClose: () => void;
  alternatives: StreamResult[];
  onSelect: (stream: StreamResult) => void;
  currentStreamId?: string;
}

const BugsModal: React.FC<BugsModalProps> = ({
  isOpen,
  onClose,
  alternatives,
  onSelect,
  currentStreamId,
}) => {
  const { t } = useSettings();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-lg max-h-[70vh] bg-card rounded-t-2xl md:rounded-2xl border border-border overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="text-lg font-semibold text-foreground">{t('alternativeSources')}</h3>
          <Button variant="ghost" size="iconSm" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[50vh]">
          {alternatives.length === 0 ? (
            <div className="text-center py-8">
              <Music className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">{t('noAlternatives')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {alternatives.map((alt) => (
                <button
                  key={alt.id}
                  onClick={() => onSelect(alt)}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left",
                    currentStreamId === alt.id 
                      ? "bg-primary/20 border border-primary/50" 
                      : "bg-secondary hover:bg-secondary/80"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{alt.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {alt.quality} {alt.size && `• ${(alt.size / 1024 / 1024).toFixed(1)} MB`}
                    </p>
                  </div>
                  {currentStreamId === alt.id && (
                    <Check className="w-5 h-5 text-primary flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Helper for cn
function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

export default BugsModal;
