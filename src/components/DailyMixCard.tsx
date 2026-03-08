import React from 'react';
import { Play } from 'lucide-react';
import { DailyMix } from '@/hooks/useDailyMixes';
import { usePlayer } from '@/contexts/PlayerContext';
import { hdCover } from '@/lib/utils';

interface DailyMixCardProps {
  mix: DailyMix;
}

const DailyMixCard: React.FC<DailyMixCardProps> = ({ mix }) => {
  const { playTrack, setPlaybackSource } = usePlayer();

  const [color1, color2] = mix.dominant_color.split(',');
  const artistLabel = mix.top_artists.length > 0
    ? `Con ${mix.top_artists.slice(0, 3).join(', ')}${mix.top_artists.length > 3 ? '...' : ''}`
    : mix.genre_tags[0] || '';

  const handlePlay = () => {
    if (mix.tracks.length === 0) return;
    setPlaybackSource({
      type: 'playlist',
      name: mix.mix_label,
      path: '/',
    });
    playTrack(mix.tracks[0], mix.tracks);
  };

  return (
    <button
      onClick={handlePlay}
      className="flex-shrink-0 w-44 md:w-auto group text-left touch-manipulation"
    >
      {/* Cover with gradient overlay */}
      <div
        className="relative aspect-square rounded-2xl overflow-hidden mb-2 md:mb-3 shadow-lg"
        style={{
          background: `linear-gradient(135deg, ${color1}, ${color2})`,
        }}
      >
        {mix.cover_url ? (
          <img
            src={hdCover(mix.cover_url)}
            alt={mix.mix_label}
            className="absolute inset-0 w-full h-full object-cover mix-blend-overlay opacity-60"
          />
        ) : null}

        {/* Gradient overlay always on top */}
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(180deg, transparent 30%, ${color1}cc 100%)`,
          }}
        />

        {/* Mix number */}
        <div className="absolute top-3 left-3">
          <span className="text-white/90 text-xs font-bold tracking-wider uppercase drop-shadow-md">
            {mix.genre_tags[0] || `Mix ${mix.mix_index + 1}`}
          </span>
        </div>

        {/* Play button on hover */}
        <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shadow-xl">
            <Play className="w-5 h-5 text-primary-foreground ml-0.5" />
          </div>
        </div>

        {/* Track count badge */}
        <div className="absolute bottom-3 left-3">
          <span className="text-white text-lg font-bold drop-shadow-lg">
            {mix.mix_label}
          </span>
        </div>
      </div>

      {/* Artist names */}
      <p className="text-xs text-muted-foreground truncate px-0.5">
        {artistLabel}
      </p>
    </button>
  );
};

export default DailyMixCard;
