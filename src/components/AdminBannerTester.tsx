import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronDown, Eye, Crown, AlertTriangle, Sparkles, Download, Car, Music, Mic2, Zap, X, BadgeCheck, MessageCircle, FileText } from 'lucide-react';
import { useSettings } from '@/contexts/SettingsContext';
import { useRateLimiter } from '@/hooks/useRateLimiter';
import PremiumExpiredBanner from './PremiumExpiredBanner';
import KofiModal from './KofiModal';

interface AdminBannerTesterProps {
  language: 'it' | 'en';
}

const AdminBannerTester: React.FC<AdminBannerTesterProps> = ({ language }) => {
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [showWelcomeBanner, setShowWelcomeBanner] = useState(false);
  const [showExpiredBanner, setShowExpiredBanner] = useState(false);
  
  
  const { 
    simulateCommentBlock, 
    simulatePostBlock, 
    removeCommentBlock, 
    removePostBlock,
    isCommentsBlocked,
    isPostsBlocked 
  } = useRateLimiter();

  const isItalian = language === 'it';
  
  const commentsBlockStatus = isCommentsBlocked();
  const postsBlockStatus = isPostsBlocked();

  return (
    <>
      <details className="group">
        <summary className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors">
          <div className="flex items-center gap-2">
            <Eye className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-sm text-foreground">
              {isItalian ? 'TEST Banner' : 'TEST Banners'}
            </span>
          </div>
          <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="px-4 pb-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            {isItalian 
              ? 'Visualizza i banner come li vedrebbero gli utenti.' 
              : 'Preview banners as users would see them.'}
          </p>
          
          <div className="space-y-2">
            {/* Unlock Premium Modal Test */}
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start gap-2 h-10"
              onClick={() => setShowUnlockModal(true)}
            >
              <div className="w-6 h-6 rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] flex items-center justify-center">
                <Crown className="w-3 h-3 text-white" />
              </div>
              <div className="text-left flex-1">
                <p className="text-sm font-medium">
                  {isItalian ? 'Modal Sblocca Premium' : 'Unlock Premium Modal'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {isItalian ? 'Mostrato per acquistare Premium' : 'Shown to purchase Premium'}
                </p>
              </div>
              <Crown className="w-4 h-4 text-[#8B5CF6]" />
            </Button>

            {/* Welcome Banner Test */}
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start gap-2 h-10"
              onClick={() => setShowWelcomeBanner(true)}
            >
              <div className="w-6 h-6 rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] flex items-center justify-center">
                <Sparkles className="w-3 h-3 text-white" />
              </div>
              <div className="text-left flex-1">
                <p className="text-sm font-medium">
                  {isItalian ? 'Banner Benvenuto Premium' : 'Premium Welcome Banner'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {isItalian ? 'Mostrato quando attivi Premium' : 'Shown when Premium is activated'}
                </p>
              </div>
              <Sparkles className="w-4 h-4 text-[#8B5CF6]" />
            </Button>

            {/* Expired Banner Test */}
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start gap-2 h-10"
              onClick={() => setShowExpiredBanner(true)}
            >
              <div className="w-6 h-6 rounded-full bg-gradient-to-r from-red-500 to-rose-600 flex items-center justify-center">
                <AlertTriangle className="w-3 h-3 text-white" />
              </div>
              <div className="text-left flex-1">
                <p className="text-sm font-medium">
                  {isItalian ? 'Banner Premium Scaduto' : 'Premium Expired Banner'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {isItalian ? 'Mostrato quando scade Premium' : 'Shown when Premium expires'}
                </p>
              </div>
              <AlertTriangle className="w-4 h-4 text-red-500" />
            </Button>


            {/* Rate Limiting Tests */}
            <div className="border-t border-border pt-3 mt-3">
              <p className="text-xs text-muted-foreground mb-2 font-medium">
                {isItalian ? 'Test Rate Limiting' : 'Rate Limiting Tests'}
              </p>
              
              {/* Comment Block Test */}
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2 h-10 mb-2"
                onClick={() => commentsBlockStatus.blocked ? removeCommentBlock() : simulateCommentBlock()}
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                  commentsBlockStatus.blocked 
                    ? 'bg-gradient-to-r from-red-500 to-rose-600' 
                    : 'bg-gradient-to-r from-blue-500 to-cyan-600'
                }`}>
                  <MessageCircle className="w-3 h-3 text-white" />
                </div>
                <div className="text-left flex-1">
                  <p className="text-sm font-medium">
                    {commentsBlockStatus.blocked 
                      ? (isItalian ? 'Rimuovi Blocco Commenti' : 'Remove Comment Block')
                      : (isItalian ? 'Simula Blocco Commenti' : 'Simulate Comment Block')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {commentsBlockStatus.blocked 
                      ? (isItalian ? 'Attualmente bloccato' : 'Currently blocked')
                      : (isItalian ? 'Blocca per 15 minuti' : 'Block for 15 minutes')}
                  </p>
                </div>
                <MessageCircle className={`w-4 h-4 ${commentsBlockStatus.blocked ? 'text-red-500' : 'text-blue-500'}`} />
              </Button>

              {/* Post Block Test */}
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2 h-10"
                onClick={() => postsBlockStatus.blocked ? removePostBlock() : simulatePostBlock()}
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                  postsBlockStatus.blocked 
                    ? 'bg-gradient-to-r from-red-500 to-rose-600' 
                    : 'bg-gradient-to-r from-purple-500 to-pink-600'
                }`}>
                  <FileText className="w-3 h-3 text-white" />
                </div>
                <div className="text-left flex-1">
                  <p className="text-sm font-medium">
                    {postsBlockStatus.blocked 
                      ? (isItalian ? 'Rimuovi Blocco Post' : 'Remove Post Block')
                      : (isItalian ? 'Simula Blocco Post' : 'Simulate Post Block')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {postsBlockStatus.blocked 
                      ? (isItalian ? 'Attualmente bloccato' : 'Currently blocked')
                      : (isItalian ? 'Blocca per 48 ore' : 'Block for 48 hours')}
                  </p>
                </div>
                <FileText className={`w-4 h-4 ${postsBlockStatus.blocked ? 'text-red-500' : 'text-purple-500'}`} />
              </Button>
            </div>
          </div>
        </div>
      </details>

      {/* Test modals and banners */}
      {showUnlockModal && (
        <TestUnlockPremiumModal 
          onClose={() => setShowUnlockModal(false)} 
        />
      )}
      {showWelcomeBanner && (
        <TestWelcomeBanner onClose={() => setShowWelcomeBanner(false)} />
      )}
      {showExpiredBanner && (
        <PremiumExpiredBanner forceShow onClose={() => setShowExpiredBanner(false)} />
      )}
    </>
  );
};

// Test Unlock Premium Modal
const TestUnlockPremiumModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { settings } = useSettings();
  const isItalian = settings.language === 'it';

  const premiumFeatures = [
    { icon: Download, label: isItalian ? 'Download Offline' : 'Offline Downloads', desc: isItalian ? 'Scarica brani in locale' : 'Download tracks locally' },
    { icon: Car, label: isItalian ? 'Modalità Auto' : 'Auto Mode', desc: isItalian ? 'UI ottimizzata per guida' : 'Driving-optimized UI' },
    { icon: Crown, label: isItalian ? 'Riproduzione Ibrida' : 'Hybrid Playback', desc: isItalian ? 'Mai interrompere la musica' : 'Never interrupt music' },
    { icon: Mic2, label: isItalian ? 'Testi Sincronizzati' : 'Synced Lyrics', desc: isItalian ? 'Karaoke automatico' : 'Automatic karaoke' },
    { icon: BadgeCheck, label: isItalian ? 'Profilo Verificato' : 'Verified Profile', desc: isItalian ? 'Coroncina esclusiva' : 'Exclusive crown badge' },
    { icon: Sparkles, label: isItalian ? 'Accesso Anticipato' : 'Early Access', desc: isItalian ? 'Novità in anteprima' : 'New features first' },
  ];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-fade-in">
      <div 
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <div className="relative z-10 w-full max-w-sm bg-card border border-border rounded-2xl p-6 shadow-2xl animate-scale-in">
        <button 
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-full bg-background/50 hover:bg-background/80 transition-colors"
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>

        <div className="flex items-center gap-2 mb-4">
          <Crown className="w-5 h-5 text-[#8B5CF6]" />
          <span className="text-lg font-bold bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] bg-clip-text text-transparent">Premium</span>
        </div>

        <div className="space-y-3 py-2">
          {premiumFeatures.map(({ icon: Icon, label, desc }) => (
            <div key={label} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/50">
              <Icon className="w-4 h-4 text-[#8B5CF6] shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{label}</p>
                <p className="text-xs text-muted-foreground truncate">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <Button 
          onClick={onClose}
          className="w-full h-11 mt-4 font-semibold bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] hover:opacity-90 border-0"
        >
          <Crown className="w-4 h-4 mr-2" />
          {isItalian ? 'Supportaci su Ko-fi' : 'Support us on Ko-fi'}
        </Button>
      </div>
    </div>
  );
};

// Separate component for test welcome banner to bypass normal logic
const TestWelcomeBanner: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { settings } = useSettings();
  const isItalian = settings.language === 'it';

  const premiumFeatures = [
    { icon: Car, label: isItalian ? 'Modalità Auto' : 'Auto Mode', desc: isItalian ? 'Interfaccia ottimizzata per la guida' : 'Driving-optimized interface' },
    { icon: Music, label: isItalian ? 'Importa Playlist' : 'Playlist Import', desc: isItalian ? 'Importa da Spotify e altri servizi' : 'Import from Spotify and other services' },
    { icon: Download, label: isItalian ? 'Download Offline' : 'Offline Downloads', desc: isItalian ? 'Scarica musica per ascoltarla offline' : 'Download music to listen offline' },
    { icon: Mic2, label: isItalian ? 'Testi Sincronizzati' : 'Synced Lyrics', desc: isItalian ? 'Karaoke con testi in tempo reale' : 'Karaoke with real-time lyrics' },
    { icon: Zap, label: isItalian ? 'Modalità Ibrida' : 'Hybrid Mode', desc: isItalian ? 'Fallback audio intelligente' : 'Smart audio fallback' },
  ];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-fade-in">
      <div 
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <div className="relative z-10 w-full max-w-md bg-gradient-to-br from-[#8B5CF6]/20 via-[#6366F1]/10 to-[#3B82F6]/20 border border-[#8B5CF6]/30 rounded-2xl p-6 shadow-2xl animate-scale-in">
        <button 
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-full bg-background/50 hover:bg-background/80 transition-colors"
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>

        <div className="flex justify-center mb-4">
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#3B82F6] flex items-center justify-center shadow-lg">
              <Crown className="w-10 h-10 text-white" />
            </div>
            <Sparkles className="absolute -top-1 -right-1 w-6 h-6 text-[#8B5CF6] animate-pulse" />
          </div>
        </div>

        <h2 className="text-2xl font-bold text-center text-foreground mb-2">
          {isItalian ? 'Benvenuto Premium! 🎉' : 'Welcome Premium! 🎉'}
        </h2>

        <p className="text-center text-muted-foreground mb-6">
          {isItalian 
            ? 'Congratulazioni! Ora hai accesso a tutte le funzionalità esclusive.'
            : 'Congratulations! You now have access to all exclusive features.'}
        </p>

        <div className="space-y-2 mb-6">
          {premiumFeatures.map(({ icon: Icon, label, desc }) => (
            <div key={label} className="flex items-center gap-3 p-2.5 rounded-lg bg-background/50">
              <div className="w-8 h-8 rounded-full bg-[#8B5CF6]/10 flex items-center justify-center">
                <Icon className="w-4 h-4 text-[#8B5CF6]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{label}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <Button 
          onClick={onClose}
          className="w-full bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] hover:opacity-90 text-white font-semibold"
        >
          {isItalian ? 'Inizia a esplorare' : 'Start exploring'}
        </Button>
      </div>
    </div>
  );
};

export default AdminBannerTester;
