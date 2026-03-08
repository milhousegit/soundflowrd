import React from 'react';
import { Radio, Sparkles } from 'lucide-react';
import logoImg from '@/assets/logo.png';

interface BrandedPlaylistCoverProps {
  type: 'radio' | 'daily-mix';
  /** Background image (artist/track cover) */
  backgroundUrl?: string | null;
  /** Label shown on the cover, e.g. "Daily Mix 1" or "Radio di ..." */
  label?: string;
  /** Gradient colors as [color1, color2] */
  gradientColors?: [string, string];
  /** CSS class for the outer container */
  className?: string;
}

const TYPE_DEFAULTS: Record<string, { colors: [string, string]; icon: React.ReactNode }> = {
  radio: {
    colors: ['#0D9488', '#06B6D4'],
    icon: <Radio className="w-5 h-5 text-white/90" />,
  },
  'daily-mix': {
    colors: ['#6366F1', '#EC4899'],
    icon: <Sparkles className="w-5 h-5 text-white/90" />,
  },
};

const BrandedPlaylistCover: React.FC<BrandedPlaylistCoverProps> = ({
  type,
  backgroundUrl,
  label,
  gradientColors,
  className = '',
}) => {
  const defaults = TYPE_DEFAULTS[type] || TYPE_DEFAULTS['daily-mix'];
  const [c1, c2] = gradientColors || defaults.colors;

  return (
    <div
      className={`relative w-full h-full overflow-hidden ${className}`}
      style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}
    >
      {/* Background image blended */}
      {backgroundUrl && (
        <img
          src={backgroundUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover mix-blend-overlay opacity-40"
        />
      )}

      {/* Decorative circles */}
      <div
        className="absolute -top-[20%] -right-[20%] w-[60%] h-[60%] rounded-full opacity-20"
        style={{ background: `radial-gradient(circle, ${c2}, transparent 70%)` }}
      />
      <div
        className="absolute -bottom-[15%] -left-[15%] w-[50%] h-[50%] rounded-full opacity-15"
        style={{ background: `radial-gradient(circle, ${c1}, transparent 70%)` }}
      />

      {/* Gradient overlay bottom */}
      <div
        className="absolute inset-0"
        style={{ background: `linear-gradient(180deg, transparent 40%, ${c1}dd 100%)` }}
      />

      {/* SoundFlow logo watermark */}
      <div className="absolute top-3 right-3 w-8 h-8 opacity-40">
        <img src={logoImg} alt="" className="w-full h-full object-contain" />
      </div>

      {/* Type icon */}
      <div className="absolute top-3 left-3">
        {defaults.icon}
      </div>

      {/* Label at bottom */}
      {label && (
        <div className="absolute bottom-3 left-3 right-3">
          <p className="text-white text-sm font-bold drop-shadow-lg truncate">{label}</p>
        </div>
      )}
    </div>
  );
};

export default BrandedPlaylistCover;
