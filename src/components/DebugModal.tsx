import React, { forwardRef, useEffect, useState } from 'react';
import { useSettings } from '@/contexts/SettingsContext';
import { useAuth } from '@/contexts/AuthContext';
import { StreamResult, TorrentInfo, AudioFile } from '@/lib/realdebrid';
import { DebugLogEntry } from '@/contexts/PlayerContext';
import { Track } from '@/types/music';
import { supabase } from '@/integrations/supabase/client';
import { searchTracks as searchDeezerTracks, getTrack as getDeezerTrack } from '@/lib/deezer';
import { getTidalStream } from '@/lib/tidal';
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
  Save,
  Database,
  Headphones,
  Tag,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import TapArea from '@/components/TapArea';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface DebugModalProps {
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
  currentTrackInfo?: { title: string; artist: string; albumId?: string };
  currentTrack?: Track | null;
  debugLogs?: DebugLogEntry[];
  downloadProgress?: number | null;
  downloadStatus?: string | null;
  currentMappedFileId?: number;
  lastSearchQuery?: string | null;
}

type DebugTab = 'realdebrid' | 'scraping' | 'metadati';

interface DeezerResult {
  id: string;
  title: string;
  artist: string;
  album?: string;
  coverUrl?: string;
  duration?: number;
}

interface TidalResult {
  tidalId: string;
  title: string;
  artist: string;
  quality?: string;
  streamUrl?: string;
}

const DebugModal = forwardRef<HTMLDivElement, DebugModalProps>(
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
      currentTrack,
      debugLogs = [],
      downloadProgress,
      downloadStatus,
      currentMappedFileId,
      lastSearchQuery,
    },
    ref
  ) => {
    const { t } = useSettings();
    const { credentials } = useAuth();
    const isItalian = t('language') === 'it';
    
    const [activeTab, setActiveTab] = useState<DebugTab>('realdebrid');
    const [manualQuery, setManualQuery] = useState('');
    const [expandedTorrents, setExpandedTorrents] = useState<Set<string>>(new Set());
    const [refreshingIds, setRefreshingIds] = useState<Set<string>>(new Set());
    const [selectingFiles, setSelectingFiles] = useState<Set<string>>(new Set());
    const [showDebugLogs, setShowDebugLogs] = useState(false);
    
    // Scraping (Tidal/SquidWTF) state
    const [scrapingResults, setScrapingResults] = useState<TidalResult[]>([]);
    const [scrapingLoading, setScrapingLoading] = useState(false);
    const [scrapingQuery, setScrapingQuery] = useState('');
    
    // Metadati (Deezer) state
    const [metadataResults, setMetadataResults] = useState<DeezerResult[]>([]);
    const [metadataLoading, setMetadataLoading] = useState(false);
    const [metadataQuery, setMetadataQuery] = useState('');
    const [savingMetadata, setSavingMetadata] = useState<string | null>(null);

    // Check if user has RD API key
    const hasRdKey = !!credentials?.realDebridApiKey;

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

    // Auto-populate search queries ONLY when modal opens fresh (empty queries)
    useEffect(() => {
      if (isOpen && currentTrackInfo) {
        const query = `${currentTrackInfo.title} ${currentTrackInfo.artist}`;
        // Only set if currently empty - allows user to clear and keep cleared
        setScrapingQuery(prev => prev === '' ? query : prev);
        setMetadataQuery(prev => prev === '' ? query : prev);
      }
      // Reset queries when modal closes so they can be auto-populated next time
      if (!isOpen) {
        setScrapingQuery('');
        setMetadataQuery('');
      }
    }, [isOpen, currentTrackInfo]);

    // Check if user has RD API key - define tabs before early return for hook consistency
    const tabs: { id: DebugTab; label: string; icon: React.ReactNode; show: boolean }[] = [
      { id: 'realdebrid', label: 'RealDebrid', icon: <Database className="w-4 h-4" />, show: hasRdKey },
      { id: 'scraping', label: 'Scraping', icon: <Headphones className="w-4 h-4" />, show: true },
      { id: 'metadati', label: 'Metadati', icon: <Tag className="w-4 h-4" />, show: true },
    ];

    const visibleTabs = tabs.filter(tab => tab.show);

    // Auto-select first visible tab if current is hidden
    useEffect(() => {
      if (!visibleTabs.find(t => t.id === activeTab)) {
        setActiveTab(visibleTabs[0]?.id || 'scraping');
      }
    }, [hasRdKey, activeTab, visibleTabs]);

    if (!isOpen) return null;

    const handleManualSearch = () => {
      if (manualQuery.trim() && onManualSearch) onManualSearch(manualQuery.trim());
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        if (activeTab === 'realdebrid') handleManualSearch();
        else if (activeTab === 'scraping') handleScrapingSearch();
        else if (activeTab === 'metadati') handleMetadataSearch();
      }
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

    // Scraping (Tidal) search
    const handleScrapingSearch = async () => {
      if (!scrapingQuery.trim()) return;
      
      setScrapingLoading(true);
      setScrapingResults([]);
      
      try {
        // Use SquidWTF to search Tidal
        const { data, error } = await supabase.functions.invoke('squidwtf', {
          body: { action: 'search', query: scrapingQuery.trim() },
        });
        
        if (error) throw error;
        
        if (data?.results && Array.isArray(data.results)) {
          setScrapingResults(data.results.slice(0, 20).map((r: any) => ({
            tidalId: r.id?.toString() || '',
            title: r.title || '',
            artist: r.artist?.name || r.artists?.[0]?.name || '',
            quality: r.audioQuality || 'LOSSLESS',
          })));
        }
      } catch (error) {
        console.error('Scraping search error:', error);
        toast.error(isItalian ? 'Errore ricerca Tidal' : 'Tidal search error');
      } finally {
        setScrapingLoading(false);
      }
    };

    const handleSelectScrapingResult = async (result: TidalResult) => {
      try {
        const streamResult = await getTidalStream(result.title, result.artist, result.tidalId);
        
        if ('streamUrl' in streamResult && streamResult.streamUrl) {
          // Create a StreamResult-like object and use onSelect
          const stream: StreamResult = {
            id: result.tidalId,
            title: `${result.artist} - ${result.title}`,
            streamUrl: streamResult.streamUrl,
            quality: streamResult.quality || 'LOSSLESS',
            source: 'Tidal',
          };
          onSelect(stream);
          toast.success(isItalian ? 'Sorgente Tidal selezionata' : 'Tidal source selected');
          onClose();
        } else {
          toast.error(isItalian ? 'Stream non disponibile' : 'Stream not available');
        }
      } catch (error) {
        console.error('Error selecting Tidal result:', error);
        toast.error(isItalian ? 'Errore selezione' : 'Selection error');
      }
    };

    // Metadata (Deezer) search - supports both text search and ID lookup
    const handleMetadataSearch = async () => {
      if (!metadataQuery.trim()) return;
      
      setMetadataLoading(true);
      setMetadataResults([]);
      
      try {
        const query = metadataQuery.trim();
        
        // Check if query is a numeric ID (Deezer track ID)
        if (/^\d+$/.test(query)) {
          // Search by ID directly
          const track = await getDeezerTrack(query);
          if (track) {
            setMetadataResults([{
              id: track.id,
              title: track.title,
              artist: track.artist,
              album: track.album,
              coverUrl: track.coverUrl,
              duration: track.duration,
            }]);
          } else {
            toast.error(isItalian ? 'Brano non trovato con questo ID' : 'Track not found with this ID');
          }
        } else {
          // Normal text search
          const results = await searchDeezerTracks(query);
          setMetadataResults(results.slice(0, 20).map((r) => ({
            id: r.id,
            title: r.title,
            artist: r.artist,
            album: r.album,
            coverUrl: r.coverUrl,
            duration: r.duration,
          })));
        }
      } catch (error) {
        console.error('Metadata search error:', error);
        toast.error(isItalian ? 'Errore ricerca Deezer' : 'Deezer search error');
      } finally {
        setMetadataLoading(false);
      }
    };

    const handleSaveMetadataMapping = async (result: DeezerResult) => {
      if (!currentTrack) {
        toast.error(isItalian ? 'Nessun brano corrente' : 'No current track');
        return;
      }
      
      setSavingMetadata(result.id);
      
      try {
        // For now, we just update the playlist_tracks table if this is from a playlist
        // This saves the correct Deezer ID mapping for future use
        
        // Check if track is in any playlist
        const { data: playlistTracks } = await supabase
          .from('playlist_tracks')
          .select('id')
          .eq('track_id', currentTrack.id);
        
        if (playlistTracks && playlistTracks.length > 0) {
          // Update playlist tracks with correct metadata
          await supabase
            .from('playlist_tracks')
            .update({
              track_id: result.id,
              track_title: result.title,
              track_artist: result.artist,
              track_album: result.album || null,
              track_cover_url: result.coverUrl || null,
              track_duration: result.duration || null,
            })
            .eq('track_id', currentTrack.id);
          
          toast.success(isItalian ? 'Metadati salvati!' : 'Metadata saved!');
        } else {
          toast.info(isItalian ? 'Mappatura non disponibile per questo brano' : 'Mapping not available for this track');
        }
        
      } catch (error) {
        console.error('Error saving metadata:', error);
        toast.error(isItalian ? 'Errore salvataggio' : 'Save error');
      } finally {
        setSavingMetadata(null);
      }
    };

    const getStatusText = (status: string) => {
      switch (status) {
        case 'downloading':
          return isItalian ? 'In download…' : 'Downloading…';
        case 'queued':
          return isItalian ? 'In coda…' : 'Queued…';
        case 'magnet_conversion':
          return isItalian ? 'Conversione…' : 'Converting…';
        case 'downloaded':
          return isItalian ? 'Pronto' : 'Ready';
        case 'waiting_files_selection':
          return isItalian ? 'Seleziona file' : 'Select files';
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
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div>
              <h3 className="text-lg font-semibold text-foreground">{isItalian ? 'Debug Sorgenti' : 'Debug Sources'}</h3>
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
                  {isItalian ? 'Log' : 'Logs'}
                </Button>
              )}
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Debug Logs */}
          {showDebugLogs && debugLogs.length > 0 && (
            <div className="max-h-48 overflow-y-auto border-b border-border bg-secondary/20">
              <div className="p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase mb-2">
                  {isItalian ? 'Report passaggi' : 'Step report'}
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

          {/* Tabs */}
          <div className="flex border-b border-border">
            {visibleTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-3 px-4 text-sm font-medium transition-colors",
                  activeTab === tab.id
                    ? "text-primary border-b-2 border-primary bg-primary/5"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="p-4 overflow-y-auto max-h-[50vh]">
            
            {/* RealDebrid Tab */}
            {activeTab === 'realdebrid' && hasRdKey && (
              <>
                {/* Manual Search */}
                <div className="flex gap-2 mb-4">
                  <Input
                    placeholder={isItalian ? 'Cerca torrent…' : 'Search torrents…'}
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
                  <p className="text-xs text-muted-foreground pb-2">
                    {isItalian ? 'Ricerca:' : 'Search:'} "{lastSearchQuery}"
                  </p>
                )}

                {isLoading && (
                  <div className="flex items-center gap-3 p-3 mb-4 rounded-lg bg-primary/10 border border-primary/20">
                    <Loader2 className="w-5 h-5 text-primary animate-spin flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {isItalian ? 'Ricerca in corso…' : 'Searching…'}
                      </p>
                    </div>
                  </div>
                )}

                {!hasTorrentResults && !isDownloading && !isLoading ? (
                  <div className="text-center py-8">
                    <Music className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                    <p className="text-muted-foreground">{isItalian ? 'Nessun risultato' : 'No results'}</p>
                  </div>
                ) : !hasTorrentResults && isDownloading && !isLoading ? (
                  <div className="text-center py-8">
                    <div className="relative w-16 h-16 mx-auto mb-4">
                      <Cloud className="w-16 h-16 text-primary" />
                      <Loader2 className="w-6 h-6 text-primary-foreground absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin" />
                    </div>
                    <p className="text-foreground font-medium">
                      {isItalian ? 'Sei il primo a riprodurla!' : "You're the first to play this!"}
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
                          <span className="text-sm font-medium text-foreground">{isItalian ? 'Pronti' : 'Ready'}</span>
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
                                    'p-2 rounded-full hover:bg-background/50 transition-colors flex-shrink-0',
                                    refreshingIds.has(torrent.torrentId) && 'animate-spin'
                                  )}
                                >
                                  <RefreshCw className="w-4 h-4 text-muted-foreground" />
                                </div>
                              </TapArea>

                              {isExpanded && torrent.files.length > 0 && (
                                <div className="border-t border-border bg-background/50">
                                  {torrent.files.map((file) => {
                                    const isMapped = file.id === currentMappedFileId;
                                    const isSelecting = selectingFiles.has(`${torrent.torrentId}-${file.id}`);

                                    return (
                                      <TapArea
                                        as="button"
                                        key={file.id}
                                        onTap={() => handleSelectFile(torrent.torrentId, file)}
                                        disabled={isSelecting}
                                        className={cn(
                                          'w-full flex items-center gap-3 p-3 pl-12 hover:bg-secondary/50 transition-colors text-left touch-manipulation border-b border-border/50 last:border-b-0',
                                          isMapped && 'bg-primary/10'
                                        )}
                                      >
                                        {isSelecting ? (
                                          <Loader2 className="w-4 h-4 text-primary animate-spin flex-shrink-0" />
                                        ) : (
                                          <FileAudio
                                            className={cn('w-4 h-4 flex-shrink-0', isMapped ? 'text-primary' : 'text-muted-foreground')}
                                          />
                                        )}
                                        <div className="flex-1 min-w-0">
                                          <p className={cn('text-sm truncate', isMapped ? 'text-primary font-medium' : 'text-foreground')}>
                                            {file.filename || file.path}
                                          </p>
                                        </div>
                                        {isMapped && <Check className="w-4 h-4 text-primary flex-shrink-0" />}
                                      </TapArea>
                                    );
                                  })}
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

            {/* Scraping (Tidal) Tab */}
            {activeTab === 'scraping' && (
              <>
                <div className="flex gap-2 mb-4">
                  <Input
                    placeholder={isItalian ? 'Cerca su Tidal…' : 'Search on Tidal…'}
                    value={scrapingQuery}
                    onChange={(e) => setScrapingQuery(e.target.value)}
                    onKeyDown={handleKeyPress}
                    className="flex-1"
                  />
                  <Button onClick={handleScrapingSearch} disabled={!scrapingQuery.trim() || scrapingLoading} size="icon">
                    {scrapingLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  </Button>
                </div>

                {scrapingLoading && (
                  <div className="flex items-center gap-3 p-3 mb-4 rounded-lg bg-primary/10 border border-primary/20">
                    <Loader2 className="w-5 h-5 text-primary animate-spin flex-shrink-0" />
                    <p className="text-sm font-medium text-foreground">
                      {isItalian ? 'Ricerca su Tidal…' : 'Searching Tidal…'}
                    </p>
                  </div>
                )}

                {scrapingResults.length === 0 && !scrapingLoading && (
                  <div className="text-center py-8">
                    <Headphones className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                    <p className="text-muted-foreground">
                      {isItalian ? 'Cerca un brano per vedere i risultati Tidal' : 'Search a track to see Tidal results'}
                    </p>
                  </div>
                )}

                {scrapingResults.length > 0 && (
                  <div className="space-y-2">
                    {scrapingResults.map((result, idx) => (
                      <TapArea
                        as="button"
                        key={`${result.tidalId}-${idx}`}
                        onTap={() => handleSelectScrapingResult(result)}
                        className="w-full flex items-center gap-3 p-3 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors text-left touch-manipulation"
                      >
                        <Headphones className="w-5 h-5 text-sky-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground truncate">{result.title}</p>
                          <p className="text-sm text-muted-foreground truncate">{result.artist}</p>
                        </div>
                        <span className="text-xs bg-sky-500/20 text-sky-400 px-2 py-1 rounded-full">
                          {result.quality || 'LOSSLESS'}
                        </span>
                      </TapArea>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Metadati (Deezer) Tab */}
            {activeTab === 'metadati' && (
              <>
                <div className="flex gap-2 mb-4">
                  <Input
                    placeholder={isItalian ? 'Cerca su Deezer…' : 'Search on Deezer…'}
                    value={metadataQuery}
                    onChange={(e) => setMetadataQuery(e.target.value)}
                    onKeyDown={handleKeyPress}
                    className="flex-1"
                  />
                  <Button onClick={handleMetadataSearch} disabled={!metadataQuery.trim() || metadataLoading} size="icon">
                    {metadataLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  </Button>
                </div>

                {metadataLoading && (
                  <div className="flex items-center gap-3 p-3 mb-4 rounded-lg bg-primary/10 border border-primary/20">
                    <Loader2 className="w-5 h-5 text-primary animate-spin flex-shrink-0" />
                    <p className="text-sm font-medium text-foreground">
                      {isItalian ? 'Ricerca su Deezer…' : 'Searching Deezer…'}
                    </p>
                  </div>
                )}

                {metadataResults.length === 0 && !metadataLoading && (
                  <div className="text-center py-8">
                    <Tag className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                    <p className="text-muted-foreground">
                      {isItalian ? 'Cerca un brano per vedere i metadati Deezer' : 'Search a track to see Deezer metadata'}
                    </p>
                  </div>
                )}

                {metadataResults.length > 0 && (
                  <div className="space-y-2">
                    {metadataResults.map((result) => (
                      <div
                        key={result.id}
                        className="flex items-center gap-3 p-3 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors"
                      >
                        <div className="w-12 h-12 rounded-lg bg-muted overflow-hidden flex-shrink-0">
                          {result.coverUrl ? (
                            <img src={result.coverUrl} alt={result.album} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Music className="w-5 h-5 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground truncate">{result.title}</p>
                          <p className="text-sm text-muted-foreground truncate">{result.artist}</p>
                          {result.album && (
                            <p className="text-xs text-muted-foreground truncate">{result.album}</p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSaveMetadataMapping(result)}
                          disabled={savingMetadata === result.id}
                          className="flex-shrink-0"
                        >
                          {savingMetadata === result.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Save className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    ))}
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

DebugModal.displayName = 'DebugModal';

export default DebugModal;
