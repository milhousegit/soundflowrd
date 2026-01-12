import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, RefreshCw, Shield, FileText, Scale, Info as InfoIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSettings } from '@/contexts/SettingsContext';

const Info: React.FC = () => {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const isItalian = settings.language === 'it';

  return (
    <div className="p-4 md:p-8 pb-32 max-w-2xl animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 md:mb-8">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/profile')}
          className="shrink-0"
        >
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-2xl md:text-4xl font-bold text-foreground">
          {isItalian ? 'Informazioni' : 'Information'}
        </h1>
      </div>

      <div className="space-y-6 md:space-y-8">
        {/* Version Section */}
        <section className="space-y-3 md:space-y-4">
          <div className="flex items-center gap-2 md:gap-3 mb-3 md:mb-4">
            <InfoIcon className="w-4 h-4 md:w-5 md:h-5 text-primary" />
            <h2 className="text-lg md:text-xl font-semibold text-foreground">
              {isItalian ? 'Versione' : 'Version'}
            </h2>
          </div>
          
          <div className="p-3 md:p-4 rounded-xl bg-card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-semibold text-foreground">SoundFlow</p>
                <p className="text-sm text-muted-foreground">v0.8.6</p>
              </div>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => window.location.reload()}
              >
                <RefreshCw className="w-4 h-4" />
                {isItalian ? 'Aggiorna' : 'Update'}
              </Button>
            </div>
          </div>
        </section>

        {/* Privacy Policy */}
        <section className="space-y-3 md:space-y-4">
          <div className="flex items-center gap-2 md:gap-3 mb-3 md:mb-4">
            <Shield className="w-4 h-4 md:w-5 md:h-5 text-primary" />
            <h2 className="text-lg md:text-xl font-semibold text-foreground">
              {isItalian ? 'Informativa Privacy' : 'Privacy Policy'}
            </h2>
          </div>
          
          <div className="p-3 md:p-4 rounded-xl bg-card">
            <p className="text-sm text-muted-foreground leading-relaxed">
              {isItalian 
                ? 'SoundFlow rispetta la tua privacy. I tuoi dati personali (email, preferenze, cronologia di ascolto) vengono memorizzati in modo sicuro e non vengono mai condivisi con terze parti. Le API key che inserisci sono crittografate e accessibili solo a te.'
                : 'SoundFlow respects your privacy. Your personal data (email, preferences, listening history) is stored securely and never shared with third parties. API keys you enter are encrypted and accessible only to you.'}
            </p>
          </div>
        </section>

        {/* Third Party Licenses */}
        <section className="space-y-3 md:space-y-4">
          <div className="flex items-center gap-2 md:gap-3 mb-3 md:mb-4">
            <FileText className="w-4 h-4 md:w-5 md:h-5 text-primary" />
            <h2 className="text-lg md:text-xl font-semibold text-foreground">
              {isItalian ? 'Licenze di Terze Parti' : 'Third Party Licenses'}
            </h2>
          </div>
          
          <div className="p-3 md:p-4 rounded-xl bg-card space-y-3">
            <p className="text-sm text-muted-foreground">
              {isItalian 
                ? 'SoundFlow utilizza le seguenti librerie open source:'
                : 'SoundFlow uses the following open source libraries:'}
            </p>
            <ul className="text-sm text-muted-foreground space-y-1.5">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary/50" />
                React - MIT License
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary/50" />
                Tailwind CSS - MIT License
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary/50" />
                Radix UI - MIT License
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary/50" />
                Lucide Icons - ISC License
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary/50" />
                Tanstack Query - MIT License
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary/50" />
                WebTorrent - MIT License
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary/50" />
                Real-Debrid ({isItalian ? 'opzionale' : 'optional'}) - {isItalian ? 'Servizio di terze parti' : 'Third-party service'}
              </li>
            </ul>
          </div>
        </section>

        {/* Terms of Use */}
        <section className="space-y-3 md:space-y-4">
          <div className="flex items-center gap-2 md:gap-3 mb-3 md:mb-4">
            <Scale className="w-4 h-4 md:w-5 md:h-5 text-primary" />
            <h2 className="text-lg md:text-xl font-semibold text-foreground">
              {isItalian ? "Termini d'Uso" : 'Terms of Use'}
            </h2>
          </div>
          
          <div className="p-3 md:p-4 rounded-xl bg-card space-y-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              {isItalian 
                ? "Utilizzando SoundFlow, accetti integralmente i presenti Termini d'Uso. L'applicazione è fornita \"così com'è\" (as is), senza alcuna garanzia espressa o implicita riguardo a funzionalità, disponibilità o risultati attesi."
                : 'By using SoundFlow, you fully accept these Terms of Use. The application is provided "as is", without any express or implied warranty regarding functionality, availability, or expected results.'}
            </p>
            
            <div>
              <h3 className="text-sm font-medium text-foreground mb-1">
                {isItalian ? "Responsabilità dell'utente" : "User Responsibility"}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {isItalian 
                  ? "L'utente è l'unico responsabile del rispetto delle leggi sul copyright e dei diritti di proprietà intellettuale vigenti nel proprio Paese. Qualsiasi utilizzo di contenuti protetti deve avvenire in conformità con tali normative."
                  : "Users are solely responsible for compliance with copyright laws and intellectual property rights in their country. Any use of protected content must comply with such regulations."}
              </p>
            </div>
            
            <div>
              <h3 className="text-sm font-medium text-foreground mb-1">
                {isItalian ? "Servizi di terze parti" : "Third-Party Services"}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {isItalian 
                  ? "SoundFlow non ospita né distribuisce direttamente contenuti multimediali. L'applicazione fornisce unicamente un'interfaccia che consente di accedere a servizi di terze parti, i cui termini e condizioni si applicano separatamente."
                  : "SoundFlow does not host or directly distribute multimedia content. The application only provides an interface to access third-party services, whose terms and conditions apply separately."}
              </p>
            </div>
            
            <div>
              <h3 className="text-sm font-medium text-foreground mb-1">
                {isItalian ? "Uso personale" : "Personal Use"}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {isItalian 
                  ? "Tutti i contenuti accessibili tramite SoundFlow possono essere utilizzati esclusivamente per fini personali e non commerciali. È vietata qualsiasi forma di rivendita, copia, condivisione o redistribuzione non autorizzata."
                  : "All content accessible through SoundFlow may only be used for personal and non-commercial purposes. Any form of resale, copying, sharing, or unauthorized redistribution is prohibited."}
              </p>
            </div>
            
            <div>
              <h3 className="text-sm font-medium text-foreground mb-1">
                {isItalian ? "Limitazione di responsabilità" : "Limitation of Liability"}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {isItalian 
                  ? "Essendo nata come progetto sperimentale ed esercizio di stile, SoundFlow non garantisce la disponibilità continua del servizio né l'assenza di errori. Gli sviluppatori non sono responsabili per eventuali utilizzi impropri dell'app o per danni derivanti dal suo uso."
                  : "As an experimental project and style exercise, SoundFlow does not guarantee continuous service availability or absence of errors. Developers are not responsible for any improper use of the app or damages arising from its use."}
              </p>
            </div>
            
            <div>
              <h3 className="text-sm font-medium text-foreground mb-1">
                {isItalian ? "Conformità legale" : "Legal Compliance"}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {isItalian 
                  ? "L'uso dell'applicazione implica che l'utente si assuma ogni responsabilità per eventuali attività contrarie alle norme del proprio Paese."
                  : "Using the application implies that users assume all responsibility for any activities contrary to the laws of their country."}
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Info;
