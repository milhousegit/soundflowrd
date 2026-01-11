import React, { forwardRef, useEffect, useState } from 'react';
import { useSettings } from '@/contexts/SettingsContext';
import { StreamResult, TorrentInfo, AudioFile } from '@/lib/realdebrid';
import { DebugLogEntry } from '@/contexts/PlayerContext';
import {
  AlertCircle,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Cloud,
  Folder,
  FileAudio,
  Info,
  Loader2,
  Music,
  RefreshCw,
  Search,
  X,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import TapArea from '@/components/TapArea';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface BugsModalProps {
  isOpen: boolean;
  onClose: () => void;
  alternatives: StreamResult[];
  torrents?: TorrentInfo[];
  onSelect: (stream: StreamResult) => void;
  onSelectFile?: (torrentId: string, fileIds: number[]) => void;
  onRefreshTorrent?: (torrentId: string) => void;
  currentStreamId?: string;
  isLoading?: boolean;
  onManualSearch?: (query: string) => void;
  currentTrackInfo?: { title: string; artist: string };
  debugLogs?: DebugLogEntry[];
  downloadProgress?: number | null;
  downloadStatus?: string | null;
  currentMappedFileId?: number;
  lastSearchQuery?: string | null;
}

type SourceTab = 'torrent';

const BugsModal = forwardRef<HTMLDivElement, BugsModalProps>(
  (
    {
      isOpen,
      onClose,
      alternatives,
      torrents = [],
      onSelect,
      onSelectFile,
      onRefreshTorrent,
      currentStreamId,
      isLoading,
      onManualSearch,
      currentTrackInfo,
      debugLogs = [],
      downloadProgress,
      downloadStatus,
      currentMappedFileId,
      lastSearchQuery,
    },
    ref
  ) => {
    const { t } = useSettings();
    const [manualQuery, setManualQuery] = useState('');
    const [expandedTorrents, setExpandedTorrents] = useState<Set<string>>(new Set());
    const [refreshingIds, setRefreshingIds] = useState<Set<string>>(new Set());
    const [selectingFiles, setSelectingFiles] = useState<Set<string>>(new Set());
    const [showDebugLogs, setShowDebugLogs] = useState(false);
    const [activeTab] = useState<SourceTab>('torrent');

    useEffect(() => {
      if (isOpen && torrents.length > 0 && currentMappedFileId !== undefined) {
        const torrentWithMappedFile = torrents.find((t) => t.files.some((f) => f.id === currentMappedFileId));
        if (torrentWithMappedFile) setExpandedTorrents(new Set([torrentWithMappedFile.torrentId]));
      }
    }, [currentMappedFileId, isOpen, torrents]);

    useEffect(() => {
      if (!isOpen || torrents.length === 0 || !onRefreshTorrent) return;

      const downloadingTorrents = torrents.filter((t) =>
        ['downloading', 'queued', 'magnet_conversion'].includes(t.status)
      );

      if (downloadingTorrents.length === 0) return;

      const interval = setInterval(() => {
        downloadingTorrents.forEach((t) => {
          if (!refreshingIds.has(t.torrentId)) onRefreshTorrent(t.torrentId);
        });
      }, 15000);

      return () => clearInterval(interval);
    }, [isOpen, onRefreshTorrent, refreshingIds, torrents]);

    if (!isOpen) return null;

    const handleManualSearch = () => {
      if (manualQuery.trim() && onManualSearch) onManualSearch(manualQuery.trim());
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleManualSearch();
    };

    const toggleTorrentExpand = (torrentId: string) => {
      setExpandedTorrents((prev) => {
        const next = new Set(prev);
        if (next.has(torrentId)) next.delete(torrentId);
        else next.add(torrentId);
        return next;
      });
    };

    const handleRefreshTorrent = async (torrentId: string) => {
      if (!onRefreshTorrent || refreshingIds.has(torrentId)) return;
      setRefreshingIds((prev) => new Set(prev).add(torrentId));
      await onRefreshTorrent(torrentId);
      setRefreshingIds((prev) => {
        const next = new Set(prev);
        next.delete(torrentId);
        return next;
      });
    };

    const handleSelectFile = async (torrentId: string, file: AudioFile) => {
      if (!onSelectFile || selectingFiles.has(`${torrentId}-${file.id}`)) return;

      const key = `${torrentId}-${file.id}`;
      setSelectingFiles((prev) => new Set(prev).add(key));

      await onSelectFile(torrentId, [file.id]);

      setSelectingFiles((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    };

    const getStatusText = (status: string) => {
      switch (status) {
        case 'downloading':
          return t('language') === 'it' ? 'In download…' : 'Downloading…';
        case 'queued':
          return t('language') === 'it' ? 'In coda…' : 'Queued…';
        case 'magnet_conversion':
          return t('language') === 'it' ? 'Conversione…' : 'Converting…';
        case 'downloaded':
          return t('language') === 'it' ? 'Pronto' : 'Ready';
        case 'waiting_files_selection':
          return t('language') === 'it' ? 'Seleziona file' : 'Select files';
        default:
          return status;
      }
    };

    const getStatusColor = (status: string) => {
      switch (status) {
        case 'downloaded':
          return 'text-green-500';
        case 'downloading':
          return 'text-blue-500';
        case 'queued':
          return 'text-yellow-500';
        case 'waiting_files_selection':
          return 'text-orange-500';
        default:
          return 'text-muted-foreground';
      }
    };

    const getLogIcon = (status: DebugLogEntry['status']) => {
      switch (status) {
        case 'success':
          return <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />;
        case 'error':
          return <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />;
        case 'warning':
          return <AlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0" />;
        default:
          return <Info className="w-4 h-4 text-blue-500 flex-shrink-0" />;
      }
    };

    const hasErrors = debugLogs.some((log) => log.status === 'error');
    const isDownloading =
      isLoading ||
      downloadProgress !== null ||
      torrents.some((t) => ['downloading', 'queued', 'magnet_conversion'].includes(t.status));

    const hasTorrentResults = alternatives.length > 0 || torrents.length > 0;

    return (
      <div ref={ref} className="fixed inset-0 z-[70] flex items-end md:items-center justify-center">
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />

        <div className="relative w-full max-w-2xl max-h-[85vh] bg-card rounded-t-2xl md:rounded-2xl border border-border overflow-hidden animate-slide-up">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div>
              <h3 className="text-lg font-semibold text-foreground">{t('alternativeSources')}</h3>
              {currentTrackInfo && (
                <p className="text-sm text-muted-foreground">
                  {currentTrackInfo.artist} - {currentTrackInfo.title}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {(hasErrors || debugLogs.length > 0) && (
                <Button
                  variant={showDebugLogs ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setShowDebugLogs(!showDebugLogs)}
                  className={cn(hasErrors && 'text-destructive')}
                >
                  <Info className="w-4 h-4 mr-1" />
                  {t('language') === 'it' ? 'Dettagli' : 'Details'}
                </Button>
              )}
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {showDebugLogs && debugLogs.length > 0 && (
            <div className="max-h-48 overflow-y-auto border-b border-border bg-secondary/20">
              <div className="p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase mb-2">
                  {t('language') === 'it' ? 'Report passaggi' : 'Step report'}
                </p>
                {debugLogs.map((log, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-sm">
                    {getLogIcon(log.status)}
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-foreground">{log.step}</span>
                      {log.details && <p className="text-xs text-muted-foreground truncate">{log.details}</p>}
                    </div>
                    <span className="text-xs text-muted-foreground flex-shrink-0">{log.timestamp.toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="p-4 border-b border-border">
            <div className="flex gap-2">
              <Input
                placeholder={t('language') === 'it' ? 'Cerca manualmente…' : 'Manual search…'}
                value={manualQuery}
                onChange={(e) => setManualQuery(e.target.value)}
                onKeyDown={handleKeyPress}
                className="flex-1"
              />
              <Button onClick={handleManualSearch} disabled={!manualQuery.trim() || !!isLoading} size="icon">
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </Button>
            </div>
            {lastSearchQuery && (
              <p className="text-xs text-muted-foreground py-1">
                {t('language') === 'it' ? 'Ricerca:' : 'Search:'} "{lastSearchQuery}"
              </p>
            )}
          </div>

          <div className="p-4 overflow-y-auto max-h-[50vh]">
            {isLoading && (
              <div className="flex items-center gap-3 p-3 mb-4 rounded-lg bg-primary/10 border border-primary/20">
                <Loader2 className="w-5 h-5 text-primary animate-spin flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {t('language') === 'it' ? 'Ricerca in corso…' : 'Searching…'}
                  </p>
                </div>
              </div>
            )}

            {activeTab === 'torrent' && (
              <>
                {!hasTorrentResults && !isDownloading && !isLoading ? (
                  <div className="text-center py-8">
                    <Music className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                    <p className="text-muted-foreground">{t('noAlternatives')}</p>
                  </div>
                ) : !hasTorrentResults && isDownloading && !isLoading ? (
                  <div className="text-center py-8">
                    <div className="relative w-16 h-16 mx-auto mb-4">
                      <Cloud className="w-16 h-16 text-primary" />
                      <Loader2 className="w-6 h-6 text-primary-foreground absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin" />
                    </div>
                    <p className="text-foreground font-medium">
                      {t('language') === 'it' ? 'Sei il primo a riprodurla!' : "You're the first to play this!"}
                    </p>
                    {downloadProgress !== null && (
                      <div className="mt-4 px-8">
                        <Progress value={downloadProgress} className="h-2" />
                        <p className="text-xs text-muted-foreground mt-1">
                          {downloadProgress}%{downloadStatus && ` - ${downloadStatus}`}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {alternatives.length > 0 && (
                      <>
                        <div className="flex items-center gap-2 py-2">
                          <Check className="w-4 h-4 text-green-500" />
                          <span className="text-sm font-medium text-foreground">{t('language') === 'it' ? 'Pronti' : 'Ready'}</span>
                        </div>
                        {alternatives.map((alt) => (
                          <TapArea
                            as="button"
                            key={alt.id}
                            onTap={() => onSelect(alt)}
                            className={cn(
                              'w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left touch-manipulation',
                              currentStreamId === alt.id
                                ? 'bg-primary/20 border border-primary/50'
                                : 'bg-secondary hover:bg-secondary/80'
                            )}
                          >
                            <FileAudio className="w-5 h-5 text-primary flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-foreground truncate">{alt.title}</p>
                              <p className="text-sm text-muted-foreground">{alt.quality} {alt.size && `• ${alt.size}`}</p>
                            </div>
                            {currentStreamId === alt.id && <Check className="w-5 h-5 text-primary flex-shrink-0" />}
                          </TapArea>
                        ))}
                      </>
                    )}

                    {torrents.length > 0 && (
                      <>
                        {alternatives.length > 0 && (
                          <div className="flex items-center gap-2 py-2 mt-4">
                            <div className="flex-1 h-px bg-border" />
                            <span className="text-xs text-muted-foreground">Torrent</span>
                            <div className="flex-1 h-px bg-border" />
                          </div>
                        )}

                        {torrents.map((torrent) => {
                          const isExpanded = expandedTorrents.has(torrent.torrentId);
                          const torrentIsDownloading = ['downloading', 'queued', 'magnet_conversion'].includes(torrent.status);
                          const hasMappedFile = torrent.files.some((f) => f.id === currentMappedFileId);

                          return (
                            <div
                              key={torrent.torrentId}
                              className={cn(
                                'rounded-lg border overflow-hidden',
                                hasMappedFile ? 'border-primary/50 bg-primary/5' : 'border-border'
                              )}
                            >
                              <TapArea
                                as="button"
                                onTap={() => toggleTorrentExpand(torrent.torrentId)}
                                className="w-full flex items-center gap-3 p-3 bg-secondary/50 hover:bg-secondary/80 transition-colors text-left touch-manipulation"
                              >
                                {isExpanded ? (
                                  <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                                )}
                                <Folder
                                  className={cn(
                                    'w-5 h-5 flex-shrink-0',
                                    hasMappedFile ? 'text-primary' : 'text-muted-foreground'
                                  )}
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="font-medium text-foreground truncate">{torrent.title}</p>
                                    {hasMappedFile && (
                                      <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded-full flex-shrink-0">
                                        {t('language') === 'it' ? 'Sincronizzato' : 'Synced'}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 text-sm flex-wrap">
                                    <span className={getStatusColor(torrent.status)}>{getStatusText(torrent.status)}</span>
                                    <span className="text-muted-foreground">•</span>
                                    <span className="text-muted-foreground">{torrent.files.length} file</span>
                                    <span className="text-muted-foreground">•</span>
                                    <span className="text-muted-foreground">{torrent.source}</span>
                                  </div>
                                  {torrentIsDownloading && torrent.progress > 0 && (
                                    <Progress value={torrent.progress} className="h-1 mt-2" />
                                  )}
                                </div>

                                <div
                                  role="button"
                                  tabIndex={0}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRefreshTorrent(torrent.torrentId);
                                  }}
                                  className={cn(
                                    'flex-shrink-0 p-2 rounded-md hover:bg-secondary transition-colors',
                                    refreshingIds.has(torrent.torrentId) && 'pointer-events-none opacity-50'
                                  )}
                                >
                                  <RefreshCw
                                    className={cn('w-4 h-4', refreshingIds.has(torrent.torrentId) && 'animate-spin')}
                                  />
                                </div>
                              </TapArea>

                              {isExpanded && torrent.files.length > 0 && (
                                <div className="border-t border-border bg-background/50">
                                  {torrent.files.map((file) => {
                                    const isSelecting = selectingFiles.has(`${torrent.torrentId}-${file.id}`);
                                    const isMapped = currentMappedFileId === file.id;

                                    return (
                                      <TapArea
                                        as="button"
                                        key={file.id}
                                        onTap={() => handleSelectFile(torrent.torrentId, file)}
                                        disabled={isSelecting}
                                        className={cn(
                                          'w-full flex items-center gap-3 p-3 hover:bg-secondary/50 transition-colors text-left border-b border-border/50 last:border-b-0 touch-manipulation',
                                          isMapped && 'bg-primary/10'
                                        )}
                                      >
                                        {isSelecting ? (
                                          <Loader2 className="w-4 h-4 text-primary animate-spin flex-shrink-0" />
                                        ) : isMapped ? (
                                          <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                                        ) : (
                                          <FileAudio className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                                        )}
                                        <div className="flex-1 min-w-0">
                                          <span
                                            className={cn(
                                              'text-sm truncate block',
                                              isMapped ? 'text-foreground font-medium' : 'text-foreground'
                                            )}
                                          >
                                            {file.filename}
                                          </span>
                                          {isMapped && (
                                            <span className="text-xs text-green-600">{t('language') === 'it' ? 'Sincronizzato' : 'Synced'}</span>
                                          )}
                                        </div>
                                      </TapArea>
                                    );
                                  })}
                                </div>
                              )}

                              {isExpanded && torrent.files.length === 0 && (
                                <div className="p-4 text-center text-sm text-muted-foreground border-t border-border">
                                  {t('language') === 'it' ? 'Nessun file audio' : 'No audio files'}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }
);

BugsModal.displayName = 'BugsModal';

export default BugsModal;
