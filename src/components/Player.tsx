import React, { useState } from 'react';
import { usePlayer } from '@/contexts/PlayerContext';
import { useSettings } from '@/contexts/SettingsContext';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import BugsModal from './BugsModal';
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Volume2, 
  VolumeX,
  Music,
  Bug,
  ChevronUp,
  ChevronDown,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { StreamResult } from '@/lib/realdebrid';

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const Player: React.FC = () => {
  const { 
    currentTrack, 
    isPlaying, 
    progress, 
    duration, 
    volume,
    toggle, 
    next, 
    previous, 
    seek,
    setVolume,
    alternativeStreams,
    availableTorrents,
    selectStream,
    selectTorrentFile,
    refreshTorrent,
    currentStreamId,
    isSearchingStreams,
    manualSearch,
  } = usePlayer();
  const { t } = useSettings();
  
  const [showBugsModal, setShowBugsModal] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  if (!currentTrack) return null;

  const handleSelectStream = (stream: StreamResult) => {
    selectStream(stream);
    setShowBugsModal(false);
  };

  const handleManualSearch = (query: string) => {
    manualSearch(query);
  };

  const handleSelectFile = async (torrentId: string, fileIds: number[]) => {
    await selectTorrentFile(torrentId, fileIds);
  };

  // Mobile expanded view
  if (isExpanded) {
    return (
      <>
        <div className="fixed inset-0 z-50 bg-background flex flex-col md:hidden animate-slide-up">
          {/* Header */}
          <div className="flex items-center justify-between p-4">
            <Button variant="ghost" size="icon" onClick={() => setIsExpanded(false)}>
              <ChevronDown className="w-6 h-6" />
            </Button>
            <div className="flex items-center gap-2">
              {isSearchingStreams && (
                <Loader2 className="w-4 h-4 text-primary animate-spin" />
              )}
              <span className="text-sm text-muted-foreground">Now Playing</span>
            </div>
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => setShowBugsModal(true)}
              className="text-muted-foreground hover:text-destructive"
            >
              <Bug className="w-5 h-5" />
            </Button>
          </div>

          {/* Cover */}
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="w-full max-w-sm aspect-square rounded-2xl bg-secondary overflow-hidden shadow-2xl relative">
              {currentTrack.coverUrl ? (
                <img 
                  src={currentTrack.coverUrl} 
                  alt={currentTrack.album}
                  className={cn(
                    "w-full h-full object-cover",
                    isPlaying && "animate-spin-slow"
                  )}
                  style={{ animationDuration: '20s' }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Music className="w-24 h-24 text-muted-foreground" />
                </div>
              )}
              {isSearchingStreams && (
                <div className="absolute inset-0 bg-background/50 flex items-center justify-center">
                  <div className="bg-card rounded-xl p-4 flex flex-col items-center">
                    <Loader2 className="w-8 h-8 text-primary animate-spin mb-2" />
                    <span className="text-sm text-foreground">
                      {t('language') === 'it' ? "Cercando..." : "Searching..."}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Track Info */}
          <div className="px-8 text-center">
            <h2 className="text-xl font-bold text-foreground truncate">{currentTrack.title}</h2>
            <p className="text-muted-foreground truncate">{currentTrack.artist}</p>
          </div>

          {/* Progress */}
          <div className="px-8 py-4">
            <Slider
              value={[progress]}
              max={duration || 100}
              step={1}
              onValueChange={([value]) => seek(value)}
            />
            <div className="flex justify-between mt-2">
              <span className="text-xs text-muted-foreground">{formatTime(progress)}</span>
              <span className="text-xs text-muted-foreground">{formatTime(duration)}</span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-8 p-8 pb-12">
            <Button variant="playerSecondary" size="icon" onClick={previous}>
              <SkipBack className="w-8 h-8" />
            </Button>
            <Button variant="player" className="h-16 w-16" onClick={toggle}>
              {isPlaying ? (
                <Pause className="w-8 h-8" />
              ) : (
                <Play className="w-8 h-8 ml-1" />
              )}
            </Button>
            <Button variant="playerSecondary" size="icon" onClick={next}>
              <SkipForward className="w-8 h-8" />
            </Button>
          </div>
        </div>
        
        <BugsModal
          isOpen={showBugsModal}
          onClose={() => setShowBugsModal(false)}
          alternatives={alternativeStreams}
          torrents={availableTorrents}
          onSelect={handleSelectStream}
          onSelectFile={handleSelectFile}
          onRefreshTorrent={refreshTorrent}
          currentStreamId={currentStreamId}
          isLoading={isSearchingStreams}
          onManualSearch={handleManualSearch}
          currentTrackInfo={{ title: currentTrack.title, artist: currentTrack.artist }}
        />
      </>
    );
  }

  return (
    <>
      {/* Mobile mini player */}
      <div 
        className="fixed bottom-14 left-0 right-0 h-16 glass border-t border-border z-40 md:hidden"
        onClick={() => setIsExpanded(true)}
      >
        <div className="h-full flex items-center px-4 gap-3">
          <div className="w-12 h-12 rounded-lg bg-secondary overflow-hidden flex-shrink-0 relative">
            {currentTrack.coverUrl ? (
              <img src={currentTrack.coverUrl} alt={currentTrack.album} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Music className="w-5 h-5 text-muted-foreground" />
              </div>
            )}
            {isSearchingStreams && (
              <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
                <Loader2 className="w-5 h-5 text-primary animate-spin" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-foreground truncate text-sm">{currentTrack.title}</p>
            <p className="text-xs text-muted-foreground truncate">{currentTrack.artist}</p>
          </div>
          <Button 
            variant="playerSecondary" 
            size="icon"
            onClick={(e) => { e.stopPropagation(); toggle(); }}
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
          </Button>
          <ChevronUp className="w-5 h-5 text-muted-foreground" />
        </div>
        {/* Progress bar */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-secondary">
          <div 
            className="h-full bg-primary transition-all"
            style={{ width: `${(progress / (duration || 1)) * 100}%` }}
          />
        </div>
      </div>

      {/* Desktop player */}
      <div className="fixed bottom-0 left-0 right-0 h-24 glass border-t border-border z-50 animate-slide-up hidden md:block">
        <div className="h-full flex items-center px-6 gap-6">
          {/* Track Info */}
          <div className="flex items-center gap-4 w-72 min-w-0">
            <div className="w-14 h-14 rounded-lg bg-secondary flex items-center justify-center overflow-hidden flex-shrink-0 relative">
              {currentTrack.coverUrl ? (
                <img 
                  src={currentTrack.coverUrl} 
                  alt={currentTrack.album}
                  className={cn(
                    "w-full h-full object-cover",
                    isPlaying && "animate-spin-slow"
                  )}
                  style={{ animationDuration: '8s' }}
                />
              ) : (
                <Music className="w-6 h-6 text-muted-foreground" />
              )}
              {isSearchingStreams && (
                <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 text-primary animate-spin" />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="font-medium text-foreground truncate">{currentTrack.title}</p>
              <p className="text-sm text-muted-foreground truncate">{currentTrack.artist}</p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex-1 flex flex-col items-center gap-2 max-w-2xl">
            <div className="flex items-center gap-4">
              <Button variant="playerSecondary" size="icon" onClick={previous}>
                <SkipBack className="w-5 h-5" />
              </Button>
              <Button variant="player" size="icon" onClick={toggle}>
                {isPlaying ? (
                  <Pause className="w-5 h-5" />
                ) : (
                  <Play className="w-5 h-5 ml-0.5" />
                )}
              </Button>
              <Button variant="playerSecondary" size="icon" onClick={next}>
                <SkipForward className="w-5 h-5" />
              </Button>
            </div>

            <div className="w-full flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-10 text-right">
                {formatTime(progress)}
              </span>
              <Slider
                value={[progress]}
                max={duration || 100}
                step={1}
                onValueChange={([value]) => seek(value)}
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground w-10">
                {formatTime(duration)}
              </span>
            </div>
          </div>

          {/* Volume & Bugs */}
          <div className="flex items-center gap-3 w-48">
            <Button 
              variant="playerSecondary" 
              size="icon"
              onClick={() => setShowBugsModal(true)}
              className={cn(
                "text-muted-foreground hover:text-destructive relative",
                isSearchingStreams && "text-primary"
              )}
              title={t('bugs')}
            >
              {isSearchingStreams ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Bug className="w-5 h-5" />
              )}
            </Button>
            <Button 
              variant="playerSecondary" 
              size="icon"
              onClick={() => setVolume(volume === 0 ? 0.7 : 0)}
            >
              {volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </Button>
            <Slider
              value={[volume * 100]}
              max={100}
              step={1}
              onValueChange={([value]) => setVolume(value / 100)}
              className="flex-1"
            />
          </div>
        </div>
      </div>

      <BugsModal
        isOpen={showBugsModal}
        onClose={() => setShowBugsModal(false)}
        alternatives={alternativeStreams}
        torrents={availableTorrents}
        onSelect={handleSelectStream}
        onSelectFile={handleSelectFile}
        onRefreshTorrent={refreshTorrent}
        currentStreamId={currentStreamId}
        isLoading={isSearchingStreams}
        onManualSearch={handleManualSearch}
        currentTrackInfo={{ title: currentTrack.title, artist: currentTrack.artist }}
      />
    </>
  );
};

export default Player;
