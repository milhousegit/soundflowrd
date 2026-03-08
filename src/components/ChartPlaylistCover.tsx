import React from 'react';
import logoImg from '@/assets/logo.png';

/**
 * Flag-themed gradient covers for chart playlists.
 * Each country gets a gradient inspired by its flag colors,
 * SoundFlow logo top-left, "Top [Country]" bottom-left.
 */

interface ChartCoverConfig {
  gradient: string;
  label: string;
}

const CHART_COVERS: Record<string, ChartCoverConfig> = {
  IT: {
    gradient: 'linear-gradient(135deg, #009246 0%, #009246 33%, #FFFFFF 33%, #FFFFFF 50%, #CE2B37 50%, #CE2B37 100%)',
    label: 'Top Italia',
  },
  GB: {
    gradient: 'linear-gradient(135deg, #00247D 0%, #00247D 40%, #CF142B 40%, #CF142B 60%, #FFFFFF 60%, #FFFFFF 100%)',
    label: 'Top UK',
  },
  ES: {
    gradient: 'linear-gradient(180deg, #AA151B 0%, #AA151B 25%, #F1BF00 25%, #F1BF00 75%, #AA151B 75%, #AA151B 100%)',
    label: 'Top España',
  },
  FR: {
    gradient: 'linear-gradient(135deg, #002395 0%, #002395 33%, #FFFFFF 33%, #FFFFFF 66%, #ED2939 66%, #ED2939 100%)',
    label: 'Top France',
  },
  US: {
    gradient: 'linear-gradient(180deg, #3C3B6E 0%, #3C3B6E 40%, #B22234 40%, #B22234 55%, #FFFFFF 55%, #FFFFFF 65%, #B22234 65%, #B22234 100%)',
    label: 'Top USA',
  },
  BR: {
    gradient: 'linear-gradient(135deg, #009739 0%, #009739 45%, #FEDD00 45%, #FEDD00 55%, #009739 55%, #009739 100%)',
    label: 'Top Brazil',
  },
  DE: {
    gradient: 'linear-gradient(180deg, #000000 0%, #000000 33%, #DD0000 33%, #DD0000 66%, #FFCC00 66%, #FFCC00 100%)',
    label: 'Top Germany',
  },
  PT: {
    gradient: 'linear-gradient(135deg, #006600 0%, #006600 40%, #FF0000 40%, #FF0000 100%)',
    label: 'Top Portugal',
  },
};

interface ChartPlaylistCoverProps {
  countryCode: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const ChartPlaylistCover: React.FC<ChartPlaylistCoverProps> = ({
  countryCode,
  className = '',
  size = 'md',
}) => {
  const config = CHART_COVERS[countryCode];
  if (!config) return null;

  const textSize = size === 'sm' ? 'text-xs' : size === 'lg' ? 'text-lg' : 'text-sm';
  const logoSize = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-7 h-7' : 'w-5 h-5';
  const padding = size === 'sm' ? 'p-2' : size === 'lg' ? 'p-4' : 'p-3';

  return (
    <div
      className={`relative w-full aspect-square overflow-hidden rounded-lg ${className}`}
      style={{ background: config.gradient }}
    >
      {/* Dark overlay for text readability */}
      <div className="absolute inset-0 bg-black/35" />

      {/* Top-left: SoundFlow logo */}
      <div className={`absolute top-0 left-0 ${padding}`}>
        <img src={logoImg} alt="" className={`${logoSize} object-contain drop-shadow-lg`} />
      </div>

      {/* Bottom-left: Label */}
      <div className={`absolute bottom-0 left-0 right-0 ${padding}`}>
        <p className={`text-white ${textSize} font-bold drop-shadow-lg truncate`}>
          {config.label}
        </p>
      </div>
    </div>
  );
};

export default ChartPlaylistCover;

/** Check if a country has a chart cover config */
export const hasChartCover = (countryCode: string): boolean => {
  return countryCode in CHART_COVERS;
};

/** Get chart label for a country */
export const getChartLabel = (countryCode: string): string => {
  return CHART_COVERS[countryCode]?.label || `Top ${countryCode}`;
};
