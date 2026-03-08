import React, { useEffect, useRef, useState } from 'react';
import { Music } from 'lucide-react';
import logoImg from '@/assets/logo.png';

/** Predefined gradient palettes to pick from based on dominant color */
const PALETTES = [
  { hue: 200, colors: ['hsl(200, 85%, 45%)', 'hsl(168, 80%, 35%)'], tint: 'rgba(30, 120, 160, 0.55)' },   // blue/teal
  { hue: 305, colors: ['hsl(280, 70%, 45%)', 'hsl(330, 90%, 50%)'], tint: 'rgba(160, 40, 140, 0.55)' },    // purple/pink
  { hue: 25,  colors: ['hsl(10, 85%, 50%)', 'hsl(40, 90%, 50%)'], tint: 'rgba(180, 80, 30, 0.55)' },       // red/orange
  { hue: 130, colors: ['hsl(130, 60%, 40%)', 'hsl(170, 70%, 35%)'], tint: 'rgba(30, 130, 80, 0.55)' },     // green/teal
  { hue: 50,  colors: ['hsl(45, 90%, 50%)', 'hsl(30, 85%, 45%)'], tint: 'rgba(180, 140, 20, 0.55)' },      // gold/amber
  { hue: 350, colors: ['hsl(350, 80%, 50%)', 'hsl(330, 70%, 40%)'], tint: 'rgba(180, 30, 60, 0.55)' },     // crimson/rose
  { hue: 220, colors: ['hsl(220, 70%, 45%)', 'hsl(250, 60%, 40%)'], tint: 'rgba(50, 60, 160, 0.55)' },     // deep blue/indigo
];

/** Fallback by mix index when no cover or extraction fails */
const FALLBACK_IDX = [0, 1, 2, 3, 4, 5, 6];

function closestPalette(hue: number) {
  let best = PALETTES[0];
  let bestDist = 360;
  for (const p of PALETTES) {
    const dist = Math.min(Math.abs(hue - p.hue), 360 - Math.abs(hue - p.hue));
    if (dist < bestDist) {
      bestDist = dist;
      best = p;
    }
  }
  return best;
}

function extractDominantHue(img: HTMLImageElement): number | null {
  try {
    const canvas = document.createElement('canvas');
    const size = 32; // small sample
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;

    let rSum = 0, gSum = 0, bSum = 0, count = 0;
    for (let i = 0; i < data.length; i += 16) { // sample every 4th pixel
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      if (a < 128) continue; // skip transparent
      // Skip very dark or very light pixels (they don't contribute meaningful hue)
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max < 30 || min > 225) continue;
      rSum += r; gSum += g; bSum += b; count++;
    }

    if (count === 0) return null;
    const rAvg = rSum / count;
    const gAvg = gSum / count;
    const bAvg = bSum / count;

    // RGB to Hue
    const r01 = rAvg / 255, g01 = gAvg / 255, b01 = bAvg / 255;
    const cmax = Math.max(r01, g01, b01);
    const cmin = Math.min(r01, g01, b01);
    const delta = cmax - cmin;
    if (delta < 0.05) return null; // grayscale

    let hue = 0;
    if (cmax === r01) hue = 60 * (((g01 - b01) / delta) % 6);
    else if (cmax === g01) hue = 60 * (((b01 - r01) / delta) + 2);
    else hue = 60 * (((r01 - g01) / delta) + 4);
    if (hue < 0) hue += 360;

    return Math.round(hue);
  } catch {
    return null;
  }
}

interface BrandedPlaylistCoverProps {
  type: 'radio' | 'daily-mix';
  backgroundUrl?: string | null;
  label?: string;
  subtitle?: string;
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
  const [palette, setPalette] = useState(() => {
    const idx = FALLBACK_IDX[mixIndex % FALLBACK_IDX.length];
    return PALETTES[idx % PALETTES.length];
  });
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!backgroundUrl) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const hue = extractDominantHue(img);
      if (hue !== null) {
        setPalette(closestPalette(hue));
      }
    };
    img.src = backgroundUrl;
    imgRef.current = img;
  }, [backgroundUrl]);

  const gradient = `linear-gradient(160deg, ${palette.colors[0]} 0%, ${palette.colors[1]} 100%)`;

  return (
    <div
      className={`relative w-full aspect-square overflow-hidden ${className}`}
      style={!backgroundUrl ? { background: gradient } : undefined}
    >
      {backgroundUrl ? (
        <>
          <img
            src={backgroundUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
          {/* Color toning overlay matching dominant hue */}
          <div
            className="absolute inset-0 mix-blend-multiply"
            style={{ background: gradient, opacity: 0.55 }}
          />
          {/* Dark gradient for text contrast */}
          <div
            className="absolute inset-0"
            style={{ background: `linear-gradient(180deg, ${palette.tint} 0%, rgba(0,0,0,0.65) 100%)` }}
          />
        </>
      ) : (
        <>
          <div className="absolute inset-0 flex items-center justify-center">
            <Music className="w-12 h-12 text-white/80 drop-shadow-lg" />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
        </>
      )}

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
