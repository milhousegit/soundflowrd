import React from 'react';
import { Headphones, Radio, ListMusic, Music2, Shield } from 'lucide-react';

/* ── Scrolling track list animation (used in Daily Mix & Lyrics cards) ── */
const mockTracks = [
  { title: 'Blinding Lights', artist: 'The Weeknd', cover: '🎵' },
  { title: 'Levitating', artist: 'Dua Lipa', cover: '🎶' },
  { title: 'Save Your Tears', artist: 'The Weeknd', cover: '🎵' },
  { title: 'Peaches', artist: 'Justin Bieber', cover: '🎶' },
  { title: 'Stay', artist: 'Kid Laroi', cover: '🎵' },
  { title: 'Montero', artist: 'Lil Nas X', cover: '🎶' },
  { title: 'Heat Waves', artist: 'Glass Animals', cover: '🎵' },
  { title: 'Good 4 U', artist: 'Olivia Rodrigo', cover: '🎶' },
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

const ScrollingTracks: React.FC<{ speed?: number }> = ({ speed = 20 }) => (
  <div className="relative overflow-hidden h-full">
    <div
      className="flex flex-col gap-2 animate-[landing-scroll_var(--scroll-speed)_linear_infinite]"
      style={{ '--scroll-speed': `${speed}s` } as React.CSSProperties}
    >
      {[...mockTracks, ...mockTracks].map((track, i) => (
        <div
          key={i}
          className="flex items-center gap-3 px-3 py-2 rounded-lg bg-secondary/50 min-w-0"
        >
          <div className="w-8 h-8 rounded bg-primary/20 flex items-center justify-center text-xs shrink-0">
            {track.cover}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground truncate">{track.title}</p>
            <p className="text-[10px] text-muted-foreground truncate">{track.artist}</p>
          </div>
        </div>
      ))}
    </div>
    <div className="absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-card to-transparent z-10" />
    <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-card to-transparent z-10" />
  </div>
);

const ScrollingLyrics: React.FC = () => (
  <div className="relative overflow-hidden h-full">
    <div className="flex flex-col gap-1 animate-[landing-scroll_25s_linear_infinite] px-3">
      {[...mockLyrics, ...mockLyrics].map((line, i) => (
        <p
          key={i}
          className={`text-xs leading-relaxed transition-all ${
            line.active
              ? 'text-primary font-bold text-sm scale-105 origin-left'
              : 'text-muted-foreground/60'
          }`}
        >
          {line.text}
        </p>
      ))}
    </div>
    <div className="absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-card to-transparent z-10" />
    <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-card to-transparent z-10" />
  </div>
);

const SpotifyImportAnim: React.FC = () => (
  <div className="flex flex-col items-center justify-center h-full gap-3 px-4">
    {/* Spotify link input mock */}
    <div className="w-full rounded-lg bg-secondary/50 border border-border px-3 py-2 flex items-center gap-2">
      <span className="text-[10px] text-muted-foreground truncate">https://open.spotify.com/playlist/37i9...</span>
    </div>
    {/* Arrow animation */}
    <div className="flex flex-col items-center gap-1 animate-pulse">
      <div className="w-0.5 h-4 bg-primary/50 rounded-full" />
      <div className="w-2 h-2 border-b-2 border-r-2 border-primary/50 rotate-45 -mt-1" />
    </div>
    {/* Converted playlist mock */}
    <div className="w-full rounded-lg bg-secondary/50 border border-primary/30 p-3 space-y-2">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-6 h-6 rounded bg-primary/20 flex items-center justify-center">
          <ListMusic className="w-3 h-3 text-primary" />
        </div>
        <span className="text-xs font-semibold text-foreground">La mia playlist</span>
      </div>
      {['Blinding Lights', 'Levitating', 'Stay'].map((t, i) => (
        <div key={i} className="flex items-center gap-2 animate-[landing-fade-in_0.5s_ease-out_forwards] opacity-0"
          style={{ animationDelay: `${1 + i * 0.4}s` }}
        >
          <div className="w-5 h-5 rounded bg-primary/10 shrink-0" />
          <span className="text-[10px] text-muted-foreground">{t}</span>
          <span className="ml-auto text-primary text-[10px]">✓</span>
        </div>
      ))}
    </div>
  </div>
);

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
  className?: string;
}

const FeatureCard: React.FC<FeatureCardProps> = ({ icon, title, description, children, className = '' }) => (
  <div className={`group relative rounded-2xl bg-card border border-border hover:border-primary/30 transition-all duration-500 overflow-hidden ${className}`}>
    {/* Content */}
    <div className="p-6 relative z-10">
      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
        {icon}
      </div>
      <h3 className="text-lg font-semibold mb-2 text-foreground">{title}</h3>
      <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
    </div>
    {/* Animated preview area */}
    <div className="h-48 relative overflow-hidden mx-4 mb-4 rounded-xl bg-card border border-border/50">
      {children}
    </div>
  </div>
);

const LandingFeatures: React.FC = () => {
  return (
    <section className="py-24 px-6 md:px-12">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16 space-y-4">
          <h2 className="text-3xl md:text-5xl font-bold text-foreground">
            Tutto ciò che ti serve
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Un'app completa per ascoltare, scoprire e organizzare la tua musica preferita.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* 1. Hi-Fi Music */}
          <FeatureCard
            icon={<Headphones className="w-6 h-6 text-primary" />}
            title="Musica Hi-Fi"
            description="Niente YouTube. Riproduci in FLAC e 320kbps dal tuo account Real-Debrid o tramite HiFi, SquidWTF e Monochrome."
          >
            <div className="flex flex-col items-center justify-center h-full gap-3 px-4">
              {/* Waveform animation */}
              <div className="flex items-end gap-1 h-16">
                {Array.from({ length: 24 }).map((_, i) => (
                  <div
                    key={i}
                    className="w-1 bg-primary/70 rounded-full animate-[landing-wave_1.2s_ease-in-out_infinite]"
                    style={{
                      animationDelay: `${i * 0.05}s`,
                      height: '8px',
                    }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2">
                <div className="px-2 py-0.5 rounded bg-primary/20 text-[10px] font-bold text-primary">FLAC</div>
                <div className="px-2 py-0.5 rounded bg-primary/10 text-[10px] font-medium text-primary/70">320kbps</div>
              </div>
              <p className="text-[10px] text-muted-foreground text-center">Real-Debrid • HiFi • SquidWTF • Monochrome</p>
            </div>
          </FeatureCard>

          {/* 2. Daily Mix */}
          <FeatureCard
            icon={<Radio className="w-6 h-6 text-primary" />}
            title="Daily Mix"
            description="Ogni giorno 50 brani su misura: comfort e scoperta, mixati per te automaticamente."
          >
            <ScrollingTracks speed={18} />
          </FeatureCard>

          {/* 3. Import Playlist */}
          <FeatureCard
            icon={<ListMusic className="w-6 h-6 text-primary" />}
            title="Importa Playlist"
            description="Incolla un link Spotify e la tua playlist viene convertita istantaneamente su SoundFlow."
          >
            <SpotifyImportAnim />
          </FeatureCard>

          {/* 4. Lyrics */}
          <FeatureCard
            icon={<Music2 className="w-6 h-6 text-primary" />}
            title="Lyrics"
            description="Apri i testi sincronizzati direttamente dal player e segui ogni parola in tempo reale."
          >
            <ScrollingLyrics />
          </FeatureCard>

          {/* 5. Sicuro e privato */}
          <FeatureCard
            icon={<Shield className="w-6 h-6 text-primary" />}
            title="Sicuro e privato"
            description="I tuoi dati sono protetti. Nessun tracciamento, nessun abbonamento."
            className="md:col-span-2 lg:col-span-2"
          >
            <div className="flex items-center justify-center h-full gap-8 px-6">
              {[
                { emoji: '🔒', label: 'Dati crittografati' },
                { emoji: '🚫', label: 'Zero tracciamento' },
                { emoji: '💳', label: 'Nessun abbonamento' },
                { emoji: '🛡️', label: 'Open source' },
              ].map((item, i) => (
                <div
                  key={i}
                  className="flex flex-col items-center gap-2 animate-[landing-fade-in_0.6s_ease-out_forwards] opacity-0"
                  style={{ animationDelay: `${i * 0.3}s` }}
                >
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-2xl group-hover:bg-primary/20 transition-colors">
                    {item.emoji}
                  </div>
                  <span className="text-xs text-muted-foreground font-medium">{item.label}</span>
                </div>
              ))}
            </div>
          </FeatureCard>
        </div>
      </div>
    </section>
  );
};

export default LandingFeatures;
