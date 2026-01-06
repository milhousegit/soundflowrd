import React, { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlayer } from '@/contexts/PlayerContext';
import { useSettings } from '@/contexts/SettingsContext';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import BugsModal from './BugsModal';
import QueueModal from './QueueModal';
import { YouTubePlayer, YouTubePlayerRef } from './YouTubePlayer';
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
  Loader2,
  Cloud,
  ListMusic,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { StreamResult } from '@/lib/realdebrid';

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const Player: React.FC = () => {
  const navigate = useNavigate();
  const { 
    currentTrack, 
    isPlaying, 
    progress, 
    duration, 
    volume,
    queue,
    queueIndex,
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
    debugLogs,
    downloadProgress,
    downloadStatus,
    loadSavedMapping,
    currentMappedFileId,
    playQueueIndex,
    clearQueue,
    loadingPhase,
    youtubeResults,
    playYouTubeVideo,
    currentYouTubeVideoId,
    isPlayingYouTube,
    lastSearchQuery,
    searchYouTubeManually,
  } = usePlayer();
  const { t } = useSettings();
  
  const [showBugsModal, setShowBugsModal] = useState(false);
  const [showQueueModal, setShowQueueModal] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  
  // YouTube player ref
  const youtubePlayerRef = useRef<YouTubePlayerRef>(null);
  
  // Swipe to close state
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // YouTube player callbacks
  const handleYouTubeReady = useCallback(() => {
    console.log('YouTube player ready');
  }, []);
  
  const handleYouTubeTimeUpdate = useCallback((currentTime: number, ytDuration: number) => {
    // Update progress from YouTube player - handled by context
  }, []);
  
  const handleYouTubeEnded = useCallback(() => {
    next();
  }, [next]);

  if (!currentTrack) return null;

  const handleNavigateToArtist = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentTrack.artistId) {
      navigate(`/artist/${currentTrack.artistId}`);
      setIsExpanded(false);
    }
  };

  const handleNavigateToAlbum = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentTrack.albumId) {
      navigate(`/album/${currentTrack.albumId}`);
      setIsExpanded(false);
    }
  };

  const handleSelectStream = (stream: StreamResult) => {
    selectStream(stream);
    setShowBugsModal(false);
  };

  const handleManualSearch = (query: string) => {
    manualSearch(query);
  };

  const handleOpenBugsModal = () => {
    // Just open the modal - don't trigger loadSavedMapping which could interfere with ongoing search
    // The modal will show current debug logs and torrents from the ongoing search
    setShowBugsModal(true);
  };

  const handleSelectFile = async (torrentId: string, fileIds: number[]) => {
    await selectTorrentFile(torrentId, fileIds);
  };

  // Touch handlers for swipe to close
  const handleTouchStart = (e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - startY.current;
    // Only allow dragging down
    if (diff > 0) {
      setDragY(diff);
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    // If dragged more than 150px, close the player
    if (dragY > 150) {
      setIsExpanded(false);
    }
    setDragY(0);
  };

  // Calculate opacity and scale based on drag
  const dragProgress = Math.min(dragY / 300, 1);
  const expandedStyle = {
    transform: `translateY(${dragY}px) scale(${1 - dragProgress * 0.05})`,
    opacity: 1 - dragProgress * 0.3,
    transition: isDragging ? 'none' : 'all 0.3s ease-out',
  };

  // Mobile expanded view
  if (isExpanded) {
    return (
      <>
        <div 
          ref={containerRef}
          className="fixed inset-0 z-[60] bg-background flex flex-col md:hidden"
          style={expandedStyle}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Drag indicator */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
          </div>

          {/* Header with safe area */}
          <div className="flex items-center justify-between px-4 pt-safe">
            <Button variant="ghost" size="icon" onClick={() => setIsExpanded(false)}>
              <ChevronDown className="w-6 h-6" />
            </Button>
            <div className="flex items-center gap-2">
              {isSearchingStreams && (
                <Loader2 className="w-4 h-4 text-primary animate-spin" />
              )}
              <span className="text-sm text-muted-foreground">Now Playing</span>
            </div>
            <div className="flex items-center gap-1">
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => setShowQueueModal(true)}
                className="text-muted-foreground hover:text-primary"
              >
                <ListMusic className="w-5 h-5" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon"
                onClick={handleOpenBugsModal}
                className="text-muted-foreground hover:text-destructive"
              >
                <Bug className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Cover */}
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="w-full max-w-sm aspect-square rounded-2xl bg-secondary overflow-hidden shadow-2xl relative">
              {currentTrack.coverUrl ? (
                <img 
                  src={currentTrack.coverUrl} 
                  alt={currentTrack.album}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Music className="w-24 h-24 text-muted-foreground" />
                </div>
              )}
              {/* Status overlay - always visible when not idle */}
              {loadingPhase === 'searching' && (
                <div className="absolute inset-0 bg-background/50 flex items-center justify-center">
                  <div className="bg-card rounded-xl p-4 flex flex-col items-center">
                    <Loader2 className="w-8 h-8 text-primary animate-spin mb-2" />
                    <span className="text-sm text-foreground">
                      {t('language') === 'it' ? "Cercando..." : "Searching..."}
                    </span>
                  </div>
                </div>
              )}
              {loadingPhase === 'downloading' && (
                <div className="absolute inset-0 bg-background/50 flex items-center justify-center">
                  <div className="bg-card rounded-xl p-4 flex flex-col items-center">
                    <Cloud className="w-8 h-8 text-blue-500 animate-pulse mb-2" />
                    <span className="text-sm text-foreground">
                      {t('language') === 'it' 
                        ? `Scaricando... ${downloadProgress !== null ? `${Math.round(downloadProgress)}%` : ''}` 
                        : `Downloading... ${downloadProgress !== null ? `${Math.round(downloadProgress)}%` : ''}`}
                    </span>
                  </div>
                </div>
              )}
              {loadingPhase === 'loading' && (
                <div className="absolute inset-0 bg-background/50 flex items-center justify-center">
                  <div className="bg-card rounded-xl p-4 flex flex-col items-center">
                    <Cloud className="w-8 h-8 text-primary animate-pulse mb-2" />
                    <span className="text-sm text-foreground">
                      {t('language') === 'it' ? "Caricamento..." : "Loading..."}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Track Info */}
          <div className="px-8 text-center">
            <h2 className="text-xl font-bold text-foreground truncate">{currentTrack.title}</h2>
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <button 
                onClick={handleNavigateToArtist}
                className="hover:text-primary hover:underline transition-colors truncate"
              >
                {currentTrack.artist}
              </button>
              {currentTrack.album && (
                <>
                  <span>•</span>
                  <button 
                    onClick={handleNavigateToAlbum}
                    className="hover:text-primary hover:underline transition-colors truncate"
                  >
                    {currentTrack.album}
                  </button>
                </>
              )}
            </div>
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

          {/* Controls with safe area for home indicator */}
          <div className="flex items-center justify-center gap-8 p-8 pb-safe" style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom, 0px))' }}>
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
          debugLogs={debugLogs}
          downloadProgress={downloadProgress}
          downloadStatus={downloadStatus}
          currentMappedFileId={currentMappedFileId}
          youtubeResults={youtubeResults}
          onPlayYouTube={playYouTubeVideo}
          lastSearchQuery={lastSearchQuery}
          onSearchYouTube={searchYouTubeManually}
        />
        
        <QueueModal
          isOpen={showQueueModal}
          onClose={() => setShowQueueModal(false)}
          queue={queue}
          currentIndex={queueIndex}
          onPlayTrack={playQueueIndex}
          onClearQueue={clearQueue}
        />
      </>
    );
  }

  // Calculate navbar height (56px content + safe area)
  const navbarHeight = 56;

  return (
    <>
      {/* Mobile mini player - positioned above navbar */}
      <div 
        className="fixed left-0 right-0 h-14 glass border-t border-border z-50 md:hidden"
        style={{ bottom: `calc(${navbarHeight}px + env(safe-area-inset-bottom, 0px))` }}
        onClick={() => setIsExpanded(true)}
      >
        <div className="h-full flex items-center px-3 gap-3">
          <div className="w-10 h-10 rounded-lg bg-secondary overflow-hidden flex-shrink-0 relative">
            {currentTrack.coverUrl ? (
              <img src={currentTrack.coverUrl} alt={currentTrack.album} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Music className="w-4 h-4 text-muted-foreground" />
              </div>
            )}
            {loadingPhase === 'searching' && (
              <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
                <Loader2 className="w-4 h-4 text-primary animate-spin" />
              </div>
            )}
            {loadingPhase === 'downloading' && (
              <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
                <Cloud className="w-4 h-4 text-blue-500 animate-pulse" />
              </div>
            )}
            {loadingPhase === 'loading' && (
              <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
                <Cloud className="w-4 h-4 text-primary animate-pulse" />
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
            className="h-9 w-9"
            onClick={(e) => { e.stopPropagation(); toggle(); }}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </Button>
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        </div>
        {/* Progress bar */}
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-secondary">
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
                  className="w-full h-full object-cover"
                />
              ) : (
                <Music className="w-6 h-6 text-muted-foreground" />
              )}
              {loadingPhase === 'searching' && (
                <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 text-primary animate-spin" />
                </div>
              )}
              {loadingPhase === 'downloading' && (
                <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
                  <Cloud className="w-5 h-5 text-blue-500 animate-pulse" />
                </div>
              )}
              {loadingPhase === 'loading' && (
                <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
                  <Cloud className="w-5 h-5 text-primary animate-pulse" />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="font-medium text-foreground truncate">{currentTrack.title}</p>
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <button 
                  onClick={handleNavigateToArtist}
                  className="hover:text-primary hover:underline transition-colors truncate"
                >
                  {currentTrack.artist}
                </button>
                {currentTrack.album && (
                  <>
                    <span>•</span>
                    <button 
                      onClick={handleNavigateToAlbum}
                      className="hover:text-primary hover:underline transition-colors truncate"
                    >
                      {currentTrack.album}
                    </button>
                  </>
                )}
              </div>
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

          {/* Queue, Volume & Bugs */}
          <div className="flex items-center gap-3 w-56">
            <Button 
              variant="playerSecondary" 
              size="icon"
              onClick={() => setShowQueueModal(true)}
              className="text-muted-foreground hover:text-primary"
              title="Coda"
            >
              <ListMusic className="w-5 h-5" />
            </Button>
            <Button 
              variant="playerSecondary" 
              size="icon"
              onClick={handleOpenBugsModal}
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
        debugLogs={debugLogs}
        downloadProgress={downloadProgress}
        downloadStatus={downloadStatus}
        currentMappedFileId={currentMappedFileId}
        youtubeResults={youtubeResults}
        onPlayYouTube={playYouTubeVideo}
        lastSearchQuery={lastSearchQuery}
        onSearchYouTube={searchYouTubeManually}
      />
      
      <QueueModal
        isOpen={showQueueModal}
        onClose={() => setShowQueueModal(false)}
        queue={queue}
        currentIndex={queueIndex}
        onPlayTrack={playQueueIndex}
        onClearQueue={clearQueue}
      />
      
      {/* Hidden YouTube Player */}
      {currentYouTubeVideoId && (
        <YouTubePlayer
          ref={youtubePlayerRef}
          videoId={currentYouTubeVideoId}
          volume={volume * 100}
          autoplay={true}
          onReady={handleYouTubeReady}
          onTimeUpdate={handleYouTubeTimeUpdate}
          onEnded={handleYouTubeEnded}
        />
      )}
    </>
  );
};

export default Player;
