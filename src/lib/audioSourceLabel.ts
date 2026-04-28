import type { AudioSource } from '@/contexts/PlayerContext';

export function getAudioSourceLabel(source: AudioSource): string {
  if (!source) return '';
  switch (source) {
    case 'monochrome': return 'Monochrome';
    case 'hifi': return 'HiFi';
    case 'real-debrid': return 'Real-Debrid';
    case 'offline': return 'Offline';
    case 'amazon-music': return 'Amazon Music';
    case 'youtube-music': return 'YouTube Music';
    case 'tidal': return 'Tidal';
    case 'deezer': return 'Deezer';
    default:
      // Format unknown plugin ids: 'my-source' -> 'My Source'
      return String(source)
        .split(/[-_]/)
        .map(s => s.charAt(0).toUpperCase() + s.slice(1))
        .join(' ');
  }
}

export function getAudioSourceClass(source: AudioSource): string {
  switch (source) {
    case 'monochrome': return 'bg-sky-500/20 text-sky-400';
    case 'hifi': return 'bg-violet-500/20 text-violet-400';
    case 'offline': return 'bg-emerald-500/20 text-emerald-400';
    case 'real-debrid': return 'bg-orange-500/20 text-orange-400';
    case 'amazon-music': return 'bg-amber-500/20 text-amber-400';
    case 'youtube-music': return 'bg-red-500/20 text-red-400';
    case 'tidal': return 'bg-cyan-500/20 text-cyan-400';
    case 'deezer': return 'bg-fuchsia-500/20 text-fuchsia-400';
    default: return 'bg-primary/20 text-primary';
  }
}
