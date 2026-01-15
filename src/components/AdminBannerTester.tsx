import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronDown, Eye, Crown, AlertTriangle, Sparkles, Download, Car, Music, Mic2, Zap, X } from 'lucide-react';
import { useSettings } from '@/contexts/SettingsContext';
import PremiumWelcomeBanner from './PremiumWelcomeBanner';
import PremiumExpiredBanner from './PremiumExpiredBanner';

interface AdminBannerTesterProps {
  language: 'it' | 'en';
}

const AdminBannerTester: React.FC<AdminBannerTesterProps> = ({ language }) => {
  const [showWelcomeBanner, setShowWelcomeBanner] = useState(false);
  const [showExpiredBanner, setShowExpiredBanner] = useState(false);

  const isItalian = language === 'it';

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
              <Crown className="w-4 h-4 text-[#8B5CF6]" />
            </Button>

            {/* Expired Banner Test */}
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start gap-2 h-10"
              onClick={() => setShowExpiredBanner(true)}
            >
              <div className="w-6 h-6 rounded-full bg-gradient-to-r from-amber-500 to-orange-600 flex items-center justify-center">
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
              <AlertTriangle className="w-4 h-4 text-amber-500" />
            </Button>
          </div>
        </div>
      </details>

      {/* Test banners - force show */}
      {showWelcomeBanner && (
        <TestWelcomeBanner onClose={() => setShowWelcomeBanner(false)} />
      )}
      {showExpiredBanner && (
        <PremiumExpiredBanner forceShow onClose={() => setShowExpiredBanner(false)} />
      )}
    </>
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
