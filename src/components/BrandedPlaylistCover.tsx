import React from 'react';
import logoImg from '@/assets/logo.png';

interface BrandedPlaylistCoverProps {
  type: 'radio' | 'daily-mix';
  /** Background image (artist/track cover) */
  backgroundUrl?: string | null;
  /** Label shown on the cover */
  label?: string;
  /** Gradient colors as [color1, color2] */
  gradientColors?: [string, string];
  className?: string;
}

const TYPE_DEFAULTS: Record<string, [string, string]> = {
  radio: ['#0D9488', '#06B6D4'],
  'daily-mix': ['#6366F1', '#EC4899'],
};

const BrandedPlaylistCover: React.FC<BrandedPlaylistCoverProps> = ({
  type,
  backgroundUrl,
  label,
  gradientColors,
  className = '',
}) => {
  const [c1, c2] = gradientColors || TYPE_DEFAULTS[type] || TYPE_DEFAULTS['daily-mix'];

  return (
    <div
      className={`relative w-full h-full overflow-hidden ${className}`}
      style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}
    >
      {/* Background image - bright, no darkening */}
      {backgroundUrl && (
        <img
          src={backgroundUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-50"
        />
      )}

      {/* Logo silhouette - bottom right, subtle watermark */}
      <div className="absolute bottom-2 right-2 w-10 h-10 opacity-25">
        <img src={logoImg} alt="" className="w-full h-full object-contain" />
      </div>

      {/* Label at bottom left */}
      {label && (
        <div className="absolute bottom-3 left-3 right-14">
          <p className="text-white text-sm font-bold drop-shadow-md truncate">{label}</p>
        </div>
      )}
    </div>
  );
};

export default BrandedPlaylistCover;
