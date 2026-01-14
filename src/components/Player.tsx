import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlayer } from '@/contexts/PlayerContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import DebugModal from './DebugModal';
import QueueModal from './QueueModal';
import FavoriteButton from './FavoriteButton';
import LyricsModal from './LyricsModal';
import { useToast } from '@/hooks/use-toast';
import { useOfflineStorage } from '@/hooks/useOfflineStorage';
import { isPast } from 'date-fns';

import {
  Settings2,
  ChevronDown,
  ChevronUp,
  Cloud,
  Download,
  ListMusic,
  Loader2,
  Music,
  Mic2,
  Pause,
  Play,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
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
  const { toast } = useToast();
  const { profile, isAdmin: contextIsAdmin, simulateFreeUser } = useAuth();
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
    clearDebugLogs,
    downloadProgress,
    downloadStatus,
    loadSavedMapping,
    currentMappedFileId,
    playQueueIndex,
    clearQueue,
    loadingPhase,
    isShuffled,
    toggleShuffle,
    lastSearchQuery,
    currentAudioSource,
    updateTrackMetadata,
  } = usePlayer();

  const { t, settings } = useSettings();
  
  // Check if user has active premium
  const isPremiumActive = !simulateFreeUser && (profile?.is_premium && 
    (!profile?.premium_expires_at || !isPast(new Date(profile.premium_expires_at))));
  const canDownload = contextIsAdmin || isPremiumActive;
  
  const { saveTrackOffline } = useOfflineStorage();
  const [isDownloading, setIsDownloading] = useState(false);
  
  // Get current stream URL from alternatives
  const currentStreamUrl = alternativeStreams.find(s => s.id === currentStreamId)?.streamUrl;

  const [showDebugModal, setShowDebugModal] = useState(false);
  const [showQueueModal, setShowQueueModal] = useState(false);
  const [showLyricsModal, setShowLyricsModal] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Swipe to close state
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Resume playback when page becomes visible again (iOS/Safari quirks)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isPlaying) {
        // Best-effort: browsers may pause audio; toggling play can resume.
        // We intentionally keep this minimal and non-invasive.
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isPlaying]);

  const handleSeek = useCallback(
    (time: number) => {
      seek(time);
    },
    [seek]
  );

  const handleToggle = useCallback(() => {
    toggle();
  }, [toggle]);

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
    setShowDebugModal(false);
  };

  const handleManualSearch = (query: string) => {
    manualSearch(query);
  };

  const handleOpenDebugModal = () => {
    clearDebugLogs();
    loadSavedMapping();
    setShowDebugModal(true);
  };

  const handleSelectFile = async (torrentId: string, fileIds: number[]) => {
    await selectTorrentFile(torrentId, fileIds);
  };

  // Download handler for premium users
  const handleDownload = async () => {
    if (!currentTrack || !currentStreamUrl || isDownloading) return;
    
    setIsDownloading(true);
    try {
      const response = await fetch(currentStreamUrl);
      if (!response.ok) throw new Error('Download failed');
      
      const blob = await response.blob();
      const filename = `${currentTrack.artist} - ${currentTrack.title}.mp3`;
      
      // Save to IndexedDB for offline playback
      await saveTrackOffline(currentTrack, blob);
      
      // Also trigger browser download
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast({
        title: settings.language === 'it' ? 'Salvato offline!' : 'Saved offline!',
        description: settings.language === 'it' 
          ? `"${currentTrack.title}" disponibile anche senza connessione` 
          : `"${currentTrack.title}" available offline`,
      });
    } catch (error) {
      console.error('Download error:', error);
      toast({
        title: settings.language === 'it' ? 'Errore download' : 'Download error',
        description: settings.language === 'it' ? 'Impossibile scaricare il brano' : 'Could not download track',
        variant: 'destructive',
      });
    } finally {
      setIsDownloading(false);
    }
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
    if (diff > 0) setDragY(diff);
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    if (dragY > 150) setIsExpanded(false);
    setDragY(0);
  };

  const dragProgress = Math.min(dragY / 300, 1);
  const expandedStyle = {
    transform: `translateY(${dragY}px) scale(${1 - dragProgress * 0.05})`,
    opacity: 1 - dragProgress * 0.3,
    transition: isDragging ? 'none' : 'all 0.3s ease-out',
  };

  const navbarHeight = 56;

  return (
    <>
      {/* Mobile expanded view */}
      {isExpanded && (
        <div
          ref={containerRef}
          className="fixed inset-0 z-[60] bg-background flex flex-col md:hidden"
          style={expandedStyle}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
          </div>

          <div className="flex items-center justify-between px-4 pt-safe">
            <Button variant="ghost" size="icon" onClick={() => setIsExpanded(false)} className="w-10">
              <ChevronDown className="w-6 h-6" />
            </Button>
            <div className="flex items-center gap-2 absolute left-1/2 -translate-x-1/2">
              {isSearchingStreams && <Loader2 className="w-4 h-4 text-primary animate-spin" />}
              <span className="text-sm text-muted-foreground">Now Playing</span>
            </div>
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowQueueModal(true)}
                className="text-muted-foreground hover:text-primary w-10"
              >
                <ListMusic className="w-5 h-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleOpenDebugModal}
                className="text-muted-foreground hover:text-destructive w-10"
              >
                <Settings2 className="w-5 h-5" />
              </Button>
            </div>
          </div>

          <div className="flex-1 flex items-center justify-center px-8 pt-2 pb-1">
            <div className="w-full max-w-sm aspect-square rounded-2xl bg-secondary overflow-hidden shadow-2xl relative">
              {currentTrack.coverUrl ? (
                <img src={currentTrack.coverUrl} alt={currentTrack.album} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Music className="w-24 h-24 text-muted-foreground" />
                </div>
              )}

              {loadingPhase === 'searching' && (
                <div className="absolute inset-0 bg-background/50 flex items-center justify-center">
                  <div className="bg-card rounded-xl p-4 flex flex-col items-center">
                    <Loader2 className="w-8 h-8 text-primary animate-spin mb-2" />
                    <span className="text-sm text-foreground">{t('language') === 'it' ? 'Cercando…' : 'Searching…'}</span>
                  </div>
                </div>
              )}

              {loadingPhase === 'downloading' && (
                <div className="absolute inset-0 bg-background/50 flex items-center justify-center">
                  <div className="bg-card rounded-xl p-4 flex flex-col items-center">
                    <Cloud className="w-8 h-8 text-primary animate-pulse mb-2" />
                    <span className="text-sm text-foreground">
                      {t('language') === 'it'
                        ? `Scaricando… ${downloadProgress !== null ? `${Math.round(downloadProgress)}%` : ''}`
                        : `Downloading… ${downloadProgress !== null ? `${Math.round(downloadProgress)}%` : ''}`}
                    </span>
                    {downloadStatus && <span className="text-xs text-muted-foreground mt-1">{downloadStatus}</span>}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="px-8 pt-1 text-center">
            <h2 className="text-xl font-bold text-foreground truncate">{currentTrack.title}</h2>
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <button onClick={handleNavigateToArtist} className="hover:text-primary hover:underline transition-colors truncate">
                {currentTrack.artist}
              </button>
              {currentTrack.album && (
                <>
                  <span>•</span>
                  <button onClick={handleNavigateToAlbum} className="hover:text-primary hover:underline transition-colors truncate">
                    {currentTrack.album}
                  </button>
                </>
              )}
            </div>
            {currentAudioSource && (
              <div className="mt-2">
                <span className={cn(
                  "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
                  currentAudioSource === 'tidal' 
                    ? "bg-sky-500/20 text-sky-400" 
                    : currentAudioSource === 'offline'
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-orange-500/20 text-orange-400"
                )}>
                  {currentAudioSource === 'tidal' ? '🎵 Tidal HQ' : currentAudioSource === 'offline' ? '📱 Offline' : '📦 Real-Debrid'}
                </span>
              </div>
            )}
          </div>

          <div className="px-8 py-3">
            <Slider value={[progress]} max={duration || 100} step={1} onValueChange={([value]) => handleSeek(value)} />
            <div className="flex justify-between mt-2">
              <span className="text-xs text-muted-foreground">{formatTime(progress)}</span>
              <span className="text-xs text-muted-foreground">{formatTime(duration)}</span>
            </div>
          </div>

          <div
            className="flex items-center justify-between px-6 pb-safe"
            style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom, 0px))' }}
          >
            <Button
              variant="ghost"
              size="icon"
              className={cn('h-11 w-11', isShuffled ? 'text-primary' : 'text-muted-foreground')}
              onClick={toggleShuffle}
            >
              <Shuffle className="w-5 h-5" />
            </Button>

            <div
              className="flex items-center gap-4"
              onTouchStart={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
              onTouchEnd={(e) => e.stopPropagation()}
            >
              <Button variant="playerSecondary" size="icon" className="h-11 w-11" onClick={(e) => { e.stopPropagation(); previous(); }}>
                <SkipBack className="w-6 h-6" />
              </Button>
              <Button variant="player" className="h-16 w-16" onClick={(e) => { e.stopPropagation(); handleToggle(); }}>
                {isPlaying ? <Pause className="w-8 h-8" /> : <Play className="w-8 h-8 ml-1" />}
              </Button>
              <Button variant="playerSecondary" size="icon" className="h-11 w-11" onClick={(e) => { e.stopPropagation(); next(); }}>
                <SkipForward className="w-6 h-6" />
              </Button>
            </div>

            <div className="flex items-center gap-1">
              {(contextIsAdmin || isPremiumActive) && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-11 w-11 text-muted-foreground hover:text-primary"
                  onClick={() => setShowLyricsModal(true)}
                >
                  <Mic2 className="w-5 h-5" />
                </Button>
              )}
              {canDownload && currentStreamUrl && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-11 w-11 text-muted-foreground hover:text-primary"
                  onClick={handleDownload}
                  disabled={isDownloading}
                >
                  {isDownloading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                </Button>
              )}
              <FavoriteButton itemType="track" item={currentTrack} size="md" variant="ghost" className="h-11 w-11" />
            </div>
          </div>
        </div>
      )}

      {/* Mobile mini player */}
      {!isExpanded && (
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
                  <Cloud className="w-4 h-4 text-primary animate-pulse" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-foreground truncate text-sm">{currentTrack.title}</p>
              <p className="text-xs text-muted-foreground truncate">{currentTrack.artist}</p>
            </div>
            <Button variant="playerSecondary" size="icon" className="h-9 w-9" onClick={(e) => { e.stopPropagation(); handleToggle(); }}>
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </Button>
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-secondary">
            <div className="h-full bg-primary transition-all" style={{ width: `${(progress / (duration || 1)) * 100}%` }} />
          </div>
        </div>
      )}

      {/* Desktop player */}
      <div className="fixed bottom-0 left-0 right-0 h-24 glass border-t border-border z-50 animate-slide-up hidden md:block">
        <div className="h-full grid grid-cols-3 items-center px-6 gap-4">
          {/* Left section - Track info */}
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-14 h-14 rounded-lg bg-secondary flex items-center justify-center overflow-hidden flex-shrink-0 relative">
              {currentTrack.coverUrl ? (
                <img src={currentTrack.coverUrl} alt={currentTrack.album} className="w-full h-full object-cover" />
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
                  <Cloud className="w-5 h-5 text-primary animate-pulse" />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="font-medium text-foreground truncate">{currentTrack.title}</p>
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <button onClick={handleNavigateToArtist} className="hover:text-primary hover:underline transition-colors truncate">
                  {currentTrack.artist}
                </button>
                {currentTrack.album && (
                  <>
                    <span>•</span>
                    <button onClick={handleNavigateToAlbum} className="hover:text-primary hover:underline transition-colors truncate">
                      {currentTrack.album}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Center section - Controls and progress */}
          <div className="flex flex-col items-center gap-2 justify-self-center w-full max-w-2xl">
            <div className="flex items-center gap-4">
              <Button variant="playerSecondary" size="icon" onClick={previous}>
                <SkipBack className="w-5 h-5" />
              </Button>
              <Button variant="player" size="icon" onClick={handleToggle}>
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
              </Button>
              <Button variant="playerSecondary" size="icon" onClick={next}>
                <SkipForward className="w-5 h-5" />
              </Button>
            </div>

            <div className="w-full flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-10 text-right">{formatTime(progress)}</span>
              <Slider value={[progress]} max={duration || 100} step={1} onValueChange={([value]) => handleSeek(value)} className="flex-1" />
              <span className="text-xs text-muted-foreground w-10">{formatTime(duration)}</span>
            </div>
          </div>

          {/* Right section - Volume and actions */}
          <div className="flex items-center gap-3 justify-self-end">
            {(contextIsAdmin || isPremiumActive) && (
              <Button
                variant="playerSecondary"
                size="icon"
                onClick={() => setShowLyricsModal(true)}
                className="text-muted-foreground hover:text-primary"
                title={settings.language === 'it' ? 'Testo' : 'Lyrics'}
              >
                <Mic2 className="w-5 h-5" />
              </Button>
            )}
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
              onClick={handleOpenDebugModal}
              className={cn('text-muted-foreground hover:text-destructive relative', isSearchingStreams && 'text-primary')}
              title={t('bugs')}
            >
              {isSearchingStreams ? <Loader2 className="w-5 h-5 animate-spin" /> : <Settings2 className="w-5 h-5" />}
            </Button>
            {canDownload && currentStreamUrl && (
              <Button
                variant="playerSecondary"
                size="icon"
                onClick={handleDownload}
                disabled={isDownloading}
                className="text-muted-foreground hover:text-primary"
                title={settings.language === 'it' ? 'Scarica' : 'Download'}
              >
                {isDownloading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
              </Button>
            )}
            <Button variant="playerSecondary" size="icon" onClick={() => setVolume(volume === 0 ? 0.7 : 0)}>
              {volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </Button>
            <Slider value={[volume * 100]} max={100} step={1} onValueChange={([value]) => setVolume(value / 100)} className="w-24" />
          </div>
        </div>
      </div>

      <DebugModal
        isOpen={showDebugModal}
        onClose={() => setShowDebugModal(false)}
        alternatives={alternativeStreams}
        torrents={availableTorrents}
        onSelect={handleSelectStream}
        onSelectFile={handleSelectFile}
        onRefreshTorrent={refreshTorrent}
        currentStreamId={currentStreamId}
        isLoading={isSearchingStreams}
        onManualSearch={handleManualSearch}
        currentTrackInfo={{ title: currentTrack.title, artist: currentTrack.artist, albumId: currentTrack.albumId }}
        currentTrack={currentTrack}
        debugLogs={debugLogs}
        downloadProgress={downloadProgress}
        downloadStatus={downloadStatus}
        currentMappedFileId={currentMappedFileId}
        lastSearchQuery={lastSearchQuery}
        onMetadataSaved={updateTrackMetadata}
      />

      <QueueModal
        isOpen={showQueueModal}
        onClose={() => setShowQueueModal(false)}
        queue={queue}
        currentIndex={queueIndex}
        onPlayTrack={playQueueIndex}
        onClearQueue={clearQueue}
      />

      <LyricsModal
        isOpen={showLyricsModal}
        onClose={() => setShowLyricsModal(false)}
        track={currentTrack}
      />
    </>
  );
};

export default Player;
