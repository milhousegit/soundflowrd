import React from 'react';
import { Sparkles, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDailyMixes } from '@/hooks/useDailyMixes';
import DailyMixCard from '@/components/DailyMixCard';
import { useSettings } from '@/contexts/SettingsContext';
import { Skeleton } from '@/components/ui/skeleton';

const DailyMixSection: React.FC = () => {
  const { mixes, isLoading, regenerate } = useDailyMixes();
  const { settings } = useSettings();
  const [isRegenerating, setIsRegenerating] = React.useState(false);

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    await regenerate();
    setIsRegenerating(false);
  };

  // Don't show section if no mixes and not loading
  if (!isLoading && mixes.length === 0) return null;

  return (
    <section>
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <div className="flex items-center gap-2 md:gap-3">
          <Sparkles className="w-5 h-5 md:w-6 md:h-6 text-primary" />
          <h2 className="text-lg md:text-2xl font-bold text-foreground">
            {settings.language === 'it' ? 'I tuoi Daily Mix' : 'Your Daily Mix'}
          </h2>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRegenerate}
          disabled={isRegenerating || isLoading}
          className="text-muted-foreground hover:text-foreground"
        >
          {isRegenerating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex gap-3 md:gap-6 overflow-x-auto pb-2 scrollbar-hide">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex-shrink-0 w-36 md:w-48">
              <Skeleton className="aspect-square rounded-lg mb-2" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex gap-3 md:gap-6 overflow-x-auto pb-2 scrollbar-hide">
          {mixes.map((mix) => (
            <div key={mix.id} className="flex-shrink-0 w-36 md:w-48">
              <DailyMixCard mix={mix} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

export default DailyMixSection;
