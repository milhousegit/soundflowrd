import React, { useState, useRef, useEffect } from 'react';
import { Plus, ListMusic, Disc, Heart, User, Music, Loader2, Download, Wifi, WifiOff, Trash2, Crown, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSettings } from '@/contexts/SettingsContext';
import { usePlayer } from '@/contexts/PlayerContext';
import { useFavorites } from '@/hooks/useFavorites';
import { usePlaylists } from '@/hooks/usePlaylists';
import { useAuth } from '@/contexts/AuthContext';
import { useOfflineStorage } from '@/hooks/useOfflineStorage';
import TrackCard from '@/components/TrackCard';
import AlbumCard from '@/components/AlbumCard';
import ArtistCard from '@/components/ArtistCard';
import PlaylistCard from '@/components/PlaylistCard';
import TapArea from '@/components/TapArea';
import { Track, Album, Artist } from '@/types/music';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { isPast } from 'date-fns';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

type Tab = 'tracks' | 'albums' | 'artists' | 'playlists' | 'offline';

const Library: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('tracks');
  const [animationClass, setAnimationClass] = useState('');
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const { t, settings } = useSettings();
  const { playTrack } = usePlayer();
  const { isAuthenticated, profile, isAdmin, simulateFreeUser } = useAuth();
  const { getFavoritesByType, isLoading } = useFavorites();
  const { playlists, isLoading: isPlaylistsLoading } = usePlaylists();
  const { 
    offlineTracks, 
    isLoading: isOfflineLoading, 
    isOnline, 
    totalSize, 
    formatSize,
    deleteOfflineTrack,
    clearAllOfflineTracks,
  } = useOfflineStorage();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Check if user has active premium
  const isPremiumActive = !simulateFreeUser && (profile?.is_premium && 
    (!profile?.premium_expires_at || !isPast(new Date(profile.premium_expires_at))));
  const canAccessOffline = isAdmin || isPremiumActive;
  
  // Show offline tab if: user can access offline features, OR has offline tracks, OR is currently offline
  const showOfflineTab = canAccessOffline || offlineTracks.length > 0 || !isOnline;

  const baseTabs: Tab[] = ['tracks', 'albums', 'artists', 'playlists'];
  const allTabs: Tab[] = showOfflineTab ? [...baseTabs, 'offline'] : baseTabs;
  
  const tabs = [
    { id: 'tracks' as Tab, label: t('likedSongs'), icon: Heart, isPro: false },
    { id: 'albums' as Tab, label: t('albums'), icon: Disc, isPro: false },
    { id: 'artists' as Tab, label: t('artists'), icon: User, isPro: false },
    { id: 'playlists' as Tab, label: 'Playlist', icon: ListMusic, isPro: false },
    ...(showOfflineTab ? [{ id: 'offline' as Tab, label: 'Offline', icon: Download, isPro: true }] : []),
  ];

  // Swipe navigation
  const touchStartY = useRef(0);
  const touchEndY = useRef(0);
  
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
    touchEndY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = () => {
    const diffX = touchStartX.current - touchEndX.current;
    const diffY = touchStartY.current - touchEndY.current;
    const threshold = 50;
    const currentIndex = allTabs.indexOf(activeTab);

    // Only trigger horizontal swipe if horizontal movement is greater than vertical
    // This prevents interference with normal scrolling and track tapping
    if (Math.abs(diffX) > threshold && Math.abs(diffX) > Math.abs(diffY) * 1.5) {
      if (diffX > 0 && currentIndex < allTabs.length - 1) {
        // Swipe left -> next tab
        setAnimationClass('animate-slide-out-left');
        setTimeout(() => {
          setActiveTab(allTabs[currentIndex + 1]);
          setAnimationClass('animate-slide-in-left');
          setTimeout(() => setAnimationClass(''), 200);
        }, 150);
      } else if (diffX < 0 && currentIndex > 0) {
        // Swipe right -> previous tab
        setAnimationClass('animate-slide-out-right');
        setTimeout(() => {
          setActiveTab(allTabs[currentIndex - 1]);
          setAnimationClass('animate-slide-in-right');
          setTimeout(() => setAnimationClass(''), 200);
        }, 150);
      }
    }
    
    touchStartX.current = 0;
    touchEndX.current = 0;
    touchStartY.current = 0;
    touchEndY.current = 0;
  };

  const favoriteTracks = getFavoritesByType('track');
  const favoriteAlbums = getFavoritesByType('album');
  const favoriteArtists = getFavoritesByType('artist');
  const favoritePlaylists = getFavoritesByType('playlist');

  // Convert favorites to Track/Album/Artist objects
  const tracks: Track[] = favoriteTracks.map(f => f.item_data as Track);
  const albums: Album[] = favoriteAlbums.map(f => f.item_data as Album);
  const artists: Artist[] = favoriteArtists.map(f => f.item_data as Artist);
  
  // Combine user playlists with favorite playlists
  const favoritePlaylistIds = new Set(favoritePlaylists.map(f => f.item_id));

  // Convert offline tracks to Track objects
  const offlineTracksList: Track[] = offlineTracks.map(ot => ot.track);

  const handleDeleteOfflineTrack = async (trackId: string, trackTitle: string) => {
    const success = await deleteOfflineTrack(trackId);
    if (success) {
      toast({
        title: settings.language === 'it' ? 'Rimosso' : 'Removed',
        description: settings.language === 'it' 
          ? `"${trackTitle}" rimosso dalla libreria offline` 
          : `"${trackTitle}" removed from offline library`,
      });
    }
  };

  const handleClearAllOffline = async () => {
    const success = await clearAllOfflineTracks();
    if (success) {
      toast({
        title: settings.language === 'it' ? 'Libreria offline svuotata' : 'Offline library cleared',
      });
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <Heart className="w-16 h-16 text-muted-foreground mb-4" />
        <h2 className="text-xl font-bold mb-2">Accedi per vedere la tua libreria</h2>
        <p className="text-muted-foreground mb-4">I tuoi brani, album e artisti preferiti saranno qui</p>
        <Button onClick={() => navigate('/login')}>Accedi</Button>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 pb-32 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 md:mb-8">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl md:text-4xl font-bold text-foreground">{t('library')}</h1>
          {!isOnline && (
            <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-orange-500/20 text-orange-400 text-xs font-medium">
              <WifiOff className="w-3 h-3" />
              Offline
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 md:mb-8 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0">
        {tabs.map((tab) => (
          <Button
            key={tab.id}
            variant={activeTab === tab.id ? 'default' : 'secondary'}
            onClick={() => setActiveTab(tab.id)}
            className="gap-2 flex-shrink-0"
            size="sm"
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {tab.isPro && !canAccessOffline && (
              <span className="ml-1 text-[10px] font-bold bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] text-white px-1.5 py-0.5 rounded">
                PRO
              </span>
            )}
            {tab.id === 'offline' && offlineTracks.length > 0 && (
              <span className="ml-1 text-xs bg-primary/20 px-1.5 rounded-full">
                {offlineTracks.length}
              </span>
            )}
          </Button>
        ))}
      </div>

      {/* PRO Banner for Offline tab when user is not premium */}
      {activeTab === 'offline' && !canAccessOffline && (
        <div className="mb-6 p-4 rounded-xl bg-gradient-to-r from-[#8B5CF6]/20 via-[#6366F1]/10 to-[#3B82F6]/20 border border-[#8B5CF6]/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#3B82F6] flex items-center justify-center flex-shrink-0">
              <Crown className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-foreground">
                {settings.language === 'it' ? 'Funzione Premium' : 'Premium Feature'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {settings.language === 'it' 
                  ? 'Scarica brani per ascoltarli offline con un abbonamento Premium' 
                  : 'Download tracks to listen offline with a Premium subscription'}
              </p>
            </div>
          </div>
        </div>
      )}

      <div 
        className="min-h-[50vh] touch-pan-y"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {isLoading || isPlaylistsLoading || isOfflineLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className={`${animationClass}`}>
          {/* Tracks */}
          {activeTab === 'tracks' && (
            <div>
              {/* Liked Songs Header */}
              <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 mb-6 md:mb-8 p-4 md:p-6 rounded-xl bg-gradient-to-r from-purple-500/20 to-pink-500/20">
                <div className="w-24 h-24 md:w-32 md:h-32 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
                  <Heart className="w-12 md:w-16 h-12 md:h-16 text-white fill-white" />
                </div>
                <div className="text-center sm:text-left">
                  <p className="text-xs md:text-sm text-muted-foreground uppercase tracking-wider">{t('playlist')}</p>
                  <h2 className="text-2xl md:text-4xl font-bold text-foreground mb-1 md:mb-2">{t('likedSongs')}</h2>
                  <p className="text-sm md:text-base text-muted-foreground">{tracks.length} {t('tracks').toLowerCase()}</p>
                </div>
                {tracks.length > 0 && (
                  <Button
                    variant="player"
                    size="player"
                    className="ml-auto"
                    onClick={() => playTrack(tracks[0], tracks)}
                  >
                    <Music className="w-6 h-6" />
                  </Button>
                )}
              </div>

              {/* Tracks List */}
              {tracks.length > 0 ? (
                <div className="space-y-1">
                  {tracks.map((track, index) => (
                    <TrackCard 
                      key={track.id} 
                      track={track} 
                      queue={tracks}
                      index={index}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Heart className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Nessun brano nei preferiti</p>
                  <p className="text-sm">Aggiungi brani con il cuoricino</p>
                </div>
              )}
            </div>
          )}

          {/* Albums */}
          {activeTab === 'albums' && (
            <div>
              {albums.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 md:gap-6">
                  {albums.map((album) => (
                    <AlbumCard key={album.id} album={album} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Disc className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Nessun album nei preferiti</p>
                  <p className="text-sm">Aggiungi album con il cuoricino</p>
                </div>
              )}
            </div>
          )}

          {/* Artists */}
          {activeTab === 'artists' && (
            <div>
              {artists.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 md:gap-6">
                  {artists.map((artist) => (
                    <ArtistCard key={artist.id} artist={artist} />
                  ))}
                </div>
              ) : (
              <div className="text-center py-12 text-muted-foreground">
                  <User className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Nessun artista nei preferiti</p>
                  <p className="text-sm">Aggiungi artisti con il cuoricino</p>
                </div>
              )}
            </div>
          )}

          {/* Playlists */}
          {activeTab === 'playlists' && (
            <div>
              {/* User Created Playlists */}
              {playlists.length > 0 && (
                <div className="mb-8">
                  <h3 className="text-lg font-semibold mb-4 text-foreground">Le tue playlist</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 md:gap-6">
                    {playlists.map((playlist) => (
                      <PlaylistCard key={playlist.id} playlist={playlist} />
                    ))}
                  </div>
                </div>
              )}
              
              {/* Favorite Playlists (Deezer etc.) */}
              {favoritePlaylists.length > 0 && (
                <div className="mb-8">
                  <h3 className="text-lg font-semibold mb-4 text-foreground flex items-center gap-2">
                    <Heart className="w-4 h-4 text-primary fill-primary" />
                    Playlist preferite
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 md:gap-6">
                    {favoritePlaylists.map((fav) => {
                      const playlistData = fav.item_data as any;
                      // Check if it's a Deezer playlist
                      const isDeezerPlaylist = fav.item_id.startsWith('deezer-playlist-');
                      const deezerId = isDeezerPlaylist ? fav.item_id.replace('deezer-playlist-', '') : null;
                      
                      return (
                        <TapArea
                          key={fav.id}
                          onTap={() => navigate(deezerId ? `/deezer-playlist/${deezerId}` : `/playlist/${fav.item_id}`)}
                          className="group cursor-pointer touch-manipulation"
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
                            {fav.item_artist || 'Playlist'}
                          </p>
                        </TapArea>
                      );
                    })}
                  </div>
                </div>
              )}
              
              {playlists.length === 0 && favoritePlaylists.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <ListMusic className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Nessuna playlist</p>
                  <p className="text-sm">Crea playlist dal menu o salva quelle di Deezer con il cuoricino</p>
                </div>
              )}
            </div>
          )}

          {/* Offline */}
          {activeTab === 'offline' && showOfflineTab && (
            <div>
              {/* Offline Header */}
              <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 mb-6 md:mb-8 p-4 md:p-6 rounded-xl bg-gradient-to-r from-emerald-500/20 to-teal-500/20">
                <div className="w-24 h-24 md:w-32 md:h-32 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center flex-shrink-0">
                  <Download className="w-12 md:w-16 h-12 md:h-16 text-white" />
                </div>
                <div className="text-center sm:text-left flex-1">
                  <p className="text-xs md:text-sm text-muted-foreground uppercase tracking-wider">
                    {settings.language === 'it' ? 'Libreria Locale' : 'Local Library'}
                  </p>
                  <h2 className="text-2xl md:text-4xl font-bold text-foreground mb-1 md:mb-2">
                    {settings.language === 'it' ? 'Brani Offline' : 'Offline Tracks'}
                  </h2>
                  <p className="text-sm md:text-base text-muted-foreground">
                    {offlineTracks.length} {t('tracks').toLowerCase()} • {formatSize(totalSize)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {offlineTracksList.length > 0 && (
                    <>
                      <Button
                        variant="player"
                        size="player"
                        onClick={() => playTrack(offlineTracksList[0], offlineTracksList)}
                      >
                        <Music className="w-6 h-6" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="icon" className="h-12 w-12 text-destructive hover:text-destructive">
                            <Trash2 className="w-5 h-5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              {settings.language === 'it' ? 'Svuota libreria offline?' : 'Clear offline library?'}
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              {settings.language === 'it' 
                                ? `Verranno eliminati ${offlineTracks.length} brani (${formatSize(totalSize)}).` 
                                : `This will delete ${offlineTracks.length} tracks (${formatSize(totalSize)}).`}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{settings.language === 'it' ? 'Annulla' : 'Cancel'}</AlertDialogCancel>
                            <AlertDialogAction onClick={handleClearAllOffline} className="bg-destructive hover:bg-destructive/90">
                              {settings.language === 'it' ? 'Elimina tutto' : 'Delete all'}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </>
                  )}
                </div>
              </div>

              {/* PWA Limitations Banner */}
              <div className="mb-6 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 flex gap-3">
                <Info className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-200/80">
                  {settings.language === 'it' 
                    ? "A causa di alcune limitazioni delle PWA imposte da alcuni dispositivi, è necessario aprire l'app mentre si è online per poi attivare la modalità aereo e godersi le canzoni scaricate. Attenzione: se si chiude l'app e si prova a riaprirla mentre si è offline, questa potrebbe non funzionare. L'apertura va effettuata mentre si è online."
                    : "Due to certain PWA limitations imposed by some devices, you must open the app while online before enabling airplane mode to enjoy your downloaded songs. Note: if you close the app and try to reopen it while offline, it may not work. Always open the app while online first."}
                </p>
              </div>

              {/* Offline Tracks List */}
              {offlineTracksList.length > 0 ? (
                <div className="space-y-1">
                  {offlineTracks.map((offlineTrack, index) => (
                    <div key={offlineTrack.id} className="group relative">
                      <TrackCard 
                        track={offlineTrack.track} 
                        queue={offlineTracksList}
                        index={index}
                      />
                      <div className="absolute right-12 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteOfflineTrack(offlineTrack.id, offlineTrack.track.title);
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                      <div className="absolute right-2 bottom-1 text-[10px] text-muted-foreground">
                        {formatSize(offlineTrack.fileSize)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Download className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>{settings.language === 'it' ? 'Nessun brano offline' : 'No offline tracks'}</p>
                  <p className="text-sm">
                    {settings.language === 'it' 
                      ? 'Scarica brani dal player per ascoltarli senza connessione' 
                      : 'Download tracks from the player to listen offline'}
                  </p>
                </div>
              )}
            </div>
          )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Library;
