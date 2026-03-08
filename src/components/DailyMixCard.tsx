import React from 'react';
import { Play } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { DailyMix } from '@/hooks/useDailyMixes';
import { usePlayer } from '@/contexts/PlayerContext';
import { hdCover } from '@/lib/utils';
import BrandedPlaylistCover from '@/components/BrandedPlaylistCover';

interface DailyMixCardProps {
  mix: DailyMix;
}

const DailyMixCard: React.FC<DailyMixCardProps> = ({ mix }) => {
  const { playTrack, setPlaybackSource } = usePlayer();
  const navigate = useNavigate();

  const [color1, color2] = mix.dominant_color.split(',');
  const artistLabel = mix.top_artists.length > 0
    ? `Con ${mix.top_artists.slice(0, 3).join(', ')}${mix.top_artists.length > 3 ? '...' : ''}`
    : mix.genre_tags[0] || '';

  const handleClick = () => {
    navigate(`/daily-mix/${mix.mix_index}`);
  };

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (mix.tracks.length === 0) return;
    setPlaybackSource({
      type: 'playlist',
      name: mix.mix_label,
      path: `/daily-mix/${mix.mix_index}`,
    });
    playTrack(mix.tracks[0], mix.tracks);
  };

  return (
    <button
      onClick={handleClick}
      className="group cursor-pointer touch-manipulation text-left w-full"
    >
      {/* Cover with branded overlay */}
      <div className="relative aspect-square rounded-lg overflow-hidden mb-2 md:mb-3 bg-muted shadow-lg">
        <BrandedPlaylistCover
          type="daily-mix"
          backgroundUrl={mix.cover_url ? hdCover(mix.cover_url) : undefined}
          label={mix.mix_label}
          subtitle={mix.genre_tags[0] || `Mix ${mix.mix_index + 1}`}
          mixIndex={mix.mix_index}
        />

        {/* Play button on hover */}
        <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          onClick={handlePlay}
        >
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shadow-xl">
            <Play className="w-5 h-5 text-primary-foreground ml-0.5" />
          </div>
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
