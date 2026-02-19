import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Track, Album, Artist } from '@/types/music';
import { usePlayer } from '@/contexts/PlayerContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useFavorites } from '@/hooks/useFavorites';
import { usePlaylists } from '@/hooks/usePlaylists';
import { useRecentlyPlayed } from '@/hooks/useRecentlyPlayed';
import { useIsMobile } from '@/hooks/use-mobile';
import { getNewReleases, getPopularArtists, searchAlbums, getArtist, getCountryChart } from '@/lib/deezer';
import { supabase } from '@/integrations/supabase/client';
import AlbumCard from '@/components/AlbumCard';
import ArtistCard from '@/components/ArtistCard';
import PlaylistCard from '@/components/PlaylistCard';
import CreatePlaylistModal from '@/components/CreatePlaylistModal';
import TrackActionsModal from '@/components/TrackActionsModal';
import TapArea from '@/components/TapArea';
import AlbumCardSkeleton from '@/components/skeletons/AlbumCardSkeleton';
import ArtistCardSkeleton from '@/components/skeletons/ArtistCardSkeleton';
import { Clock, TrendingUp, ListMusic, Music, Plus, ListPlus, Loader2 } from 'lucide-react';
import { Play, Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import NotificationsDropdown from '@/components/NotificationsDropdown';
interface ChartConfig {
  id: string;
  country_code: string;
  playlist_id: string;
  playlist_title: string | null;
}

interface ChartDisplayData {
  coverUrl: string | null;
  trackCount: number;
}

// Recently played track item with long-press support
const RecentTrackItem: React.FC<{
  track: Track;
  displayRecent: Track[];
  currentTrack: Track | null;
  isPlaying: boolean;
  toggle: () => void;
  playTrack: (track: Track, queue?: Track[]) => void;
  setPlaybackSource: (source: any) => void;
  addToQueue: (tracks: Track[]) => void;
  settings: any;
  isMobile: boolean;
}> = ({ track, displayRecent, currentTrack, isPlaying, toggle, playTrack, setPlaybackSource, addToQueue, settings, isMobile }) => {
  const [showActionsModal, setShowActionsModal] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);

  const isCurrentTrack = currentTrack?.id === track.id;

  const handleTouchStart = useCallback(() => {
    longPressTriggeredRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      setShowActionsModal(true);
      if (navigator.vibrate) navigator.vibrate(30);
    }, 500);
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleTap = useCallback(() => {
    if (longPressTriggeredRef.current) return;
    if (isCurrentTrack) {
      toggle();
    } else {
      setPlaybackSource({ type: 'playlist', name: settings.language === 'it' ? 'Ascoltati di recente' : 'Recently Played', path: '/' });
      playTrack(track, displayRecent);
    }
  }, [isCurrentTrack, toggle, playTrack, track, displayRecent, setPlaybackSource, settings.language]);

  return (
    <>
      <div
        onTouchStart={isMobile ? handleTouchStart : undefined}
        onTouchEnd={isMobile ? handleTouchEnd : undefined}
        onTouchCancel={isMobile ? handleTouchEnd : undefined}
        onClick={handleTap}
        className="group flex items-center gap-2 md:gap-4 p-2 md:p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-all cursor-pointer touch-manipulation"
      >
        <div className="w-10 h-10 md:w-16 md:h-16 rounded overflow-hidden flex-shrink-0 bg-muted relative">
          {track.coverUrl ? (
            <img src={track.coverUrl} alt={track.album} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Music className="w-4 h-4 text-muted-foreground" />
            </div>
          )}
          <div className="absolute inset-0 bg-background/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
            {isCurrentTrack && isPlaying ? (
              <Pause className="w-4 h-4 md:w-6 md:h-6 text-primary" />
            ) : (
              <Play className="w-4 h-4 md:w-6 md:h-6 text-foreground ml-0.5" />
            )}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-xs md:text-base text-foreground truncate">{track.title}</p>
          <p className="text-[10px] md:text-sm text-muted-foreground truncate">{track.artist}</p>
        </div>
      </div>
      <TrackActionsModal
        track={track}
        isOpen={showActionsModal}
        onClose={() => setShowActionsModal(false)}
        onAddToQueue={() => {
          addToQueue([track]);
          toast.success('Aggiunto alla coda');
        }}
      />
    </>
  );
};

const Home: React.FC = () => {
  const [newReleases, setNewReleases] = useState<Album[]>([]);
  const [popularArtists, setPopularArtists] = useState<Artist[]>([]);
  const [chartConfigs, setChartConfigs] = useState<ChartConfig[]>([]);
  const [chartDisplayData, setChartDisplayData] = useState<Record<string, ChartDisplayData>>({});
  const [isLoadingReleases, setIsLoadingReleases] = useState(true);
  const [isLoadingArtists, setIsLoadingArtists] = useState(true);
  const [isLoadingCharts, setIsLoadingCharts] = useState(true);
  const [showCreatePlaylist, setShowCreatePlaylist] = useState(false);
  const [isAddingToPlaylist, setIsAddingToPlaylist] = useState<string | null>(null);
  
  const { settings, t } = useSettings();
  const { currentTrack, isPlaying, playTrack, toggle, addToQueue, setPlaybackSource } = usePlayer();
  const { favorites, getFavoritesByType } = useFavorites();
  const { playlists, isLoading: isLoadingPlaylists, addTrackToPlaylist } = usePlaylists();
  const { recentTracks, isLoading: isLoadingRecent } = useRecentlyPlayed();
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  // Get all favorites to extract unique artist names
  const favoriteArtists = getFavoritesByType('artist');
  const favoriteTracks = getFavoritesByType('track');
  const favoriteAlbums = getFavoritesByType('album');

  // Extract unique artist names from all favorites
  const getUniqueArtistNames = (): string[] => {
    const artistSet = new Set<string>();
    
    // From favorite artists
    favoriteArtists.forEach(f => {
      if (f.item_title) artistSet.add(f.item_title);
    });
    
    // From favorite tracks (artist name is in item_artist)
    favoriteTracks.forEach(f => {
      if (f.item_artist) artistSet.add(f.item_artist);
    });
    
    // From favorite albums (artist name is in item_artist)
    favoriteAlbums.forEach(f => {
      if (f.item_artist) artistSet.add(f.item_artist);
    });
    
    return Array.from(artistSet);
  };

  // recentTracks now comes from useRecentlyPlayed hook (synced with database)

  useEffect(() => {
    const fetchNewReleases = async () => {
      setIsLoadingReleases(true);
      try {
        const uniqueArtistNames = getUniqueArtistNames();
        
        // If user has favorites, search for releases from those artists
        if (uniqueArtistNames.length > 0) {
          const allReleases: Album[] = [];
          
          // Search releases for up to 5 artists using Deezer
          for (const artistName of uniqueArtistNames.slice(0, 5)) {
            try {
              const albums = await searchAlbums(artistName);
              // Filter to only include releases that match the artist name
              const artistReleases = albums.filter((album: Album) => 
                album.artist?.toLowerCase().includes(artistName.toLowerCase()) ||
                artistName.toLowerCase().includes(album.artist?.toLowerCase() || '')
              );
              allReleases.push(...artistReleases.slice(0, 6));
            } catch (e) {
              console.error('Error fetching releases for', artistName, e);
            }
          }
          
          // Sort by release date (newest first) and dedupe
          const uniqueReleases = allReleases
            .reduce((acc, album) => {
              if (!acc.find(a => a.id === album.id)) acc.push(album);
              return acc;
            }, [] as Album[])
            .sort((a, b) => {
              const dateA = a.releaseDate ? new Date(a.releaseDate).getTime() : 0;
              const dateB = b.releaseDate ? new Date(b.releaseDate).getTime() : 0;
              return dateB - dateA;
            });
          
          setNewReleases(uniqueReleases.slice(0, 12));
        } else {
          // No favorites - get new releases from Deezer
          try {
            const releases = await getNewReleases();
            setNewReleases(releases.slice(0, 12));
          } catch (cacheError) {
            console.error('Failed to fetch new releases:', cacheError);
            setNewReleases([]);
          }
        }
      } catch (error) {
        console.error('Failed to fetch new releases:', error);
      } finally {
        setIsLoadingReleases(false);
      }
    };

    fetchNewReleases();
  }, [favorites.length]);

  useEffect(() => {
    const fetchArtistsForYou = async () => {
      setIsLoadingArtists(true);
      try {
        // Get favorite artists (up to 3)
        const favoriteArtistItems = getFavoritesByType('artist').slice(0, 3);
        
        if (favoriteArtistItems.length > 0) {
          // We have favorite artists - show them + their related artists
          const favoriteArtistsData: Artist[] = [];
          const relatedArtistsData: Artist[] = [];
          const seenArtistIds = new Set<string>();
          
          // Get full data for favorite artists and their related artists
          for (const fav of favoriteArtistItems) {
            try {
              const artistData = await getArtist(fav.item_id);
              
              // Add favorite artist
              if (!seenArtistIds.has(artistData.id)) {
                favoriteArtistsData.push({
                  id: artistData.id,
                  name: artistData.name,
                  imageUrl: artistData.imageUrl,
                  popularity: artistData.popularity,
                });
                seenArtistIds.add(artistData.id);
              }
              
              // Add related artists
              for (const related of (artistData.relatedArtists || []).slice(0, 3)) {
                if (!seenArtistIds.has(related.id)) {
                  relatedArtistsData.push(related);
                  seenArtistIds.add(related.id);
                }
              }
            } catch (e) {
              console.error('Error fetching artist data:', e);
            }
          }
          
          // Combine: favorite artists first, then related artists
          const combined = [...favoriteArtistsData, ...relatedArtistsData];
          setPopularArtists(combined.slice(0, 12));
        } else {
          // No favorite artists - fall back to popular artists
          const artists = await getPopularArtists();
          setPopularArtists(artists.slice(0, 12));
        }
      } catch (error) {
        console.error('Failed to fetch artists for you:', error);
      } finally {
        setIsLoadingArtists(false);
      }
    };

    fetchArtistsForYou();
  }, [favorites.length]);

  // Fetch chart configurations and their display data
  useEffect(() => {
    const fetchChartConfigs = async () => {
      setIsLoadingCharts(true);
      try {
        const { data, error } = await supabase
          .from('chart_configurations')
          .select('*')
          .order('country_code');
        
        if (error) throw error;
        const configs = data || [];
        setChartConfigs(configs);
        
        // Fetch display data for each chart
        const displayData: Record<string, ChartDisplayData> = {};
        
        for (const chart of configs) {
          const playlistId = chart.playlist_id;
          
          if (playlistId.startsWith('sf:')) {
            // SoundFlow playlist - get from DB
            const sfId = playlistId.replace('sf:', '');
            const [playlistResult, tracksResult] = await Promise.all([
              supabase.from('playlists').select('cover_url').eq('id', sfId).single(),
              supabase.from('playlist_tracks').select('id', { count: 'exact' }).eq('playlist_id', sfId)
            ]);
            
            displayData[chart.id] = {
              coverUrl: playlistResult.data?.cover_url || null,
              trackCount: tracksResult.count || 0
            };
          } else if (playlistId.length > 6) {
            // Long ID = Deezer playlist - fetch from API using POST with JSON body
            try {
              const response = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/deezer`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'get-playlist', id: playlistId })
                }
              );
              if (response.ok) {
                const playlist = await response.json();
                if (playlist && !playlist.error) {
                  displayData[chart.id] = {
                    coverUrl: playlist.coverUrl || null,
                    trackCount: playlist.trackCount || 0
                  };
                } else {
                  displayData[chart.id] = { coverUrl: null, trackCount: 0 };
                }
              } else {
                displayData[chart.id] = { coverUrl: null, trackCount: 0 };
              }
            } catch (e) {
              console.error('Error fetching Deezer playlist:', e);
              displayData[chart.id] = { coverUrl: null, trackCount: 0 };
            }
          } else {
            // Short ID = Editorial chart ID - can't get cover directly, skip
            displayData[chart.id] = { coverUrl: null, trackCount: 0 };
          }
        }
        
        setChartDisplayData(displayData);
      } catch (error) {
        console.error('Failed to fetch chart configurations:', error);
      } finally {
        setIsLoadingCharts(false);
      }
    };

    fetchChartConfigs();
  }, []);

  // Navigate to chart playlist
  const handleOpenChart = (chart: ChartConfig) => {
    const playlistId = chart.playlist_id;
    
    if (playlistId.startsWith('sf:')) {
      // SoundFlow playlist - navigate to local playlist page
      const sfId = playlistId.replace('sf:', '');
      navigate(`/playlist/${sfId}`);
    } else {
      // Deezer playlist - navigate to deezer playlist page
      navigate(`/deezer-playlist/${playlistId}`);
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t('goodMorning');
    if (hour < 18) return t('goodAfternoon');
    return t('goodEvening');
  };

  const displayRecent = recentTracks.slice(0, 6);
  const { homeDisplayOptions } = settings;
  const hasAnyFavorites = favorites.length > 0;

  return (
    <div className="p-4 md:p-8 pb-32 space-y-8 md:space-y-10 animate-fade-in">
      {/* Welcome Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h1 className="text-2xl md:text-4xl font-bold text-foreground mb-1 md:mb-2">{getGreeting()}</h1>
          <p className="text-sm md:text-base text-muted-foreground">{t('whatToListen')}</p>
        </div>
        {/* Notifications */}
        <div className="ml-2">
          <NotificationsDropdown />
        </div>
      </div>

      {/* Recently Played Grid - 2 columns on mobile */}
      {homeDisplayOptions.showRecentlyPlayed && displayRecent.length > 0 && (
        <section>
          <div className="flex items-center gap-2 md:gap-3 mb-4 md:mb-6">
            <Clock className="w-5 h-5 md:w-6 md:h-6 text-primary" />
            <h2 className="text-lg md:text-2xl font-bold text-foreground">{t('recentlyPlayed')}</h2>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
            {displayRecent.map((track) => (
              <RecentTrackItem
                key={track.id}
                track={track}
                displayRecent={displayRecent}
                currentTrack={currentTrack}
                isPlaying={isPlaying}
                toggle={toggle}
                playTrack={playTrack}
                setPlaybackSource={setPlaybackSource}
                addToQueue={addToQueue}
                settings={settings}
                isMobile={isMobile}
              />
            ))}
          </div>
        </section>
      )}

      {/* Playlists - Horizontal scroll on mobile */}
      {homeDisplayOptions.showPlaylists && (
        <section>
          <div className="flex items-center justify-between mb-4 md:mb-6">
            <div className="flex items-center gap-2 md:gap-3">
              <ListMusic className="w-5 h-5 md:w-6 md:h-6 text-primary" />
              <h2 className="text-lg md:text-2xl font-bold text-foreground">{t('yourPlaylists')}</h2>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setShowCreatePlaylist(true)}
              className="text-primary"
            >
              <Plus className="w-4 h-4 mr-1" />
              Crea
            </Button>
          </div>
          
          {(() => {
            const favoritePlaylists = getFavoritesByType('playlist');
            const allPlaylistsEmpty = playlists.length === 0 && favoritePlaylists.length === 0;
            
            if (isLoadingPlaylists) {
              return (
                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex-shrink-0 w-32">
                      <AlbumCardSkeleton />
                    </div>
                  ))}
                </div>
              );
            }
            
            if (allPlaylistsEmpty) {
              return (
                <div 
                  className="text-center py-8 bg-secondary/30 rounded-xl cursor-pointer hover:bg-secondary/50 transition-colors"
                  onClick={() => setShowCreatePlaylist(true)}
                >
                  <ListMusic className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">
                    {t('language') === 'it' 
                      ? "Crea la tua prima playlist o salva quelle Deezer" 
                      : "Create your first playlist or save Deezer ones"}
                  </p>
                  <Button variant="outline" size="sm" className="mt-3">
                    <Plus className="w-4 h-4 mr-1" />
                    Nuova Playlist
                  </Button>
                </div>
              );
            }
            
            return (
              <div className="flex gap-3 md:gap-6 overflow-x-auto pb-2 md:grid md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 md:overflow-visible scrollbar-hide">
                {/* User created playlists */}
                {playlists.map((playlist) => (
                  <div key={playlist.id} className="flex-shrink-0 w-32 md:w-auto">
                    <PlaylistCard playlist={playlist} />
                  </div>
                ))}
                {/* Deezer favorite playlists */}
                {favoritePlaylists.map((fav) => {
                  const isDeezerPlaylist = fav.item_id.startsWith('deezer-playlist-');
                  const deezerId = isDeezerPlaylist ? fav.item_id.replace('deezer-playlist-', '') : null;
                  
                  return (
                    <TapArea
                      key={fav.id}
                      onTap={() => {
                        if (deezerId) {
                          navigate(`/deezer-playlist/${deezerId}`);
                        }
                      }}
                      className="flex-shrink-0 w-32 md:w-auto group cursor-pointer touch-manipulation"
                    >
                      <div className="relative aspect-square rounded-lg overflow-hidden mb-2 md:mb-3 bg-muted">
                        {fav.item_cover_url ? (
                          <img
                            src={fav.item_cover_url}
                            alt={fav.item_title}
                            className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <ListMusic className="w-8 md:w-12 h-8 md:h-12 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <h3 className="font-medium text-sm text-foreground truncate">
                        {fav.item_title}
                      </h3>
                      <p className="text-xs text-muted-foreground truncate">
                        Playlist
                      </p>
                    </TapArea>
                  );
                })}
              </div>
            );
          })()}
        </section>
      )}

      <CreatePlaylistModal 
        open={showCreatePlaylist} 
        onOpenChange={setShowCreatePlaylist}
      />

      {/* New Releases - ordered by popularity in selected language */}
      {homeDisplayOptions.showNewReleases && (
        <section>
          <div className="flex items-center gap-2 md:gap-3 mb-4 md:mb-6">
            <TrendingUp className="w-5 h-5 md:w-6 md:h-6 text-primary" />
            <h2 className="text-lg md:text-2xl font-bold text-foreground">{t('newReleases')}</h2>
          </div>
          {isLoadingReleases ? (
            <div className="flex gap-3 md:gap-6 overflow-x-auto pb-2 md:grid md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 md:overflow-visible scrollbar-hide">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex-shrink-0 w-32 md:w-auto">
                  <AlbumCardSkeleton />
                </div>
              ))}
            </div>
          ) : newReleases.length > 0 ? (
            <div className="flex gap-3 md:gap-6 overflow-x-auto pb-2 md:grid md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 md:overflow-visible scrollbar-hide">
              {newReleases.slice(0, 12).map((album) => (
                <div key={album.id} className="flex-shrink-0 w-32 md:w-auto">
                  <AlbumCard album={album} />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 bg-secondary/30 rounded-xl">
              <TrendingUp className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">
                {hasAnyFavorites 
                  ? (t('language') === 'it' 
                      ? "Nessuna nuova uscita dai tuoi artisti preferiti" 
                      : "No new releases from your favorite artists")
                  : (t('language') === 'it' 
                      ? "Aggiungi artisti, brani o album ai preferiti per vedere le loro nuove uscite" 
                      : "Add artists, tracks or albums to favorites to see their new releases")
                }
              </p>
            </div>
          )}
        </section>
      )}

      {/* Popular Artists - Horizontal scroll on mobile */}
      {homeDisplayOptions.showPopularArtists && (
        <section>
          <h2 className="text-lg md:text-2xl font-bold text-foreground mb-4 md:mb-6">
            {t('language') === 'it' ? 'Artisti per te' : 'Artists for you'}
          </h2>
          {isLoadingArtists ? (
            <div className="flex gap-3 md:gap-6 overflow-x-auto pb-2 md:grid md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 md:overflow-visible scrollbar-hide">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex-shrink-0 w-32 md:w-auto">
                  <ArtistCardSkeleton />
                </div>
              ))}
            </div>
          ) : popularArtists.length > 0 ? (
            <div className="flex gap-3 md:gap-6 overflow-x-auto pb-2 md:grid md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 md:overflow-visible scrollbar-hide">
              {popularArtists.map((artist) => (
                <div key={artist.id} className="flex-shrink-0 w-32 md:w-auto">
                  <ArtistCard artist={artist} />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">Nessun artista disponibile</p>
          )}
        </section>
      )}

      {/* Charts - Same style as playlists */}
      {homeDisplayOptions.showTopCharts && (
        <section>
          <h2 className="text-lg md:text-2xl font-bold text-foreground mb-4 md:mb-6">
            {settings.language === 'it' ? 'Classifiche' : 'Charts'}
          </h2>
          {isLoadingCharts ? (
            <div className="flex gap-3 md:gap-6 overflow-x-auto pb-2 md:grid md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 md:overflow-visible scrollbar-hide">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex-shrink-0 w-32 md:w-auto">
                  <AlbumCardSkeleton />
                </div>
              ))}
            </div>
          ) : chartConfigs.length > 0 ? (
            <div className="flex gap-3 md:gap-6 overflow-x-auto pb-2 md:grid md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 md:overflow-visible scrollbar-hide">
              {chartConfigs.map((chart) => {
                const countryNames: Record<string, { it: string; en: string }> = {
                  'IT': { it: 'Italia', en: 'Italy' },
                  'US': { it: 'Stati Uniti', en: 'United States' },
                  'ES': { it: 'Spagna', en: 'Spain' },
                  'FR': { it: 'Francia', en: 'France' },
                  'DE': { it: 'Germania', en: 'Germany' },
                  'PT': { it: 'Portogallo', en: 'Portugal' },
                  'GB': { it: 'Regno Unito', en: 'United Kingdom' },
                  'BR': { it: 'Brasile', en: 'Brazil' },
                };
                
                const countryInfo = countryNames[chart.country_code] || { 
                  it: chart.country_code, 
                  en: chart.country_code
                };
                const displayName = chart.playlist_title || (settings.language === 'it' 
                  ? `Top ${countryInfo.it}` 
                  : `Top ${countryInfo.en}`);
                
                const displayData = chartDisplayData[chart.id];
                const trackCount = displayData?.trackCount || 0;
                const coverUrl = displayData?.coverUrl;
                
                return (
                  <TapArea
                    key={chart.id}
                    onTap={() => handleOpenChart(chart)}
                    className="flex-shrink-0 w-32 md:w-auto cursor-pointer group touch-manipulation"
                  >
                    <div className="relative aspect-square rounded-lg overflow-hidden mb-2 md:mb-3 bg-muted">
                      {coverUrl ? (
                        <img 
                          src={coverUrl} 
                          alt={displayName} 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
                          <ListMusic className="w-12 h-12 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <h3 className="font-medium text-sm text-foreground truncate">
                      {displayName}
                    </h3>
                    <p className="text-xs text-muted-foreground truncate">
                      {trackCount} {settings.language === 'it' ? 'brani' : 'tracks'}
                    </p>
                  </TapArea>
                );
              })}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">
              {settings.language === 'it' ? 'Nessuna classifica disponibile' : 'No charts available'}
            </p>
          )}
        </section>
      )}
    </div>
  );
};

export default Home;
