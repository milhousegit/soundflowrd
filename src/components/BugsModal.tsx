import React, { forwardRef, useState } from 'react';
import { useSettings } from '@/contexts/SettingsContext';
import { StreamResult } from '@/lib/realdebrid';
import { X, Music, Check, Search, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface BugsModalProps {
  isOpen: boolean;
  onClose: () => void;
  alternatives: StreamResult[];
  onSelect: (stream: StreamResult) => void;
  currentStreamId?: string;
  isLoading?: boolean;
  onManualSearch?: (query: string) => void;
  currentTrackInfo?: { title: string; artist: string };
}

const BugsModal = forwardRef<HTMLDivElement, BugsModalProps>(
  ({ isOpen, onClose, alternatives, onSelect, currentStreamId, isLoading, onManualSearch, currentTrackInfo }, ref) => {
    const { t } = useSettings();
    const [manualQuery, setManualQuery] = useState('');

    if (!isOpen) return null;

    const handleManualSearch = () => {
      if (manualQuery.trim() && onManualSearch) {
        onManualSearch(manualQuery.trim());
      }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleManualSearch();
      }
    };

    return (
      <div ref={ref} className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
        {/* Backdrop */}
        <div 
          className="absolute inset-0 bg-background/80 backdrop-blur-sm"
          onClick={onClose}
        />
        
        {/* Modal */}
        <div className="relative w-full max-w-lg max-h-[80vh] bg-card rounded-t-2xl md:rounded-2xl border border-border overflow-hidden animate-slide-up">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div>
              <h3 className="text-lg font-semibold text-foreground">{t('alternativeSources')}</h3>
              {currentTrackInfo && (
                <p className="text-sm text-muted-foreground">
                  {currentTrackInfo.artist} - {currentTrackInfo.title}
                </p>
              )}
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Manual Search */}
          <div className="p-4 border-b border-border">
            <div className="flex gap-2">
              <Input
                placeholder={t('language') === 'it' ? "Cerca manualmente..." : "Manual search..."}
                value={manualQuery}
                onChange={(e) => setManualQuery(e.target.value)}
                onKeyPress={handleKeyPress}
                className="flex-1"
              />
              <Button 
                onClick={handleManualSearch} 
                disabled={!manualQuery.trim() || isLoading}
                size="icon"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {t('language') === 'it' 
                ? "Prova a cercare con parole diverse se non trovi risultati" 
                : "Try different keywords if you don't find results"}
            </p>
          </div>

          {/* Content */}
          <div className="p-4 overflow-y-auto max-h-[50vh]">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
                <p className="text-muted-foreground">
                  {t('language') === 'it' ? "Cercando fonti audio..." : "Searching audio sources..."}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('language') === 'it' ? "Potrebbe richiedere alcuni secondi" : "This may take a few seconds"}
                </p>
              </div>
            ) : alternatives.length === 0 ? (
              <div className="text-center py-8">
                <Music className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">{t('noAlternatives')}</p>
                <p className="text-sm text-muted-foreground mt-2">
                  {t('language') === 'it' 
                    ? "Prova la ricerca manuale sopra" 
                    : "Try manual search above"}
                </p>
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
                        {alt.quality} {alt.size && `• ${alt.size}`}
                        {alt.source && ` • ${alt.source}`}
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
  }
);

BugsModal.displayName = 'BugsModal';

export default BugsModal;