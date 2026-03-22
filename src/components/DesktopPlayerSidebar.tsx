import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlayer } from '@/contexts/PlayerContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTrackCanvas } from '@/hooks/useTrackCanvas';
import { useOfflineStorage } from '@/hooks/useOfflineStorage';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';
import FavoriteButton from './FavoriteButton';
import InlineLyricsCard from './InlineLyricsCard';
import DebugModal from './DebugModal';
import QueueModal from './QueueModal';
import LyricsModal from './LyricsModal';
import TrackActionsModal from './TrackActionsModal';
import { isPast } from 'date-fns';
import { cn } from '@/lib/utils';

import {
  Cloud,
  Download,
  ListMusic,
  Loader2,
  Mic2,
  Music,
  Pause,
  Play,
  Settings2,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react';

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const DesktopPlayerSidebar: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { profile, isAdmin: contextIsAdmin, simulateFreeUser } = useAuth();
  const { settings } = useSettings();
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
    reorderQueue,
    loadingPhase,
    isShuffled,
    toggleShuffle,
    lastSearchQuery,
    currentAudioSource,
    updateTrackMetadata,
  } = usePlayer();

  const { canvasUrl } = useTrackCanvas(currentTrack?.id, currentTrack?.title, currentTrack?.artist);
  const { saveTrackOffline } = useOfflineStorage();

  const isPremiumActive = !simulateFreeUser && profile?.is_premium && (
    !profile?.premium_expires_at || !isPast(new Date(profile.premium_expires_at)));
  const canDownload = contextIsAdmin || isPremiumActive;

  const currentStreamUrl = alternativeStreams.find((s) => s.id === currentStreamId)?.streamUrl;

  const [showDebugModal, setShowDebugModal] = useState(false);
  const [showTrackActions, setShowTrackActions] = useState(false);
  const [showQueueModal, setShowQueueModal] = useState(false);
  const [showLyricsModal, setShowLyricsModal] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  if (!currentTrack) return null;

  const handleSeek = (time: number) => seek(time);

  const handleNavigateToArtist = () => {
    if (currentTrack.artistId) navigate(`/app/artist/${currentTrack.artistId}`);
  };

  const handleNavigateToAlbum = () => {
    if (currentTrack.albumId) navigate(`/app/album/${currentTrack.albumId}`);
  };

  const handleOpenDebugModal = () => {
    clearDebugLogs();
    loadSavedMapping();
    setShowDebugModal(true);
  };

  const handleDownload = async () => {
    if (!currentTrack || !currentStreamUrl || isDownloading) return;
    setIsDownloading(true);
    try {
      const response = await fetch(currentStreamUrl);
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      await saveTrackOffline(currentTrack, blob);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentTrack.artist} - ${currentTrack.title}.mp3`;
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
    } catch {
      toast({
        title: settings.language === 'it' ? 'Errore download' : 'Download error',
        variant: 'destructive',
      });
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <>
      <aside className="hidden md:flex w-[380px] shrink-0 flex-col border-l border-border bg-card overflow-hidden">
        <ScrollArea className="flex-1">
          <div className="flex flex-col">
            {/* Canvas/Cover + overlaid controls — seamless */}
            <div className="relative w-full h-[72vh] min-h-[680px] max-h-[920px]">
              {/* Media background */}
              <div className="absolute inset-0">
                {canvasUrl ? (
                  <video
                    src={canvasUrl}
                    className="w-full h-full object-cover"
                    loop
                    muted
                    playsInline
                    autoPlay={isPlaying}
                    crossOrigin="anonymous"
                  />
                ) : currentTrack.coverUrl ? (
                  <div className="w-full h-full flex items-center justify-center bg-secondary">
                    <img
                      src={currentTrack.coverUrl}
                      alt={currentTrack.album}
                      className="w-[58%] aspect-square object-cover rounded-xl shadow-2xl"
                    />
                  </div>
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-secondary">
                    <Music className="w-16 h-16 text-muted-foreground" />
                  </div>
                )}
              </div>

              {/* Gradient overlay — fades into card bg */}
              <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-transparent pointer-events-none" />
              <div className="absolute inset-0 bg-gradient-to-t from-card via-card/85 to-transparent pointer-events-none" style={{ top: '68%' }} />

              {/* Loading overlays */}
              {loadingPhase === 'searching' && (
                <div className="absolute inset-0 bg-background/60 flex items-center justify-center z-10">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                </div>
              )}
              {loadingPhase === 'downloading' && (
                <div className="absolute inset-0 bg-background/60 flex items-center justify-center flex-col z-10">
                  <Cloud className="w-8 h-8 text-primary animate-pulse" />
                  {downloadProgress !== null && (
                    <span className="text-xs text-foreground mt-1">{Math.round(downloadProgress)}%</span>
                  )}
                </div>
              )}

              {/* Overlaid info + controls at bottom */}
              <div className="relative z-[5] flex flex-col justify-end h-full pt-[430px]">
                {/* Track info */}
                <div className="px-4">
                  <h3 className="font-semibold text-foreground truncate text-base">{currentTrack.title}</h3>
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

                  {currentAudioSource && (
                    <div className="mt-1.5">
                      <span className={cn(
                        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                        currentAudioSource === 'monochrome' ? 'bg-sky-500/20 text-sky-400' :
                        currentAudioSource === 'offline' ? 'bg-emerald-500/20 text-emerald-400' :
                        'bg-orange-500/20 text-orange-400'
                      )}>
                        {currentAudioSource === 'monochrome' ? 'Monochrome' :
                         currentAudioSource === 'offline' ? 'Offline' :
                         'Real-Debrid'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Progress */}
                <div className="px-4 pt-3">
                  <Slider value={[progress]} max={duration || 100} step={1} onValueChange={([v]) => handleSeek(v)} />
                  <div className="flex justify-between mt-1">
                    <span className="text-xs text-muted-foreground">{formatTime(progress)}</span>
                    <span className="text-xs text-muted-foreground">{formatTime(duration)}</span>
                  </div>
                </div>

                {/* Main controls */}
                <div className="flex items-center justify-between px-4 pt-2">
                  <Button
                    variant="ghost" size="icon"
                    className={cn('h-9 w-9', isShuffled ? 'text-primary' : 'text-muted-foreground')}
                    onClick={toggleShuffle}
                  >
                    <Shuffle className="w-4 h-4" />
                  </Button>
                  <div className="flex items-center gap-2">
                    <Button variant="playerSecondary" size="icon" className="h-9 w-9" onClick={previous}>
                      <SkipBack className="w-5 h-5" />
                    </Button>
                    <Button variant="player" className="h-12 w-12" onClick={toggle}>
                      {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
                    </Button>
                    <Button variant="playerSecondary" size="icon" className="h-9 w-9" onClick={next}>
                      <SkipForward className="w-5 h-5" />
                    </Button>
                  </div>
                  <FavoriteButton itemType="track" item={currentTrack} size="sm" variant="ghost" className="h-9 w-9" />
                </div>

                {/* Secondary actions */}
                <div className="flex items-center justify-center gap-1 px-4 pt-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => setShowQueueModal(true)}>
                    <ListMusic className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => setShowLyricsModal(true)}>
                    <Mic2 className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost" size="icon"
                    className={cn('h-8 w-8 text-muted-foreground hover:text-destructive', isSearchingStreams && 'text-primary')}
                    onClick={handleOpenDebugModal}
                  >
                    {isSearchingStreams ? <Loader2 className="w-4 h-4 animate-spin" /> : <Settings2 className="w-4 h-4" />}
                  </Button>
                  {canDownload && currentStreamUrl && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={handleDownload} disabled={isDownloading}>
                      {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    </Button>
                  )}
                </div>

                {/* Volume */}
                <div className="flex items-center gap-2 px-4 pt-2 pb-2">
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => setVolume(volume === 0 ? 0.7 : 0)}>
                    {volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </Button>
                  <Slider value={[volume * 100]} max={100} step={1} onValueChange={([v]) => setVolume(v / 100)} className="flex-1" />
                </div>
              </div>
            </div>

            {/* Inline Lyrics — below the canvas/controls area */}
            <div className="px-4 pt-2 pb-4">
              <InlineLyricsCard track={currentTrack} onTap={() => setShowLyricsModal(true)} />
            </div>
          </div>
        </ScrollArea>
      </aside>

      {/* Modals */}
      <DebugModal
        isOpen={showDebugModal}
        onClose={() => setShowDebugModal(false)}
        alternatives={alternativeStreams}
        torrents={availableTorrents}
        onSelect={(s) => { selectStream(s); setShowDebugModal(false); }}
        onSelectFile={(tid, fids) => selectTorrentFile(tid, fids)}
        onRefreshTorrent={refreshTorrent}
        currentStreamId={currentStreamId}
        isLoading={isSearchingStreams}
        onManualSearch={manualSearch}
        currentTrackInfo={{ title: currentTrack.title, artist: currentTrack.artist, albumId: currentTrack.albumId }}
        currentTrack={currentTrack}
        debugLogs={debugLogs}
        downloadProgress={downloadProgress}
        downloadStatus={downloadStatus}
        currentMappedFileId={currentMappedFileId}
        lastSearchQuery={lastSearchQuery}
        onMetadataSaved={updateTrackMetadata}
      />
      <TrackActionsModal
        isOpen={showTrackActions}
        onClose={() => setShowTrackActions(false)}
        track={currentTrack}
        onOpenDebugModal={handleOpenDebugModal}
        onDownload={handleDownload}
        isDownloading={isDownloading}
        canDownload={canDownload}
        currentStreamUrl={currentStreamUrl}
      />
      <QueueModal
        isOpen={showQueueModal}
        onClose={() => setShowQueueModal(false)}
        queue={queue}
        currentIndex={queueIndex}
        onPlayTrack={playQueueIndex}
        onClearQueue={clearQueue}
        onReorderQueue={reorderQueue}
      />
      <LyricsModal
        isOpen={showLyricsModal}
        onClose={() => setShowLyricsModal(false)}
        track={currentTrack}
      />
    </>
  );
};

export default DesktopPlayerSidebar;
