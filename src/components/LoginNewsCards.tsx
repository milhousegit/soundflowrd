import React, { useState } from 'react';
import { Music2, Github, Apple, ChevronRight, X, Download, Smartphone, Shield, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface NewsCard {
  id: string;
  icon: React.ReactNode;
  gradient: string;
  titleEn: string;
  titleIt: string;
  subtitleEn: string;
  subtitleIt: string;
}

const newsCards: NewsCard[] = [
{
  id: 'what-is-soundflow',
  icon: <Music2 className="w-6 h-6" />,
  gradient: 'from-primary/30 to-accent/30',
  titleEn: 'What is SoundFlow?',
  titleIt: 'Cos\'è SoundFlow?',
  subtitleEn: 'Discover how it works',
  subtitleIt: 'Scopri come funziona'
},
{
  id: 'github',
  icon: <Github className="w-6 h-6" />,
  gradient: 'from-[#333]/40 to-[#555]/30',
  titleEn: 'GitHub Repository',
  titleIt: 'Repository GitHub',
  subtitleEn: 'Open source project',
  subtitleIt: 'Progetto open source'
},
{
  id: 'ios-sideload',
  icon: <Apple className="w-6 h-6" />,
  gradient: 'from-[#007AFF]/30 to-[#5856D6]/30',
  titleEn: 'iOS App',
  titleIt: 'App iOS',
  subtitleEn: 'Download & Sideload',
  subtitleIt: 'Scarica e installa'
}];


// --- Modal content components ---

const WhatIsSoundFlowContent: React.FC<{lang: 'en' | 'it';}> = ({ lang }) =>
<div className="space-y-4 text-sm text-muted-foreground">
    {lang === 'it' ?
  <>
        <p className="text-foreground font-medium text-base">
          SoundFlow è il tuo player musicale personale, gratuito e senza pubblicità.
        </p>
        <div className="space-y-3">
          <div className="flex gap-3 items-start">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Music2 className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="font-medium text-foreground">Streaming illimitato</p>
              <p>Cerca e ascolta qualsiasi brano, album o artista. Qualità fino a FLAC/320kbps.</p>
            </div>
          </div>
          <div className="flex gap-3 items-start">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Shield className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="font-medium text-foreground">Account personale</p>
              <p>Registrati per salvare playlist, preferiti e sincronizzare i tuoi ascolti su tutti i dispositivi.</p>
            </div>
          </div>
          <div className="flex gap-3 items-start">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Smartphone className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="font-medium text-foreground">Installa come app</p>
              <p>Su Android puoi installare SoundFlow direttamente dal browser. Su iOS scarica il file IPA dalla sezione dedicata.</p>
            </div>
          </div>
        </div>
        


      </> :

  <>
        <p className="text-foreground font-medium text-base">
          SoundFlow is your personal music player, free and ad-free.
        </p>
        <div className="space-y-3">
          <div className="flex gap-3 items-start">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Music2 className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="font-medium text-foreground">Unlimited streaming</p>
              <p>Search and play any track, album, or artist. Quality up to FLAC/320kbps.</p>
            </div>
          </div>
          <div className="flex gap-3 items-start">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Shield className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="font-medium text-foreground">Personal account</p>
              <p>Sign up to save playlists, favorites, and sync your listening across all devices.</p>
            </div>
          </div>
          <div className="flex gap-3 items-start">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Smartphone className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="font-medium text-foreground">Install as an app</p>
              <p>On Android, install SoundFlow directly from the browser. On iOS, download the IPA file from the dedicated section.</p>
            </div>
          </div>
        </div>
        <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
          <p className="text-xs">💡 <strong>How to start:</strong> Sign up with your email, confirm the verification link, and start listening!</p>
        </div>
      </>
  }
  </div>;


const GitHubContent: React.FC<{lang: 'en' | 'it';}> = ({ lang }) =>
<div className="space-y-4 text-sm text-muted-foreground">
    {lang === 'it' ?
  <>
        <p className="text-foreground font-medium text-base">
          SoundFlow è un progetto open source disponibile su GitHub.
        </p>
        <p>Puoi esplorare il codice sorgente, segnalare bug, proporre nuove funzionalità o contribuire direttamente al progetto.</p>
        <a
      href="https://github.com/milhousegit/soundflowrd"
      target="_blank"
      rel="noopener noreferrer">

          <Button className="w-full gap-2 mt-2">
            <Github className="w-5 h-5" />
            Apri su GitHub
            <ExternalLink className="w-4 h-4" />
          </Button>
        </a>
      </> :

  <>
        <p className="text-foreground font-medium text-base">
          SoundFlow is an open source project available on GitHub.
        </p>
        <p>Explore the source code, report bugs, suggest features, or contribute directly to the project.</p>
        <a
      href="https://github.com/milhousegit/soundflowrd"
      target="_blank"
      rel="noopener noreferrer">

          <Button className="w-full gap-2 mt-2">
            <Github className="w-5 h-5" />
            Open on GitHub
            <ExternalLink className="w-4 h-4" />
          </Button>
        </a>
      </>
  }
  </div>;


const IOSSideloadContent: React.FC<{lang: 'en' | 'it';}> = ({ lang }) =>
<div className="space-y-4 text-sm text-muted-foreground">
    {lang === 'it' ?
  <>
        <p className="text-foreground font-medium text-base">
          Installa SoundFlow sul tuo iPhone/iPad tramite sideload.
        </p>
        
        <a href="/downloads/SoundFlow.ipa" download="SoundFlow.ipa">
          <Button className="w-full gap-2" variant="default">
            <Download className="w-5 h-5" />
            Scarica file IPA
          </Button>
        </a>

        <div className="space-y-3 pt-2">
          <p className="font-medium text-foreground">Istruzioni per il sideload:</p>
          
          <div className="space-y-2">
            <div className="flex gap-3 items-start">
              <span className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 text-xs font-bold text-primary">1</span>
              <p>Scarica e installa <a href="https://altstore.io" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">AltStore</a> o <a href="https://sideloadly.io" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">Sideloadly</a> sul tuo computer.</p>
            </div>
            <div className="flex gap-3 items-start">
              <span className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 text-xs font-bold text-primary">2</span>
              <p>Collega il tuo iPhone/iPad al computer tramite cavo USB.</p>
            </div>
            <div className="flex gap-3 items-start">
              <span className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 text-xs font-bold text-primary">3</span>
              <p>Apri AltStore/Sideloadly e seleziona il file <strong>SoundFlow.ipa</strong> scaricato.</p>
            </div>
            <div className="flex gap-3 items-start">
              <span className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 text-xs font-bold text-primary">4</span>
              <p>Inserisci il tuo Apple ID quando richiesto e attendi l'installazione.</p>
            </div>
            <div className="flex gap-3 items-start">
              <span className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 text-xs font-bold text-primary">5</span>
              <p>Sul tuo dispositivo vai in <strong>Impostazioni → Generali → Gestione dispositivo</strong> e autorizza il profilo sviluppatore.</p>
            </div>
          </div>
        </div>

        <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/30">
          <p className="text-xs text-orange-400">⚠️ Le app sideloaded scadono dopo 7 giorni con un Apple ID gratuito. Usa AltStore per rinnovarle automaticamente.</p>
        </div>
      </> :

  <>
        <p className="text-foreground font-medium text-base">
          Install SoundFlow on your iPhone/iPad via sideloading.
        </p>
        
        <a href="/downloads/SoundFlow.ipa" download="SoundFlow.ipa">
          <Button className="w-full gap-2" variant="default">
            <Download className="w-5 h-5" />
            Download IPA file
          </Button>
        </a>

        <div className="space-y-3 pt-2">
          <p className="font-medium text-foreground">Sideload instructions:</p>
          
          <div className="space-y-2">
            <div className="flex gap-3 items-start">
              <span className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 text-xs font-bold text-primary">1</span>
              <p>Download and install <a href="https://altstore.io" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">AltStore</a> or <a href="https://sideloadly.io" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">Sideloadly</a> on your computer.</p>
            </div>
            <div className="flex gap-3 items-start">
              <span className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 text-xs font-bold text-primary">2</span>
              <p>Connect your iPhone/iPad to your computer via USB cable.</p>
            </div>
            <div className="flex gap-3 items-start">
              <span className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 text-xs font-bold text-primary">3</span>
              <p>Open AltStore/Sideloadly and select the downloaded <strong>SoundFlow.ipa</strong> file.</p>
            </div>
            <div className="flex gap-3 items-start">
              <span className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 text-xs font-bold text-primary">4</span>
              <p>Enter your Apple ID when prompted and wait for installation.</p>
            </div>
            <div className="flex gap-3 items-start">
              <span className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 text-xs font-bold text-primary">5</span>
              <p>On your device go to <strong>Settings → General → Device Management</strong> and trust the developer profile.</p>
            </div>
          </div>
        </div>

        <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/30">
          <p className="text-xs text-orange-400">⚠️ Sideloaded apps expire after 7 days with a free Apple ID. Use AltStore to auto-refresh them.</p>
        </div>
      </>
  }
  </div>;


interface LoginNewsCardsProps {
  language: 'en' | 'it';
}

const LoginNewsCards: React.FC<LoginNewsCardsProps> = ({ language }) => {
  const [openCard, setOpenCard] = useState<string | null>(null);

  const renderModalContent = () => {
    switch (openCard) {
      case 'what-is-soundflow':
        return <WhatIsSoundFlowContent lang={language} />;
      case 'github':
        return <GitHubContent lang={language} />;
      case 'ios-sideload':
        return <IOSSideloadContent lang={language} />;
      default:
        return null;
    }
  };

  const getModalTitle = () => {
    const card = newsCards.find((c) => c.id === openCard);
    if (!card) return '';
    return language === 'it' ? card.titleIt : card.titleEn;
  };

  return (
    <>
      {/* Paginated news cards */}
      <div className="w-full mt-6">
        <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wider">
          {language === 'it' ? 'Novità' : 'News'}
        </p>
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory">
          {newsCards.map((card) =>
          <button
            key={card.id}
            onClick={() => setOpenCard(card.id)}
            className={`flex-shrink-0 w-[calc(50%-6px)] snap-center rounded-xl px-3 py-2.5 bg-gradient-to-br ${card.gradient} border border-border/50 text-left transition-transform active:scale-95 hover:border-primary/40 flex items-center gap-2.5`}>
              <div className="w-8 h-8 rounded-lg bg-background/50 flex items-center justify-center flex-shrink-0 text-foreground [&>svg]:w-4 [&>svg]:h-4">
                {card.icon}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground leading-tight truncate">
                  {language === 'it' ? card.titleIt : card.titleEn}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-0.5 truncate">
                  {language === 'it' ? card.subtitleIt : card.subtitleEn}
                  <ChevronRight className="w-2.5 h-2.5 flex-shrink-0" />
                </p>
              </div>
            </button>
          )}
        </div>
        {/* Page dots */}
        <div className="flex justify-center gap-1.5 mt-2">
          {newsCards.map((card, i) =>
          <div key={card.id} className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
          )}
        </div>
      </div>

      {/* Modal overlay */}
      {openCard &&
      <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={() => setOpenCard(null)} />

          <div className="relative z-10 w-full sm:max-w-md bg-card border border-border rounded-t-2xl sm:rounded-2xl p-6 max-h-[80vh] overflow-y-auto animate-scale-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-foreground">{getModalTitle()}</h3>
              <button
              onClick={() => setOpenCard(null)}
              className="w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80">

                <X className="w-4 h-4" />
              </button>
            </div>
            {renderModalContent()}
          </div>
        </div>
      }
    </>);

};

export default LoginNewsCards;