import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Play, Headphones, Radio, Heart, ListMusic, Zap, Shield, Smartphone, Github, Download, Apple, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import appLogo from '@/assets/logo.png';

const Landing: React.FC = () => {
  const { isAuthenticated } = useAuth();

  const features = [
    {
      icon: Headphones,
      title: 'Streaming di qualità',
      description: 'Ascolta milioni di brani in alta qualità, senza interruzioni pubblicitarie.',
    },
    {
      icon: Radio,
      title: 'Daily Mix personalizzati',
      description: 'Ogni giorno mix creati su misura per te, basati sui tuoi gusti musicali.',
    },
    {
      icon: Heart,
      title: 'I tuoi preferiti',
      description: 'Salva artisti, album e brani preferiti per accedervi in un istante.',
    },
    {
      icon: ListMusic,
      title: 'Playlist illimitate',
      description: 'Crea e gestisci le tue playlist, importa da Spotify e condividile.',
    },
    {
      icon: Zap,
      title: 'Testi sincronizzati',
      description: 'Segui i testi delle canzoni in tempo reale mentre ascolti.',
    },
    {
      icon: Shield,
      title: 'Sicuro e privato',
      description: 'I tuoi dati sono protetti. Nessun tracciamento, nessuna pubblicità.',
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* Hero Section */}
      <header className="relative min-h-[90vh] flex flex-col items-center justify-center px-6 text-center">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[120px]" />
          <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
        </div>

        <nav className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 py-5 md:px-12">
          <div className="flex items-center gap-3">
            <img src={appLogo} alt="SoundFlow" className="w-10 h-10 rounded-xl" />
            <span className="text-xl font-bold">SoundFlow</span>
          </div>
          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <Link to="/app">
                <Button className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full px-6">
                  Apri App
                </Button>
              </Link>
            ) : (
              <>
                <Link to="/login">
                  <Button variant="ghost" className="text-muted-foreground hover:text-foreground rounded-full">
                    Accedi
                  </Button>
                </Link>
                <Link to="/login">
                  <Button className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full px-6">
                    Registrati
                  </Button>
                </Link>
              </>
            )}
          </div>
        </nav>

        <div className="relative z-10 max-w-3xl mx-auto space-y-8">
          <div className="flex justify-center">
            <img src={appLogo} alt="SoundFlow" className="w-24 h-24 md:w-32 md:h-32 rounded-3xl shadow-glow" />
          </div>
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-tight">
            La tua musica,{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">
              senza limiti
            </span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-xl mx-auto leading-relaxed">
            SoundFlow è il player musicale che mette te al centro. Streaming gratuito, playlist personalizzate e un'esperienza pensata per chi ama davvero la musica.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to={isAuthenticated ? '/app' : '/login'}>
              <Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full px-8 py-6 text-lg gap-2 shadow-glow">
                <Play className="w-5 h-5 fill-current" />
                Inizia ad ascoltare
              </Button>
            </Link>
          </div>
        </div>

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <div className="w-6 h-10 rounded-full border-2 border-muted-foreground/30 flex items-start justify-center p-1.5">
            <div className="w-1.5 h-2.5 rounded-full bg-muted-foreground/50" />
          </div>
        </div>
      </header>

      {/* Features Section */}
      <section className="py-24 px-6 md:px-12">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16 space-y-4">
            <h2 className="text-3xl md:text-5xl font-bold">
              Tutto ciò che ti serve
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Un'app completa per ascoltare, scoprire e organizzare la tua musica preferita.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, i) => (
              <div
                key={i}
                className="group relative p-6 rounded-2xl bg-card border border-border hover:border-primary/30 transition-all duration-300"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                  <feature.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Open Source Section */}
      <section className="py-24 px-6 md:px-12 bg-card/50">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <div className="w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
            <Github className="w-10 h-10 text-primary" />
          </div>
          <h2 className="text-3xl md:text-5xl font-bold">
            100% Open Source e Vibecoding
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto leading-relaxed">
            SoundFlow è nato dal vibecoding — pura sperimentazione, creatività e passione per la musica. Il codice sorgente è completamente open source e disponibile su GitHub: esplora, contribuisci o forkalo.
          </p>
          <a
            href="https://github.com/milhousegit/soundflowrd"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button size="lg" variant="outline" className="rounded-full px-8 py-6 text-lg gap-3 mt-2 border-primary/30 hover:bg-primary/10">
              <Github className="w-5 h-5" />
              Vedi su GitHub
              <ExternalLink className="w-4 h-4" />
            </Button>
          </a>
        </div>
      </section>

      {/* Download Section */}
      <section className="py-24 px-6 md:px-12">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16 space-y-4">
            <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
              <Smartphone className="w-10 h-10 text-primary" />
            </div>
            <h2 className="text-3xl md:text-5xl font-bold">
              Scarica SoundFlow
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Disponibile per Android e iOS. Installa l'app e porta la tua musica ovunque.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
            {/* Android */}
            <div className="p-6 rounded-2xl bg-card border border-border hover:border-primary/30 transition-all duration-300 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                  <Download className="w-6 h-6 text-emerald-500" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Android</h3>
                  <p className="text-xs text-muted-foreground">Versione 2.1.0 • APK</p>
                </div>
              </div>
              <p className="text-muted-foreground text-sm">
                Scarica il file APK e installalo direttamente sul tuo dispositivo Android.
              </p>
              <a href="/downloads/SoundFlow.apk" download="SoundFlow.apk">
                <Button className="w-full gap-2 rounded-xl">
                  <Download className="w-4 h-4" />
                  Scarica APK
                </Button>
              </a>
            </div>

            {/* iOS */}
            <div className="p-6 rounded-2xl bg-card border border-border hover:border-primary/30 transition-all duration-300 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
                  <Apple className="w-6 h-6 text-blue-500" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">iOS</h3>
                  <p className="text-xs text-muted-foreground">Versione 2.1.0 • IPA (Sideload)</p>
                </div>
              </div>
              <p className="text-muted-foreground text-sm">
                Scarica il file IPA e installalo tramite AltStore, Sideloadly o TrollStore.
              </p>
              <a href="/downloads/SoundFlow.ipa" download="SoundFlow.ipa">
                <Button className="w-full gap-2 rounded-xl">
                  <Download className="w-4 h-4" />
                  Scarica IPA
                </Button>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-24 px-6 md:px-12 bg-card/50">
        <div className="max-w-4xl mx-auto text-center space-y-16">
          <div className="space-y-4">
            <h2 className="text-3xl md:text-5xl font-bold">Come funziona</h2>
            <p className="text-muted-foreground text-lg">Tre semplici passi per iniziare</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {[
              { step: '1', title: 'Crea un account', desc: 'Registrati gratuitamente in pochi secondi con la tua email.' },
              { step: '2', title: 'Esplora e scopri', desc: 'Cerca artisti, album e brani. Scopri le tendenze e i Daily Mix.' },
              { step: '3', title: 'Ascolta e salva', desc: 'Riproduci la musica, crea playlist e salva i tuoi preferiti.' },
            ].map((item, i) => (
              <div key={i} className="space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
                  <span className="text-2xl font-bold text-primary">{item.step}</span>
                </div>
                <h3 className="text-xl font-semibold">{item.title}</h3>
                <p className="text-muted-foreground text-sm">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-6 md:px-12">
        <div className="max-w-3xl mx-auto text-center space-y-8 p-12 rounded-3xl bg-gradient-to-br from-primary/10 via-card to-accent/10 border border-primary/20">
          <h2 className="text-3xl md:text-4xl font-bold">
            Pronto a iniziare?
          </h2>
          <p className="text-muted-foreground text-lg">
            Unisciti a SoundFlow e scopri un nuovo modo di vivere la musica.
          </p>
          <Link to={isAuthenticated ? '/app' : '/login'}>
            <Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full px-10 py-6 text-lg gap-2 shadow-glow mt-4">
              <Play className="w-5 h-5 fill-current" />
              {isAuthenticated ? 'Vai all\'app' : 'Inizia gratis'}
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-border text-center">
        <div className="flex items-center justify-center gap-4 text-muted-foreground text-sm">
          <div className="flex items-center gap-2">
            <img src={appLogo} alt="SoundFlow" className="w-5 h-5 rounded" />
            <span>SoundFlow © {new Date().getFullYear()}</span>
          </div>
          <span className="text-border">•</span>
          <a
            href="https://github.com/milhousegit/soundflowrd"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors flex items-center gap-1"
          >
            <Github className="w-4 h-4" />
            GitHub
          </a>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
