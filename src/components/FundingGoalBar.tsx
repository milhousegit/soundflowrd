import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Crown, Sparkles, Target } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import KofiModal from '@/components/KofiModal';

interface FundingGoalBarProps {
  language: 'en' | 'it';
  onContribute: () => void;
  isPremium?: boolean;
}

interface FundingGoalData {
  goal: number;
  current: number;
  label_it: string;
  label_en: string;
}

const FundingGoalBar: React.FC<FundingGoalBarProps> = ({ language, onContribute, isPremium = false }) => {
  const [goalData, setGoalData] = useState<FundingGoalData | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const isItalian = language === 'it';

  useEffect(() => {
    const fetchGoal = async () => {
      const { data } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'funding_goal')
        .maybeSingle();
      if (data?.value) {
        setGoalData(data.value as unknown as FundingGoalData);
      }
    };
    fetchGoal();
  }, []);

  if (!goalData) return null;

  const percentage = Math.min(Math.round((goalData.current / goalData.goal) * 100), 100);

  return (
    <>
      <button
        onClick={() => setShowDetails(true)}
        className="w-full p-3 rounded-lg bg-gradient-to-r from-violet-500/15 via-indigo-500/10 to-blue-500/15 border border-violet-500/25 hover:border-violet-500/40 transition-all"
      >
        <div className="flex items-center gap-3 mb-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-r from-violet-500 to-blue-600 flex items-center justify-center shrink-0">
            <Target className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-xs font-semibold text-foreground">
              {isItalian ? goalData.label_it : goalData.label_en}
            </p>
            <p className="text-[10px] text-muted-foreground">
              €{goalData.current} / €{goalData.goal}
            </p>
          </div>
          <span className="text-xs font-bold bg-gradient-to-r from-violet-500 to-blue-600 bg-clip-text text-transparent">
            {percentage}%
          </span>
        </div>
        <Progress value={percentage} className="h-2 bg-muted/50 [&>div]:bg-gradient-to-r [&>div]:from-violet-500 [&>div]:to-blue-600" />
      </button>

      {/* Detail modal */}
      {showDetails && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-fade-in">
          <div 
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => setShowDetails(false)}
          />
          <div className="relative z-10 w-full max-w-sm bg-card border border-border rounded-2xl p-6 shadow-2xl animate-scale-in">
            <button 
              onClick={() => setShowDetails(false)}
              className="absolute top-3 right-3 p-1.5 rounded-full bg-background/50 hover:bg-background/80 transition-colors"
            >
              <span className="text-muted-foreground text-lg leading-none">×</span>
            </button>

            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center shadow-lg">
                <Target className="w-8 h-8 text-white" />
              </div>
            </div>

            <h2 className="text-xl font-bold text-center text-foreground mb-1">
              {isItalian ? goalData.label_it : goalData.label_en}
            </h2>
            <p className="text-center text-muted-foreground text-sm mb-4">
              {isItalian 
                ? 'Aiutaci a raggiungere l\'obiettivo per pubblicare SoundFlow sugli store!' 
                : 'Help us reach the goal to publish SoundFlow on the stores!'}
            </p>

            <div className="mb-4">
              <div className="flex justify-between text-sm mb-1.5">
                <span className="font-semibold text-foreground">€{goalData.current}</span>
                <span className="text-muted-foreground">€{goalData.goal}</span>
              </div>
              <Progress value={percentage} className="h-3 bg-muted/50 [&>div]:bg-gradient-to-r [&>div]:from-violet-500 [&>div]:to-blue-600" />
              <p className="text-center text-xs text-muted-foreground mt-1.5">{percentage}% {isItalian ? 'raggiunto' : 'reached'}</p>
            </div>

            <div className="space-y-2 mb-5 text-xs text-muted-foreground">
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/30">
                <Crown className="w-4 h-4 text-violet-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-foreground">{isItalian ? 'Donazione singola' : 'One-time donation'}</p>
                  <p>{isItalian ? 'Ricevi +1 anno di Premium' : 'Get +1 year of Premium'}</p>
                </div>
              </div>
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/30">
                <Sparkles className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-foreground">{isItalian ? 'Abbonamento mensile (€1)' : 'Monthly subscription (€1)'}</p>
                  <p>{isItalian ? 'Ricevi +1 mese di Premium' : 'Get +1 month of Premium'}</p>
                </div>
              </div>
            </div>

            <Button 
              onClick={() => {
                setShowDetails(false);
                onContribute();
              }}
              className="w-full h-11 font-semibold bg-gradient-to-r from-violet-500 to-blue-600 hover:opacity-90 border-0 text-white"
            >
              <Crown className="w-4 h-4 mr-2" />
              {isItalian ? 'Contribuisci su Ko-fi' : 'Contribute on Ko-fi'}
            </Button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default FundingGoalBar;
