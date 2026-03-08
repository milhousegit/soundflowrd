import React from 'react';
import logoImg from '@/assets/logo.png';

interface BrandedPlaylistCoverProps {
  type: 'radio' | 'daily-mix';
  /** Background image (artist/track cover) */
  backgroundUrl?: string | null;
  /** Label shown on the cover */
  label?: string;
  /** Sub-label (genre / artist info) */
  subtitle?: string;
  className?: string;
}

const BrandedPlaylistCover: React.FC<BrandedPlaylistCoverProps> = ({
  type,
  backgroundUrl,
  label,
  subtitle,
  className = '',
}) => {
  return (
    <div
      className={`relative w-full h-full overflow-hidden bg-background ${className}`}
    >
      {/* Background image */}
      {backgroundUrl && (
        <img
          src={backgroundUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}

      {/* Subtle gradient overlay at bottom for text readability */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

      {/* Top-left: Logo + subtitle */}
      <div className="absolute top-3 left-3 flex items-center gap-1.5">
        <img src={logoImg} alt="" className="w-5 h-5 object-contain" />
        {subtitle && (
          <span className="text-[10px] font-semibold tracking-widest uppercase text-primary drop-shadow-md">
            {subtitle}
          </span>
        )}
      </div>

      {/* Bottom-left: Label */}
      {label && (
        <div className="absolute bottom-3 left-3 right-3">
          <p className="text-foreground text-sm font-bold drop-shadow-lg truncate">{label}</p>
        </div>
      )}
    </div>
  );
};

export default BrandedPlaylistCover;
