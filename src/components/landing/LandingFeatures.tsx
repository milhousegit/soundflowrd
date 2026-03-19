import React from 'react';
import { Headphones, Radio, ListMusic, Music2, Shield, Play, SkipForward, SkipBack, Heart, Search, Home, Library, ChevronUp, Wifi, Battery, Signal } from 'lucide-react';

/* ── Mock data ── */
const mockTracks = [
  { title: 'Blinding Lights', artist: 'The Weeknd' },
  { title: 'Levitating', artist: 'Dua Lipa' },
  { title: 'Save Your Tears', artist: 'The Weeknd' },
  { title: 'Peaches', artist: 'Justin Bieber' },
  { title: 'Stay', artist: 'Kid Laroi & Justin Bieber' },
  { title: 'Montero', artist: 'Lil Nas X' },
  { title: 'Heat Waves', artist: 'Glass Animals' },
  { title: 'Good 4 U', artist: 'Olivia Rodrigo' },
];

const mockLyrics = [
  { text: "I've been tryna call", active: false },
  { text: "I've been on my own for long enough", active: false },
  { text: "Maybe you can show me how to love, maybe", active: true },
  { text: "I'm going through withdrawals", active: false },
  { text: "You don't even have to do too much", active: false },
  { text: "You can turn me on with just a touch, baby", active: false },
  { text: "I look around and Sin City's cold and empty", active: false },
  { text: "No one's around to judge me", active: false },
];

/* ── Phone Frame ── */
const PhoneFrame: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="relative mx-auto w-[200px] h-[400px] rounded-[28px] border-2 border-border bg-background shadow-[0_20px_60px_hsl(var(--primary)/0.15)] overflow-hidden shrink-0">
    {/* Status bar */}
    <div className="flex items-center justify-between px-5 pt-2 pb-1 text-[8px] text-muted-foreground">
      <span className="font-semibold">9:41</span>
      <div className="flex items-center gap-1">
        <Signal className="w-2.5 h-2.5" />
        <Wifi className="w-2.5 h-2.5" />
        <Battery className="w-3 h-2.5" />
      </div>
    </div>
    {/* Notch */}
    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-5 bg-background rounded-b-2xl" />
    {/* Content */}
    <div className="h-[calc(100%-24px)] overflow-hidden relative">
      {children}
    </div>
  </div>
);

/* ── Phone: Hi-Fi Player ── */
const HiFiPhone: React.FC = () => (
  <PhoneFrame>
    <div className="flex flex-col h-full px-4 pt-4">
      {/* Album art */}
      <div className="w-full aspect-square rounded-2xl bg-gradient-to-br from-primary/30 via-accent/20 to-primary/10 flex items-center justify-center mb-3 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_40%,hsl(var(--primary)/0.3),transparent_60%)]" />
        <Headphones className="w-12 h-12 text-primary/60" />
      </div>
      {/* Track info */}
      <p className="text-[11px] font-semibold text-foreground truncate">Blinding Lights</p>
      <p className="text-[9px] text-muted-foreground">The Weeknd</p>
      {/* Quality badge */}
      <div className="flex items-center gap-1.5 mt-1.5">
        <span className="px-1.5 py-0.5 rounded bg-primary/20 text-[7px] font-bold text-primary">FLAC</span>
        <span className="px-1.5 py-0.5 rounded bg-primary/10 text-[7px] text-primary/70">320kbps</span>
      </div>
      {/* Progress bar */}
      <div className="mt-3 w-full h-0.5 rounded-full bg-secondary">
        <div className="h-full w-[45%] rounded-full bg-primary animate-[landing-progress_8s_linear_infinite]" />
      </div>
      <div className="flex justify-between text-[7px] text-muted-foreground mt-0.5">
        <span>1:23</span><span>3:20</span>
      </div>
      {/* Controls */}
      <div className="flex items-center justify-center gap-4 mt-2">
        <SkipBack className="w-4 h-4 text-muted-foreground" />
        <div className="w-8 h-8 rounded-full bg-foreground flex items-center justify-center">
          <Play className="w-4 h-4 text-background fill-current ml-0.5" />
        </div>
        <SkipForward className="w-4 h-4 text-muted-foreground" />
      </div>
      {/* Source label */}
      <p className="text-[7px] text-center text-muted-foreground/60 mt-2">Real-Debrid • HiFi • SquidWTF • Monochrome</p>
    </div>
  </PhoneFrame>
);

/* ── Phone: Daily Mix ── */
const DailyMixPhone: React.FC = () => (
  <PhoneFrame>
    <div className="flex flex-col h-full px-3 pt-3">
      <p className="text-[11px] font-bold text-foreground mb-1">Daily Mix 1</p>
      <p className="text-[8px] text-muted-foreground mb-3">50 brani • Aggiornato oggi</p>
      <div className="flex-1 overflow-hidden relative">
        <div className="flex flex-col gap-1.5 animate-[landing-scroll_16s_linear_infinite]">
          {[...mockTracks, ...mockTracks].map((track, i) => (
            <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-secondary/40">
              <div className="w-7 h-7 rounded bg-gradient-to-br from-primary/30 to-accent/20 shrink-0 flex items-center justify-center">
                <Music2 className="w-3 h-3 text-primary/60" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-medium text-foreground truncate">{track.title}</p>
                <p className="text-[7px] text-muted-foreground truncate">{track.artist}</p>
              </div>
              <Heart className="w-3 h-3 text-muted-foreground/40 shrink-0" />
            </div>
          ))}
        </div>
        <div className="absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-background to-transparent z-10" />
        <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-background to-transparent z-10" />
      </div>
      {/* Mini player */}
      <div className="flex items-center gap-2 p-2 rounded-xl bg-card border border-border mt-1 mb-2">
        <div className="w-6 h-6 rounded bg-primary/20 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[8px] font-medium text-foreground truncate">Blinding Lights</p>
          <p className="text-[6px] text-muted-foreground">The Weeknd</p>
        </div>
        <Play className="w-3 h-3 text-foreground" />
      </div>
    </div>
  </PhoneFrame>
);

/* ── Phone: Import Playlist ── */
const ImportPhone: React.FC = () => (
  <PhoneFrame>
    <div className="flex flex-col h-full px-3 pt-4">
      <p className="text-[11px] font-bold text-foreground mb-3">Importa Playlist</p>
      {/* URL input */}
      <div className="w-full rounded-lg bg-secondary/50 border border-border px-2 py-1.5 mb-3">
        <p className="text-[8px] text-muted-foreground truncate">https://open.spotify.com/playlist/37i9...</p>
      </div>
      {/* Converting animation */}
      <div className="flex items-center justify-center gap-2 mb-3 animate-pulse">
        <div className="w-1 h-1 rounded-full bg-primary" />
        <p className="text-[8px] text-primary font-medium">Conversione in corso...</p>
        <div className="w-1 h-1 rounded-full bg-primary" />
      </div>
      {/* Result */}
      <div className="rounded-xl bg-card border border-primary/20 p-3 space-y-1.5">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/30 to-accent/20 flex items-center justify-center">
            <ListMusic className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-[9px] font-semibold text-foreground">La mia playlist</p>
            <p className="text-[7px] text-muted-foreground">24 brani importati</p>
          </div>
        </div>
        {['Blinding Lights – The Weeknd', 'Levitating – Dua Lipa', 'Stay – Kid Laroi', 'Peaches – J. Bieber'].map((t, i) => (
          <div
            key={i}
            className="flex items-center gap-2 py-1 animate-[landing-fade-in_0.5s_ease-out_forwards] opacity-0"
            style={{ animationDelay: `${0.5 + i * 0.3}s` }}
          >
            <div className="w-4 h-4 rounded bg-primary/10 shrink-0" />
            <span className="text-[8px] text-muted-foreground flex-1 truncate">{t}</span>
            <span className="text-primary text-[8px]">✓</span>
          </div>
        ))}
      </div>
    </div>
  </PhoneFrame>
);

/* ── Phone: Lyrics ── */
const LyricsPhone: React.FC = () => (
  <PhoneFrame>
    <div className="flex flex-col h-full">
      {/* Player header */}
      <div className="flex items-center gap-2 px-3 pt-2 pb-1">
        <ChevronUp className="w-3 h-3 text-muted-foreground rotate-180" />
        <div className="flex-1 text-center">
          <p className="text-[9px] font-semibold text-foreground">Blinding Lights</p>
          <p className="text-[7px] text-muted-foreground">The Weeknd</p>
        </div>
        <Music2 className="w-3 h-3 text-primary" />
      </div>
      {/* Lyrics area */}
      <div className="flex-1 overflow-hidden relative px-4 pt-2">
        <div className="flex flex-col gap-2 animate-[landing-scroll_20s_linear_infinite]">
          {[...mockLyrics, ...mockLyrics].map((line, i) => (
            <p
              key={i}
              className={`leading-relaxed transition-all duration-300 ${
                line.active
                  ? 'text-primary font-bold text-[12px]'
                  : 'text-muted-foreground/40 text-[10px]'
              }`}
            >
              {line.text}
            </p>
          ))}
        </div>
        <div className="absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-background to-transparent z-10" />
        <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-background to-transparent z-10" />
      </div>
      {/* Mini controls */}
      <div className="px-4 pb-3 pt-1">
        <div className="w-full h-0.5 rounded-full bg-secondary mb-2">
          <div className="h-full w-[35%] rounded-full bg-primary" />
        </div>
        <div className="flex items-center justify-center gap-5">
          <SkipBack className="w-3.5 h-3.5 text-muted-foreground" />
          <div className="w-7 h-7 rounded-full bg-foreground flex items-center justify-center">
            <Play className="w-3.5 h-3.5 text-background fill-current ml-0.5" />
          </div>
          <SkipForward className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
      </div>
    </div>
  </PhoneFrame>
);

/* ── Phone: Privacy ── */
const PrivacyPhone: React.FC = () => (
  <PhoneFrame>
    <div className="flex flex-col items-center justify-center h-full gap-4 px-4">
      <Shield className="w-10 h-10 text-primary/60" />
      {[
        { icon: '🔒', label: 'Dati crittografati' },
        { icon: '🚫', label: 'Zero tracciamento' },
        { icon: '💳', label: 'Nessun abbonamento' },
        { icon: '🛡️', label: 'Open source' },
      ].map((item, i) => (
        <div
          key={i}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-xl bg-secondary/40 animate-[landing-fade-in_0.5s_ease-out_forwards] opacity-0"
          style={{ animationDelay: `${i * 0.4}s` }}
        >
          <span className="text-base">{item.icon}</span>
          <span className="text-[10px] font-medium text-foreground">{item.label}</span>
        </div>
      ))}
    </div>
  </PhoneFrame>
);

/* ── Feature Card ── */
interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  phone: React.ReactNode;
}

const FeatureCard: React.FC<FeatureCardProps> = ({ icon, title, description, phone }) => (
  <div className="flex flex-col items-center gap-6 shrink-0 w-[300px] snap-center">
    {/* Phone mockup */}
    {phone}
    {/* Text */}
    <div className="text-center space-y-2 px-2">
      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mx-auto">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
    </div>
  </div>
);

/* ── Main Section ── */
const LandingFeatures: React.FC = () => {
  const features: FeatureCardProps[] = [
    {
      icon: <Headphones className="w-5 h-5 text-primary" />,
      title: 'Musica Hi-Fi',
      description: 'Niente YouTube. FLAC e 320kbps da Real-Debrid, HiFi, SquidWTF e Monochrome.',
      phone: <HiFiPhone />,
    },
    {
      icon: <Radio className="w-5 h-5 text-primary" />,
      title: 'Daily Mix',
      description: '50 brani al giorno su misura per te, tra comfort e scoperta.',
      phone: <DailyMixPhone />,
    },
    {
      icon: <ListMusic className="w-5 h-5 text-primary" />,
      title: 'Importa Playlist',
      description: 'Incolla un link Spotify e la playlist viene convertita su SoundFlow.',
      phone: <ImportPhone />,
    },
    {
      icon: <Music2 className="w-5 h-5 text-primary" />,
      title: 'Lyrics',
      description: 'Testi sincronizzati direttamente dal player, parola per parola.',
      phone: <LyricsPhone />,
    },
    {
      icon: <Shield className="w-5 h-5 text-primary" />,
      title: 'Sicuro e privato',
      description: 'Nessun tracciamento, nessun abbonamento. I tuoi dati sono al sicuro.',
      phone: <PrivacyPhone />,
    },
  ];

  return (
    <section className="py-24">
      <div className="text-center mb-12 space-y-4 px-6">
        <h2 className="text-3xl md:text-5xl font-bold text-foreground">
          Tutto ciò che ti serve
        </h2>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
          Un'app completa per ascoltare, scoprire e organizzare la tua musica preferita.
        </p>
      </div>

      {/* Horizontal scrolling container */}
      <div className="relative">
        <div className="flex gap-8 overflow-x-auto pb-8 px-8 snap-x snap-mandatory scrollbar-hide"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {/* Spacer for centering first item on large screens */}
          <div className="shrink-0 w-[calc((100vw-300px)/2-32px)] hidden lg:block" />
          {features.map((feature, i) => (
            <FeatureCard key={i} {...feature} />
          ))}
          <div className="shrink-0 w-[calc((100vw-300px)/2-32px)] hidden lg:block" />
        </div>
        {/* Fade edges */}
        <div className="absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-background to-transparent pointer-events-none z-10" />
        <div className="absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-background to-transparent pointer-events-none z-10" />
      </div>

      {/* Scroll hint */}
      <p className="text-center text-xs text-muted-foreground/50 mt-2">Scorri per scoprire →</p>
    </section>
  );
};

export default LandingFeatures;
