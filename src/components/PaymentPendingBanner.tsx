import React from 'react';
import { Clock, X, Crown, CheckCircle2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSettings } from '@/contexts/SettingsContext';

interface PaymentPendingBannerProps {
  onClose: () => void;
  forceShow?: boolean;
}

const PaymentPendingBanner: React.FC<PaymentPendingBannerProps> = ({ onClose, forceShow = false }) => {
  const { settings } = useSettings();
  const isItalian = settings.language === 'it';

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-fade-in">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Banner */}
      <div className="relative z-10 w-full max-w-md bg-gradient-to-br from-amber-500/20 via-orange-500/10 to-yellow-500/20 border border-amber-500/30 rounded-2xl p-6 shadow-2xl animate-scale-in">
        {/* Close button */}
        <button 
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-full bg-background/50 hover:bg-background/80 transition-colors"
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>

        {/* Clock icon */}
        <div className="flex justify-center mb-4">
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg">
              <Clock className="w-10 h-10 text-white animate-pulse" />
            </div>
            <Crown className="absolute -top-1 -right-1 w-6 h-6 text-amber-400" />
          </div>
        </div>

        {/* Title */}
        <h2 className="text-2xl font-bold text-center text-foreground mb-2">
          {isItalian ? 'Verifica in corso' : 'Verification in progress'} ⏳
        </h2>

        {/* Subtitle */}
        <p className="text-center text-muted-foreground mb-6">
          {isItalian 
            ? 'Grazie per la tua donazione! Verificheremo l\'accredito e attiveremo il tuo Premium il prima possibile.'
            : 'Thank you for your donation! We will verify the payment and activate your Premium as soon as possible.'}
        </p>

        {/* Steps */}
        <div className="space-y-3 mb-6">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-background/50">
            <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                {isItalian ? 'Pagamento effettuato' : 'Payment completed'}
              </p>
              <p className="text-xs text-muted-foreground">
                {isItalian ? 'La tua donazione è stata ricevuta' : 'Your donation has been received'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 p-3 rounded-lg bg-background/50">
            <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center">
              <Clock className="w-4 h-4 text-amber-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                {isItalian ? 'Verifica in corso' : 'Verification in progress'}
              </p>
              <p className="text-xs text-muted-foreground">
                {isItalian ? 'Stiamo controllando l\'accredito' : 'We are checking the payment'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-lg bg-background/50 opacity-50">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Crown className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                {isItalian ? 'Attivazione Premium' : 'Premium activation'}
              </p>
              <p className="text-xs text-muted-foreground">
                {isItalian ? 'Riceverai una notifica quando sarà attivo' : 'You will be notified when it\'s active'}
              </p>
            </div>
          </div>
        </div>

        {/* Info box */}
        <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 mb-4">
          <div className="flex items-start gap-2">
            <Mail className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              {isItalian 
                ? 'Di solito la verifica richiede pochi minuti. In caso di problemi, riceverai una notifica o contattaci via Telegram.'
                : 'Verification usually takes a few minutes. If there are any issues, you will receive a notification or contact us via Telegram.'}
            </p>
          </div>
        </div>

        {/* CTA Button */}
        <Button 
          onClick={onClose}
          className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:opacity-90 text-white font-semibold"
        >
          {isItalian ? 'Ho capito' : 'Got it'}
        </Button>
      </div>
    </div>
  );
};

export default PaymentPendingBanner;
