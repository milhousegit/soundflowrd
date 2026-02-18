import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Crown, Sparkles, Target } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';

interface FundingGoalBarProps {
  language: 'en' | 'it';
  onContribute: () => void;
  isPremium?: boolean;
  inline?: boolean;
}

interface Milestone {
  amount: number;
  label_it: string;
  label_en: string;
  icon: string;
}

interface FundingGoalData {
  goal: number;
  current: number;
  label_it: string;
  label_en: string;
  milestones?: Milestone[];
}

const PlayStoreIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 0 1-.61-.92V2.734a1 1 0 0 1 .609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.199l2.302 2.302-2.302 2.302L15.396 12l2.302-2.492zM5.864 2.658L16.8 9.991l-2.302 2.302L5.864 2.658z"/>
  </svg>
);

const AppStoreIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
  </svg>
);

const MilestoneIcon = ({ icon, className }: { icon: string; className?: string }) => {
  if (icon === 'play-store') return <PlayStoreIcon className={className} />;
  if (icon === 'app-store') return <AppStoreIcon className={className} />;
  return <Target className={className} />;
};

const FundingGoalBar: React.FC<FundingGoalBarProps> = ({ language, onContribute, isPremium = false, inline = false }) => {
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
  const milestones = goalData.milestones || [];

  if (inline) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-foreground">
            {isItalian ? goalData.label_it : goalData.label_en}
          </p>
          <span className="text-[10px] text-muted-foreground">
            €{goalData.current} / €{goalData.goal} ({percentage}%)
          </span>
        </div>
        <div className="relative">
          <Progress value={percentage} className="h-2 bg-muted/50 [&>div]:bg-gradient-to-r [&>div]:from-violet-500 [&>div]:to-blue-600" />
          {milestones.map((m) => {
            const pos = (m.amount / goalData.goal) * 100;
            const reached = goalData.current >= m.amount;
            return (
              <div
                key={m.icon}
                className="absolute top-1/2 -translate-y-1/2"
                style={{ left: `${pos}%`, transform: `translateX(-50%) translateY(-50%)` }}
              >
                <div className={`w-5 h-5 rounded-full flex items-center justify-center ${reached ? 'bg-green-500' : 'bg-muted border border-border'}`}>
                  <MilestoneIcon icon={m.icon} className={`w-3 h-3 ${reached ? 'text-white' : 'text-muted-foreground'}`} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

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
        {/* Progress bar with milestone markers */}
        <div className="relative">
          <Progress value={percentage} className="h-2 bg-muted/50 [&>div]:bg-gradient-to-r [&>div]:from-violet-500 [&>div]:to-blue-600" />
          {milestones.map((m) => {
            const pos = (m.amount / goalData.goal) * 100;
            const reached = goalData.current >= m.amount;
            return (
              <div
                key={m.icon}
                className="absolute top-1/2 -translate-y-1/2"
                style={{ left: `${pos}%`, transform: `translateX(-50%) translateY(-50%)` }}
              >
                <div className={`w-5 h-5 rounded-full flex items-center justify-center ${reached ? 'bg-green-500' : 'bg-muted border border-border'}`}>
                  <MilestoneIcon icon={m.icon} className={`w-3 h-3 ${reached ? 'text-white' : 'text-muted-foreground'}`} />
                </div>
              </div>
            );
          })}
        </div>
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

            {/* Progress with milestones */}
            <div className="mb-5">
              <div className="flex justify-between text-sm mb-1.5">
                <span className="font-semibold text-foreground">€{goalData.current}</span>
                <span className="text-muted-foreground">€{goalData.goal}</span>
              </div>
              <div className="relative">
                <Progress value={percentage} className="h-3 bg-muted/50 [&>div]:bg-gradient-to-r [&>div]:from-violet-500 [&>div]:to-blue-600" />
                {milestones.map((m) => {
                  const pos = (m.amount / goalData.goal) * 100;
                  const reached = goalData.current >= m.amount;
                  return (
                    <div
                      key={m.icon}
                      className="absolute top-1/2"
                      style={{ left: `${pos}%`, transform: `translateX(-50%) translateY(-50%)` }}
                    >
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center shadow-sm ${reached ? 'bg-green-500' : 'bg-card border-2 border-border'}`}>
                        <MilestoneIcon icon={m.icon} className={`w-3.5 h-3.5 ${reached ? 'text-white' : 'text-muted-foreground'}`} />
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Milestone labels */}
              <div className="relative mt-3">
                {milestones.map((m) => {
                  const pos = (m.amount / goalData.goal) * 100;
                  const reached = goalData.current >= m.amount;
                  return (
                    <div
                      key={m.icon + '-label'}
                      className="absolute text-center"
                      style={{ left: `${pos}%`, transform: 'translateX(-50%)' }}
                    >
                      <p className={`text-[10px] font-medium whitespace-nowrap ${reached ? 'text-green-500' : 'text-muted-foreground'}`}>
                        €{m.amount}
                      </p>
                      <p className={`text-[9px] whitespace-nowrap ${reached ? 'text-green-500/70' : 'text-muted-foreground/70'}`}>
                        {isItalian ? m.label_it : m.label_en}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2 mb-5 text-xs text-muted-foreground mt-8">
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
