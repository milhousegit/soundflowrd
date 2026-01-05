import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import TapArea from '@/components/TapArea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  Loader2, 
  FolderOpen, 
  Music, 
  Check, 
  X, 
  RefreshCw,
  Save,
  ChevronRight,
  ChevronDown,
  Cloud,
  Search,
  AlertCircle,
  Info
} from 'lucide-react';
import { useSettings } from '@/contexts/SettingsContext';
import { useAuth } from '@/contexts/AuthContext';
import { searchStreams, TorrentInfo, AudioFile } from '@/lib/realdebrid';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Track } from '@/types/music';
import { addSyncedTrack } from '@/hooks/useSyncedTracks';

interface AlbumTorrentModalProps {
  isOpen: boolean;
  onClose: () => void;
  albumId: string;
  albumTitle: string;
  artistName: string;
  tracks: Track[];
}

interface TrackMatch {
  trackId: string;
  trackTitle: string;
  trackPosition: number;
  fileId: number | null;
  filePath: string | null;
  fileName: string | null;
  confidence: number;
}

// Clean search query: remove - and . that break searches
function cleanSearchQuery(str: string): string {
  return str
    .replace(/[-_.]/g, ' ')  // Replace - . _ with spaces
    .replace(/\s+/g, ' ')     // Collapse multiple spaces
    .trim();
}

// Normalize string for matching
function normalizeForMatch(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^\w\s]/g, '') // Remove special chars
    .replace(/\s+/g, ' ')
    .trim();
}

// Calculate similarity between two strings (0-1)
function stringSimilarity(a: string, b: string): number {
  const na = normalizeForMatch(a);
  const nb = normalizeForMatch(b);
  
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.9;
  
  // Word matching
  const wordsA = na.split(' ').filter(w => w.length > 2);
  const wordsB = nb.split(' ').filter(w => w.length > 2);
  
  let matches = 0;
  for (const wa of wordsA) {
    for (const wb of wordsB) {
      if (wa === wb || wa.includes(wb) || wb.includes(wa)) {
        matches++;
        break;
      }
    }
  }
  
  return wordsA.length > 0 ? matches / Math.max(wordsA.length, wordsB.length) : 0;
}

// Extract track number from filename
function extractTrackNumber(filename: string): number | null {
  // Try patterns like "01", "01.", "01 -", "Track 01", etc.
  const patterns = [
    /^(\d{1,2})[.\-_\s]/,
    /track\s*(\d{1,2})/i,
    /\[(\d{1,2})\]/,
    /\((\d{1,2})\)/,
  ];
  
  for (const pattern of patterns) {
    const match = filename.match(pattern);
    if (match) {
      return parseInt(match[1], 10);
    }
  }
  
  return null;
}

// Match tracks to files
function matchTracksToFiles(tracks: Track[], files: AudioFile[]): TrackMatch[] {
  const matches: TrackMatch[] = tracks.map((track, idx) => ({
    trackId: track.id,
    trackTitle: track.title,
    trackPosition: idx + 1,
    fileId: null,
    filePath: null,
    fileName: null,
    confidence: 0,
  }));
  
  const usedFiles = new Set<number>();
  
  // First pass: match by track number
  for (const match of matches) {
    for (const file of files) {
      if (usedFiles.has(file.id)) continue;
      
      const fileTrackNum = extractTrackNumber(file.filename);
      if (fileTrackNum === match.trackPosition) {
        // Also check title similarity to avoid false positives
        const similarity = stringSimilarity(match.trackTitle, file.filename);
        if (similarity > 0.3 || fileTrackNum !== null) {
          match.fileId = file.id;
          match.filePath = file.path;
          match.fileName = file.filename;
          match.confidence = Math.max(0.8, similarity);
          usedFiles.add(file.id);
          break;
        }
      }
    }
  }
  
  // Second pass: match by title similarity for unmatched tracks
  for (const match of matches) {
    if (match.fileId !== null) continue;
    
    let bestFile: AudioFile | null = null;
    let bestSimilarity = 0.4; // Minimum threshold
    
    for (const file of files) {
      if (usedFiles.has(file.id)) continue;
      
      const similarity = stringSimilarity(match.trackTitle, file.filename);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestFile = file;
      }
    }
    
    if (bestFile) {
      match.fileId = bestFile.id;
      match.filePath = bestFile.path;
      match.fileName = bestFile.filename;
      match.confidence = bestSimilarity;
      usedFiles.add(bestFile.id);
    }
  }
  
  return matches;
}

const AlbumTorrentModal: React.FC<AlbumTorrentModalProps> = ({
  isOpen,
  onClose,
  albumId,
  albumTitle,
  artistName,
  tracks,
}) => {
  const { settings } = useSettings();
  const { profile } = useAuth();
  const [isSearching, setIsSearching] = useState(false);
  const [torrents, setTorrents] = useState<TorrentInfo[]>([]);
  const [selectedTorrent, setSelectedTorrent] = useState<TorrentInfo | null>(null);
  const [trackMatches, setTrackMatches] = useState<TrackMatch[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [existingMapping, setExistingMapping] = useState<any>(null);
  const [expandedTorrent, setExpandedTorrent] = useState<string | null>(null);
  
  // New states for auto-search and manual fallback
  const [hasAutoSearched, setHasAutoSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [lastSearchQuery, setLastSearchQuery] = useState<string>('');
  const [manualQuery, setManualQuery] = useState('');
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  const autoSearchRef = useRef(false);

  // Check for existing mapping
  useEffect(() => {
    if (isOpen && albumId) {
      checkExistingMapping();
    }
  }, [isOpen, albumId]);
  
  // Auto-search when modal opens (only once per open)
  useEffect(() => {
    if (isOpen && !autoSearchRef.current && !existingMapping) {
      autoSearchRef.current = true;
      handleAutoSearch();
    }
    if (!isOpen) {
      // Reset state when modal closes
      autoSearchRef.current = false;
      setHasAutoSearched(false);
      setTorrents([]);
      setSelectedTorrent(null);
      setTrackMatches([]);
      setSearchError(null);
      setManualQuery('');
      setShowDebugInfo(false);
    }
  }, [isOpen, existingMapping]);

  const checkExistingMapping = async () => {
    const { data } = await supabase
      .from('album_torrent_mappings')
      .select('*, track_file_mappings(*)')
      .eq('album_id', albumId)
      .maybeSingle();
    
    setExistingMapping(data);
  };
  
  const handleAutoSearch = async () => {
    const apiKey = profile?.real_debrid_api_key;
    if (!apiKey) {
      setSearchError('Real-Debrid API key non configurata');
      setHasAutoSearched(true);
      return;
    }

    setIsSearching(true);
    setSearchError(null);
    setTorrents([]);

    try {
      // Clean the search query - remove - and . that break searches
      const cleanArtist = cleanSearchQuery(artistName);
      const cleanAlbum = cleanSearchQuery(albumTitle);
      
      // STEP 1: Try searching by album (artist + album)
      const albumQuery = `${cleanArtist} ${cleanAlbum}`;
      setLastSearchQuery(albumQuery);
      setManualQuery(albumQuery);
      
      console.log('Auto-searching for album:', albumQuery);
      let result = await searchStreams(apiKey, albumQuery);
      let withAudio = result.torrents.filter(t => t.files.length > 0);
      
      // If found by album, auto-match immediately
      if (withAudio.length > 0) {
        console.log(`Found ${withAudio.length} results for album search`);
        setTorrents(withAudio);
        
        // If single result or best match, auto-select and match files
        if (withAudio.length === 1) {
          handleSelectAllFiles(withAudio[0]);
        } else {
          // Find best match by checking if torrent title contains album name
          const normalizedAlbum = normalizeForMatch(albumTitle);
          const bestMatch = withAudio.find(t => 
            normalizeForMatch(t.title).includes(normalizedAlbum)
          );
          
          if (bestMatch) {
            console.log('Found best album match:', bestMatch.title);
            handleSelectAllFiles(bestMatch);
          }
          // Otherwise let user choose from the list
        }
        return;
      }
      
      // STEP 2: Fallback - search by artist only
      console.log('Album search returned 0 results, trying artist only:', cleanArtist);
      setLastSearchQuery(cleanArtist);
      
      result = await searchStreams(apiKey, cleanArtist);
      withAudio = result.torrents.filter(t => t.files.length > 0);
      
      if (withAudio.length > 0) {
        console.log(`Found ${withAudio.length} results for artist search`);
        setTorrents(withAudio);
        setSearchError(`Nessun risultato per album "${cleanAlbum}", mostro risultati per artista`);
        // Don't auto-select since these are artist-level results, user should choose
      } else {
        setSearchError(`Nessun risultato per "${albumQuery}" né per "${cleanArtist}"`);
      }
    } catch (error) {
      console.error('Auto-search error:', error);
      setSearchError(error instanceof Error ? error.message : 'Errore nella ricerca automatica');
    } finally {
      setIsSearching(false);
      setHasAutoSearched(true);
    }
  };

  const handleManualSearch = async () => {
    const apiKey = profile?.real_debrid_api_key;
    if (!apiKey || !manualQuery.trim()) return;

    setIsSearching(true);
    setSearchError(null);
    setTorrents([]);

    try {
      setLastSearchQuery(manualQuery);
      console.log('Manual searching for:', manualQuery);
      const result = await searchStreams(apiKey, manualQuery);
      
      const withAudio = result.torrents.filter(t => t.files.length > 0);
      setTorrents(withAudio);
      
      if (withAudio.length === 0) {
        setSearchError(`Nessun risultato per "${manualQuery}"`);
      }
    } catch (error) {
      console.error('Manual search error:', error);
      setSearchError(error instanceof Error ? error.message : 'Errore nella ricerca');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearch = async () => {
    const apiKey = profile?.real_debrid_api_key;
    if (!apiKey) {
      toast.error('Real-Debrid API key non configurata');
      return;
    }

    setIsSearching(true);
    setTorrents([]);
    setSelectedTorrent(null);
    setTrackMatches([]);

    try {
      // Search for album - clean the query
      const cleanArtist = cleanSearchQuery(artistName);
      const cleanAlbum = cleanSearchQuery(albumTitle);
      const searchQuery = `${cleanArtist} ${cleanAlbum}`;
      const result = await searchStreams(apiKey, searchQuery);
      
      // Filter only torrents with audio files
      const withAudio = result.torrents.filter(t => t.files.length > 0);
      setTorrents(withAudio);
      
      if (withAudio.length === 0) {
        toast.info('Nessun torrent con file audio trovato');
      }
    } catch (error) {
      console.error('Search error:', error);
      toast.error('Errore nella ricerca');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectTorrent = (torrent: TorrentInfo) => {
    setSelectedTorrent(torrent);
    setExpandedTorrent(null);
    
    // Auto-match tracks to files
    const matches = matchTracksToFiles(tracks, torrent.files);
    setTrackMatches(matches);
  };

  const handleSelectAllFiles = async (torrent: TorrentInfo) => {
    // Auto-match all tracks and save immediately
    const matches = matchTracksToFiles(tracks, torrent.files);
    
    setIsSaving(true);
    try {
      // Delete existing mapping if present
      if (existingMapping) {
        await supabase
          .from('album_torrent_mappings')
          .delete()
          .eq('album_id', albumId);
      }

      // Create album mapping
      const { data: albumMapping, error: albumError } = await supabase
        .from('album_torrent_mappings')
        .insert({
          album_id: albumId,
          album_title: albumTitle,
          artist_name: artistName,
          torrent_id: torrent.torrentId,
          torrent_title: torrent.title,
        })
        .select()
        .single();

      if (albumError) throw albumError;

      // Create track mappings for all matched tracks
      const matchedTracks = matches.filter(m => m.fileId !== null);
      
      if (matchedTracks.length > 0) {
        const { error: tracksError } = await supabase
          .from('track_file_mappings')
          .insert(
            matchedTracks.map(m => ({
              album_mapping_id: albumMapping.id,
              track_id: m.trackId,
              track_title: m.trackTitle,
              track_position: m.trackPosition,
              file_id: m.fileId!,
              file_path: m.filePath!,
              file_name: m.fileName!,
            }))
          );

        if (tracksError) throw tracksError;
        
        // Mark all matched tracks as synced
        matchedTracks.forEach(m => addSyncedTrack(m.trackId));
      }

      toast.success(`Album configurato: ${matchedTracks.length}/${tracks.length} tracce abbinate automaticamente`);
      onClose();
    } catch (error) {
      console.error('Save error:', error);
      toast.error('Errore nel salvataggio');
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangeFileMatch = (trackId: string, file: AudioFile | null) => {
    setTrackMatches(prev => prev.map(m => 
      m.trackId === trackId 
        ? { 
            ...m, 
            fileId: file?.id ?? null, 
            filePath: file?.path ?? null, 
            fileName: file?.filename ?? null,
            confidence: file ? 1 : 0,
          }
        : m
    ));
  };

  const handleSave = async () => {
    if (!selectedTorrent || trackMatches.length === 0) return;

    setIsSaving(true);
    try {
      // Delete existing mapping if present
      if (existingMapping) {
        await supabase
          .from('album_torrent_mappings')
          .delete()
          .eq('album_id', albumId);
      }

      // Create album mapping
      const { data: albumMapping, error: albumError } = await supabase
        .from('album_torrent_mappings')
        .insert({
          album_id: albumId,
          album_title: albumTitle,
          artist_name: artistName,
          torrent_id: selectedTorrent.torrentId,
          torrent_title: selectedTorrent.title,
        })
        .select()
        .single();

      if (albumError) throw albumError;

      // Create track mappings (only for matched tracks)
      const matchedTracks = trackMatches.filter(m => m.fileId !== null);
      
      if (matchedTracks.length > 0) {
        const { error: tracksError } = await supabase
          .from('track_file_mappings')
          .insert(
            matchedTracks.map(m => ({
              album_mapping_id: albumMapping.id,
              track_id: m.trackId,
              track_title: m.trackTitle,
              track_position: m.trackPosition,
              file_id: m.fileId!,
              file_path: m.filePath!,
              file_name: m.fileName!,
            }))
          );

        if (tracksError) throw tracksError;
        
        // Mark all matched tracks as synced
        matchedTracks.forEach(m => addSyncedTrack(m.trackId));
      }

      toast.success(`Salvati ${matchedTracks.length}/${tracks.length} match`);
      onClose();
    } catch (error) {
      console.error('Save error:', error);
      toast.error('Errore nel salvataggio');
    } finally {
      setIsSaving(false);
    }
  };

  const matchedCount = trackMatches.filter(m => m.fileId !== null).length;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cloud className="w-5 h-5" />
            Sincronizza Album - {albumTitle}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4">
          {/* Loading state - auto search in progress */}
          {isSearching && !hasAutoSearched && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
              <div className="text-center">
                <p className="font-medium">Ricerca automatica in corso...</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Cercando "{artistName} {albumTitle}"
                </p>
              </div>
            </div>
          )}

          {/* Existing mapping info */}
          {existingMapping && !selectedTorrent && torrents.length === 0 && !isSearching && (
            <div className="p-3 bg-primary/10 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm">
                  <span className="text-muted-foreground">Mapping esistente:</span>{' '}
                  <span className="font-medium">{existingMapping.torrent_title}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  ({existingMapping.track_file_mappings?.length || 0}/{tracks.length} tracce)
                </span>
              </div>
              <div className="flex gap-2 mt-3">
                <Button 
                  onClick={handleAutoSearch} 
                  disabled={isSearching}
                  className="flex-1"
                  variant="outline"
                >
                  {isSearching ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Ricerca...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Cerca nuovo torrent
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* No results - Manual search UI */}
          {hasAutoSearched && !isSearching && torrents.length === 0 && !existingMapping && !selectedTorrent && (
            <div className="space-y-4">
              {/* Error/No results message */}
              <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-destructive">
                      {searchError || 'Nessun risultato trovato'}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Prova a cercare manualmente con termini diversi
                    </p>
                  </div>
                </div>
              </div>
              
              {/* Manual search input */}
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    value={manualQuery}
                    onChange={(e) => setManualQuery(e.target.value)}
                    placeholder="Cerca torrent..."
                    className="flex-1"
                    onKeyDown={(e) => e.key === 'Enter' && handleManualSearch()}
                  />
                  <Button onClick={handleManualSearch} disabled={isSearching || !manualQuery.trim()}>
                    {isSearching ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Search className="w-4 h-4" />
                    )}
                  </Button>
                </div>
                
                {/* Debug info collapsible */}
                <Collapsible open={showDebugInfo} onOpenChange={setShowDebugInfo}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-muted-foreground">
                      <Info className="w-4 h-4" />
                      {showDebugInfo ? 'Nascondi' : 'Mostra'} dettagli ricerca
                      {showDebugInfo ? <ChevronDown className="w-4 h-4 ml-auto" /> : <ChevronRight className="w-4 h-4 ml-auto" />}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="mt-2 p-3 bg-muted/50 rounded-lg text-xs font-mono space-y-2">
                      <div>
                        <span className="text-muted-foreground">Query cercata:</span>
                        <p className="text-foreground break-all">"{lastSearchQuery}"</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Artista:</span>
                        <p className="text-foreground">{artistName}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Album:</span>
                        <p className="text-foreground">{albumTitle}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Tracce nell'album:</span>
                        <p className="text-foreground">{tracks.length}</p>
                      </div>
                      {searchError && (
                        <div>
                          <span className="text-destructive">Errore:</span>
                          <p className="text-destructive">{searchError}</p>
                        </div>
                      )}
                      <div className="pt-2 border-t border-border">
                        <span className="text-muted-foreground">Suggerimenti:</span>
                        <ul className="list-disc list-inside text-foreground mt-1 space-y-1">
                          <li>Prova solo il nome dell'artista</li>
                          <li>Prova nome artista + album senza spazi</li>
                          <li>Rimuovi caratteri speciali o parentesi</li>
                          <li>Prova con varianti del nome (es. "discografia")</li>
                        </ul>
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            </div>
          )}

              {/* Torrent list */}
              {torrents.length > 0 && (
                <ScrollArea className="flex-1">
                  <div className="text-sm text-muted-foreground mb-2">
                    Seleziona la cartella torrent da sincronizzare:
                  </div>
                  <div className="space-y-2">
                    {torrents.map((torrent) => (
                      <div 
                        key={torrent.torrentId}
                        className="border rounded-lg overflow-hidden"
                      >
                        <TapArea
                          as="button"
                          onTap={() => setExpandedTorrent(
                            expandedTorrent === torrent.torrentId ? null : torrent.torrentId
                          )}
                          className="w-full p-3 flex items-center justify-between hover:bg-muted/50 transition-colors touch-manipulation"
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <FolderOpen className="w-5 h-5 text-primary flex-shrink-0" />
                            <div className="text-left min-w-0">
                              <p className="font-medium truncate">{torrent.title}</p>
                              <p className="text-xs text-muted-foreground">
                                {torrent.files.length} file audio • {torrent.size} • {torrent.source}
                              </p>
                            </div>
                          </div>
                          {expandedTorrent === torrent.torrentId ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </TapArea>
                        
                        {expandedTorrent === torrent.torrentId && (
                          <div className="border-t bg-muted/30 p-3">
                            <div className="text-xs text-muted-foreground mb-2">
                              File nel torrent ({torrent.files.length}):
                            </div>
                            <div className="space-y-1 max-h-40 overflow-y-auto mb-3">
                              {torrent.files.map((file) => (
                                <div 
                                  key={file.id}
                                  className="text-sm flex items-center gap-2 py-1"
                                >
                                  <Music className="w-3 h-3 text-muted-foreground" />
                                  <span className="truncate">{file.filename}</span>
                                </div>
                              ))}
                            </div>
                            <div className="flex gap-2">
                              <Button 
                                size="sm" 
                                onClick={() => handleSelectAllFiles(torrent)}
                                className="flex-1"
                                disabled={isSaving}
                              >
                                {isSaving ? (
                                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                ) : (
                                  <Cloud className="w-4 h-4 mr-2" />
                                )}
                                Sincronizza automaticamente
                              </Button>
                              <Button 
                                size="sm" 
                                onClick={() => handleSelectTorrent(torrent)}
                                variant="outline"
                              >
                                Manuale
                              </Button>
                            </div>
                          </div>
                        )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}

          {/* Match section */}
          {selectedTorrent && (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{selectedTorrent.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {matchedCount}/{tracks.length} tracce abbinate
                  </p>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    setSelectedTorrent(null);
                    setTrackMatches([]);
                  }}
                >
                  Cambia torrent
                </Button>
              </div>

              <ScrollArea className="flex-1">
                <div className="space-y-2">
                  {trackMatches.map((match) => (
                    <div 
                      key={match.trackId}
                      className="flex items-center gap-3 p-2 rounded-lg border"
                    >
                      <span className="w-6 text-center text-sm text-muted-foreground">
                        {match.trackPosition}
                      </span>
                      
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{match.trackTitle}</p>
                      </div>

                      <ChevronRight className="w-4 h-4 text-muted-foreground" />

                      <div className="flex-1 min-w-0">
                        {match.fileId ? (
                          <div className="flex items-center gap-2">
                            <Badge 
                              variant={match.confidence > 0.7 ? "default" : "secondary"}
                              className="text-xs"
                            >
                              {Math.round(match.confidence * 100)}%
                            </Badge>
                            <span className="text-sm truncate">{match.fileName}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground italic">
                            Nessun match
                          </span>
                        )}
                      </div>

                      {/* Manual file selector */}
                      <select
                        className="text-xs bg-muted border rounded px-2 py-1 max-w-[150px]"
                        value={match.fileId?.toString() || ''}
                        onChange={(e) => {
                          const fileId = e.target.value ? parseInt(e.target.value) : null;
                          const file = fileId 
                            ? selectedTorrent.files.find(f => f.id === fileId) 
                            : null;
                          handleChangeFileMatch(match.trackId, file || null);
                        }}
                      >
                        <option value="">-- Seleziona --</option>
                        {selectedTorrent.files.map((file) => (
                          <option key={file.id} value={file.id}>
                            {file.filename}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <div className="flex gap-2 pt-2">
                <Button 
                  variant="outline" 
                  onClick={onClose}
                  className="flex-1"
                >
                  <X className="w-4 h-4 mr-2" />
                  Annulla
                </Button>
                <Button 
                  onClick={handleSave}
                  disabled={isSaving || matchedCount === 0}
                  className="flex-1"
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  Salva ({matchedCount} match)
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AlbumTorrentModal;
