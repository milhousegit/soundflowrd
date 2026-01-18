import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, RefreshCw, Shield, FileText, Scale, Info as InfoIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSettings } from '@/contexts/SettingsContext';
const Info: React.FC = () => {
  const navigate = useNavigate();
  const {
    settings
  } = useSettings();
  const isItalian = settings.language === 'it';
  return <div className="p-4 md:p-8 pb-32 max-w-2xl animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 md:mb-8">
        <Button variant="ghost" size="icon" onClick={() => navigate('/profile')} className="shrink-0">
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
                <p className="text-sm text-muted-foreground">v1.6.3</p>
              </div>
              <Button variant="outline" className="gap-2" onClick={async () => {
              try {
                // Clear all caches
                const cacheNames = await caches.keys();
                await Promise.all(cacheNames.map(name => caches.delete(name)));

                // Unregister all service workers
                const registrations = await navigator.serviceWorker.getRegistrations();
                await Promise.all(registrations.map(reg => reg.unregister()));

                // Force reload from server
                window.location.reload();
              } catch (error) {
                console.error('Failed to clear cache:', error);
                window.location.reload();
              }
            }}>
                <RefreshCw className="w-4 h-4" />
                {isItalian ? 'Aggiorna' : 'Update'}
              </Button>
            </div>
            
            {/* What's New in v1.6.2 */}
            <div className="mt-4 pt-4 border-t border-border">
              <h3 className="text-sm font-medium text-foreground mb-2">
                {isItalian ? "Novità della versione" : "What's new"}
              </h3>
              <ul className="text-sm text-muted-foreground space-y-1.5">
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                  {isItalian ? "Preload AudioContext più aggressivo e sincrono per background stabile" : "More aggressive and synchronous AudioContext preload for stable background"}
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 bg-primary" />
                  {isItalian ? "Inizializzazione AudioContext automatica durante il preload" : "Automatic AudioContext initialization during preload"}
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 bg-primary" />
                  {isItalian ? "Logging dettagliato per debug transizioni CarPlay" : "Detailed logging for CarPlay transition debugging"}
                </li>
              </ul>
            </div>
            
            {/* Roadmap */}
            <div className="mt-4 pt-4 border-t border-border">
              <h3 className="text-sm font-medium text-foreground mb-2">
                {isItalian ? "Roadmap" : "Roadmap"}
              </h3>
              <ul className="text-sm text-muted-foreground space-y-1.5">
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 mt-1.5 shrink-0" />
                  {isItalian ? "Risoluzione problema della riproduzione a singhiozzo su CarPlay" : "Fixing stuttering playback issue on CarPlay"}
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 mt-1.5 shrink-0" />
                  {isItalian ? "Sincronizzazione widget iOS durante caricamento stream" : "iOS widget sync during stream loading"}
                </li>
              </ul>
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
          
          <div className="p-3 md:p-4 rounded-xl bg-card space-y-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              {isItalian ? "SoundFlow rispetta pienamente la tua privacy e si impegna a proteggere i tuoi dati personali. Le informazioni fornite, come email, preferenze e cronologia di ascolto, vengono conservate in modo sicuro e non vengono mai condivise con terze parti." : "SoundFlow fully respects your privacy and is committed to protecting your personal data. Information provided, such as email, preferences, and listening history, is stored securely and never shared with third parties."}
            </p>
            
            <div>
              <h3 className="text-sm font-medium text-foreground mb-1">
                {isItalian ? "Sicurezza dei dati e delle chiavi API" : "Data and API Key Security"}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {isItalian ? "Eventuali API key inserite all'interno dell'app sono crittografate e accessibili esclusivamente a te. SoundFlow non visualizza né memorizza le tue credenziali in forma leggibile." : "Any API keys entered within the app are encrypted and accessible only to you. SoundFlow does not view or store your credentials in readable form."}
              </p>
            </div>
            
            <div>
              <h3 className="text-sm font-medium text-foreground mb-1">
                {isItalian ? "Personalizzazione dell'esperienza" : "Experience Personalization"}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {isItalian ? "Quando metti \"Mi piace\" a artisti, brani o album, accetti che questi dati vengano utilizzati unicamente per migliorare la tua esperienza d'uso, attraverso suggerimenti e raccomandazioni personalizzate gestite da un algoritmo interno. Puoi interrompere questa raccolta dati in qualsiasi momento semplicemente non utilizzando la funzione \"Mi piace\" o rimuovendo i \"Mi piace\" già assegnati." : "When you \"like\" artists, tracks, or albums, you agree that this data will be used solely to improve your experience through personalized suggestions and recommendations managed by an internal algorithm. You can stop this data collection at any time by simply not using the \"like\" feature or removing existing likes."}
              </p>
            </div>
            
            <div>
              <h3 className="text-sm font-medium text-foreground mb-1">
                {isItalian ? "Richiesta di accesso o cancellazione dei dati" : "Data Access or Deletion Request"}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {isItalian ? "Hai sempre il diritto di chiedere l'accesso, la modifica o la cancellazione di tutti i dati in nostro possesso. Per esercitare questo diritto, puoi contattarci all'indirizzo email: milhousedhl@proton.me." : "You always have the right to request access, modification, or deletion of all data we hold. To exercise this right, you can contact us at: milhousedhl@proton.me."}
              </p>
            </div>
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
              {isItalian ? 'SoundFlow utilizza le seguenti librerie e servizi:' : 'SoundFlow uses the following libraries and services:'}
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
                Deezer API - {isItalian ? 'Metadati musicali' : 'Music metadata'}
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary/50" />
                SquidWTF/Tidal - {isItalian ? 'Streaming audio' : 'Audio streaming'}
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary/50" />
                LRCLIB - {isItalian ? 'Testi sincronizzati' : 'Synchronized lyrics'}
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary/50" />
                Lyrics.ovh - {isItalian ? 'Testi (fallback)' : 'Lyrics (fallback)'}
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary/50" />
                Genius API - {isItalian ? 'Testi (fallback)' : 'Lyrics (fallback)'}
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
              {isItalian ? "Utilizzando SoundFlow, accetti integralmente i presenti Termini d'Uso. L'applicazione è fornita \"così com'è\" (as is), senza alcuna garanzia espressa o implicita riguardo a funzionalità, disponibilità o risultati attesi." : 'By using SoundFlow, you fully accept these Terms of Use. The application is provided "as is", without any express or implied warranty regarding functionality, availability, or expected results.'}
            </p>
            
            <div>
              <h3 className="text-sm font-medium text-foreground mb-1">
                {isItalian ? "Responsabilità dell'utente" : "User Responsibility"}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {isItalian ? "L'utente è l'unico responsabile del rispetto delle leggi sul copyright e dei diritti di proprietà intellettuale vigenti nel proprio Paese. Qualsiasi utilizzo di contenuti protetti deve avvenire in conformità con tali normative." : "Users are solely responsible for compliance with copyright laws and intellectual property rights in their country. Any use of protected content must comply with such regulations."}
              </p>
            </div>
            
            <div>
              <h3 className="text-sm font-medium text-foreground mb-1">
                {isItalian ? "Servizi di terze parti" : "Third-Party Services"}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {isItalian ? "SoundFlow non ospita né distribuisce direttamente contenuti multimediali. L'applicazione fornisce unicamente un'interfaccia che consente di accedere a servizi di terze parti, i cui termini e condizioni si applicano separatamente." : "SoundFlow does not host or directly distribute multimedia content. The application only provides an interface to access third-party services, whose terms and conditions apply separately."}
              </p>
            </div>
            
            <div>
              <h3 className="text-sm font-medium text-foreground mb-1">
                {isItalian ? "Uso personale" : "Personal Use"}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {isItalian ? "Tutti i contenuti accessibili tramite SoundFlow possono essere utilizzati esclusivamente per fini personali e non commerciali. È vietata qualsiasi forma di rivendita, copia, condivisione o redistribuzione non autorizzata." : "All content accessible through SoundFlow may only be used for personal and non-commercial purposes. Any form of resale, copying, sharing, or unauthorized redistribution is prohibited."}
              </p>
            </div>
            
            <div>
              <h3 className="text-sm font-medium text-foreground mb-1">
                {isItalian ? "Limitazione di responsabilità" : "Limitation of Liability"}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {isItalian ? "Essendo nata come progetto sperimentale ed esercizio di stile, SoundFlow non garantisce la disponibilità continua del servizio né l'assenza di errori. Gli sviluppatori non sono responsabili per eventuali utilizzi impropri dell'app o per danni derivanti dal suo uso." : "As an experimental project and style exercise, SoundFlow does not guarantee continuous service availability or absence of errors. Developers are not responsible for any improper use of the app or damages arising from its use."}
              </p>
            </div>
            
            <div>
              <h3 className="text-sm font-medium text-foreground mb-1">
                {isItalian ? "Conformità legale" : "Legal Compliance"}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {isItalian ? "L'uso dell'applicazione implica che l'utente si assuma ogni responsabilità per eventuali attività contrarie alle norme del proprio Paese." : "Using the application implies that users assume all responsibility for any activities contrary to the laws of their country."}
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>;
};
export default Info;