import React from 'react';
import { Music } from 'lucide-react';
import logoImg from '@/assets/logo.png';

/** Three distinct gradient palettes for daily mixes */
const MIX_GRADIENTS: [string, string][] = [
  ['hsl(200, 85%, 55%)', 'hsl(168, 80%, 45%)'],   // blue → teal
  ['hsl(280, 70%, 55%)', 'hsl(330, 90%, 55%)'],    // purple → pink
  ['hsl(10, 85%, 55%)', 'hsl(40, 90%, 55%)'],      // red → orange
];

interface BrandedPlaylistCoverProps {
  type: 'radio' | 'daily-mix';
  /** Background image (artist/track cover) */
  backgroundUrl?: string | null;
  /** Label shown on the cover */
  label?: string;
  /** Sub-label (genre / artist info) */
  subtitle?: string;
  /** Mix index (0-based) – used to pick gradient colour */
  mixIndex?: number;
  className?: string;
}

const BrandedPlaylistCover: React.FC<BrandedPlaylistCoverProps> = ({
  type,
  backgroundUrl,
  label,
  subtitle,
  mixIndex = 0,
  className = '',
}) => {
  // Pick gradient based on mix index (cycles if >3)
  const [c1, c2] = type === 'daily-mix'
    ? MIX_GRADIENTS[mixIndex % MIX_GRADIENTS.length]
    : ['hsl(174, 72%, 40%)', 'hsl(187, 85%, 35%)'];

  const gradient = `linear-gradient(160deg, ${c1} 0%, ${c2} 100%)`;

  return (
    <div
      className={`relative w-full aspect-square overflow-hidden ${className}`}
      style={!backgroundUrl ? { background: gradient } : undefined}
    >
      {/* Background image if available */}
      {backgroundUrl ? (
        <img
          src={backgroundUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        /* Centred music icon as placeholder */
        <div className="absolute inset-0 flex items-center justify-center">
          <Music className="w-12 h-12 text-white/80 drop-shadow-lg" />
        </div>
      )}

      {/* Subtle gradient overlay at bottom for text readability */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />

      {/* Top-left: Logo + subtitle */}
      <div className="absolute top-3 left-3 flex items-center gap-1.5">
        <img src={logoImg} alt="" className="w-5 h-5 object-contain" />
        {subtitle && (
          <span className="text-[10px] font-semibold tracking-widest uppercase text-white drop-shadow-md">
            {subtitle}
          </span>
        )}
      </div>

      {/* Bottom-left: Label */}
      {label && (
        <div className="absolute bottom-3 left-3 right-3">
          <p className="text-white text-sm font-bold drop-shadow-lg truncate">{label}</p>
        </div>
      )}
    </div>
  );
};

export default BrandedPlaylistCover;
