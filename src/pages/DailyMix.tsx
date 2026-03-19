import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Play, Shuffle, ListPlus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDailyMixes } from '@/hooks/useDailyMixes';
import { usePlayer } from '@/contexts/PlayerContext';
import { useSettings } from '@/contexts/SettingsContext';
import { usePlaylists } from '@/hooks/usePlaylists';
import { useToast } from '@/hooks/use-toast';
import TrackCard from '@/components/TrackCard';
import BackButton from '@/components/BackButton';
import BrandedPlaylistCover from '@/components/BrandedPlaylistCover';
import { hdCover } from '@/lib/utils';
import { Track } from '@/types/music';

const DailyMixPage: React.FC = () => {
  const { index } = useParams<{ index: string }>();
  const navigate = useNavigate();
  const { mixes, isLoading } = useDailyMixes();
  const { playTrack, setPlaybackSource, currentTrack, isPlaying, toggle } = usePlayer();
  const { settings } = useSettings();
  const { createPlaylist, addTracksToPlaylist } = usePlaylists();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  const mixIndex = parseInt(index || '0', 10);
  const mix = mixes.find(m => m.mix_index === mixIndex);

  const [color1, color2] = useMemo(() => {
    if (!mix) return ['#6366F1', '#EC4899'];
    return mix.dominant_color.split(',');
  }, [mix]);

  const handlePlayAll = () => {
    if (!mix || mix.tracks.length === 0) return;
    setPlaybackSource({ type: 'playlist', name: mix.mix_label, path: `/daily-mix/${mixIndex}` });
    playTrack(mix.tracks[0], mix.tracks);
  };

  const handleShuffle = () => {
    if (!mix || mix.tracks.length === 0) return;
    const shuffled = [...mix.tracks].sort(() => Math.random() - 0.5);
    setPlaybackSource({ type: 'playlist', name: mix.mix_label, path: `/daily-mix/${mixIndex}` });
    playTrack(shuffled[0], shuffled);
  };

  const handleSaveAsPlaylist = async () => {
    if (!mix || mix.tracks.length === 0) return;
    setIsSaving(true);
    try {
      const playlist = await createPlaylist(mix.mix_label, mix.cover_url || undefined);
      if (playlist) {
        const success = await addTracksToPlaylist(playlist.id, mix.tracks);
        if (success) {
          toast({
            title: settings.language === 'it' ? 'Playlist creata!' : 'Playlist created!',
            description: `${mix.mix_label} — ${mix.tracks.length} ${settings.language === 'it' ? 'brani' : 'tracks'}`,
          });
          navigate(`/app/playlist/${playlist.id}`);
        }
      }
    } catch {
      toast({
        title: settings.language === 'it' ? 'Errore' : 'Error',
        description: settings.language === 'it' ? 'Impossibile creare la playlist' : 'Failed to create playlist',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!mix) {
    return (
      <div className="p-4">
        <BackButton />
        <p className="text-center text-muted-foreground mt-10">
          {settings.language === 'it' ? 'Mix non trovato' : 'Mix not found'}
        </p>
      </div>
    );
  }

  // Derive artists from actual tracks
  const trackArtists = [...new Set(mix.tracks.map(t => t.artist))];
  const artistLabel = trackArtists.slice(0, 4).join(', ');

  return (
    <div className="pb-32">
      {/* Header */}
      <div
        className="relative px-4 pt-4 pb-6"
        style={{ background: `linear-gradient(180deg, ${color1} 0%, ${color2}88 60%, transparent 100%)` }}
      >
        <BackButton />

        <div className="flex flex-col items-center mt-4 gap-3">
          <div className="w-44 h-44 md:w-52 md:h-52 rounded-2xl overflow-hidden shadow-2xl">
            <BrandedPlaylistCover
              type="daily-mix"
              backgroundUrl={mix.cover_url ? hdCover(mix.cover_url) : undefined}
              label={mix.mix_label}
              subtitle={mix.genre_tags[0] || `Mix ${mix.mix_index + 1}`}
              mixIndex={mix.mix_index}
            />
          </div>

          <div className="text-center">
            <p className="text-sm text-white/80 font-medium">
              {mix.genre_tags[0] || ''}
            </p>
            <p className="text-xs text-white/60 mt-0.5">
              {artistLabel}
            </p>
            <p className="text-xs text-white/50 mt-1">
              {mix.tracks.length} {settings.language === 'it' ? 'brani' : 'tracks'}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-center gap-3 mt-5">
          <Button
            variant="player"
            size="player"
            onClick={handlePlayAll}
            disabled={mix.tracks.length === 0}
          >
            <Play className="w-5 md:w-6 h-5 md:h-6 ml-0.5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={handleShuffle}
            disabled={mix.tracks.length === 0}
            className="w-12 h-12"
          >
            <Shuffle className="w-5 h-5 text-muted-foreground" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={handleSaveAsPlaylist}
            disabled={isSaving}
            className="w-12 h-12"
          >
            {isSaving ? (
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            ) : (
              <ListPlus className="w-5 h-5 text-muted-foreground" />
            )}
          </Button>
        </div>
      </div>

      {/* Tracklist */}
      <div className="px-2 md:px-4 mt-4 space-y-1">
        {mix.tracks.map((track, i) => (
          <TrackCard
            key={`${track.id}-${i}`}
            track={track}
            queue={mix.tracks}
            showArtist
            index={i + 1}
          />
        ))}
      </div>
    </div>
  );
};

export default DailyMixPage;
