import React, { useEffect, useState } from 'react';
import { Track, Album, Artist } from '@/types/music';
import { usePlayer } from '@/contexts/PlayerContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useFavorites } from '@/hooks/useFavorites';
import { getNewReleases, getPopularArtists } from '@/lib/musicbrainz';
import AlbumCard from '@/components/AlbumCard';
import ArtistCard from '@/components/ArtistCard';
import TapArea from '@/components/TapArea';
import { Clock, TrendingUp, ListMusic, Music, Loader2 } from 'lucide-react';
import { Play, Pause } from 'lucide-react';

const Home: React.FC = () => {
  const [recentlyPlayed, setRecentlyPlayed] = useState<Track[]>([]);
  const [newReleases, setNewReleases] = useState<Album[]>([]);
  const [popularArtists, setPopularArtists] = useState<Artist[]>([]);
  const [isLoadingReleases, setIsLoadingReleases] = useState(true);
  const [isLoadingArtists, setIsLoadingArtists] = useState(true);
  
  const { settings, t } = useSettings();
  const { currentTrack, isPlaying, playTrack, toggle } = usePlayer();
  const { favorites, getFavoritesByType } = useFavorites();

  // Get country code from language
  const getCountryFromLanguage = (lang: string): string => {
    const langToCountry: Record<string, string> = {
      'it': 'IT',
      'en': 'US',
      'es': 'ES',
      'fr': 'FR',
      'de': 'DE',
      'pt': 'PT',
    };
    return langToCountry[lang] || 'IT';
  };

  const country = getCountryFromLanguage(settings.language);

  // Get favorite artists to use for recommendations
  const favoriteArtists = getFavoritesByType('artist');

  useEffect(() => {
    const stored = localStorage.getItem('recentlyPlayed');
    if (stored) {
      setRecentlyPlayed(JSON.parse(stored));
    }
  }, []);

  useEffect(() => {
    const fetchNewReleases = async () => {
      setIsLoadingReleases(true);
      try {
        // If user has favorite artists, search for their releases
        if (favoriteArtists.length > 0) {
          const artistNames = favoriteArtists.slice(0, 3).map(f => f.item_title);
          const allReleases: Album[] = [];
          
          for (const artistName of artistNames) {
            try {
              const { data } = await import('@/integrations/supabase/client').then(m => 
                m.supabase.functions.invoke('musicbrainz', {
                  body: { action: 'search-releases', query: artistName, limit: 6 },
                })
              );
              if (data) allReleases.push(...data);
            } catch (e) {
              console.error('Error fetching releases for', artistName, e);
            }
          }
          
          // Sort by release date (newest first) and dedupe
          const uniqueReleases = allReleases.reduce((acc, album) => {
            if (!acc.find(a => a.id === album.id)) acc.push(album);
            return acc;
          }, [] as Album[]);
          
          setNewReleases(uniqueReleases.slice(0, 12));
        } else {
          // Fallback to popular releases in Italy
          const releases = await getNewReleases(country);
          setNewReleases(releases);
        }
      } catch (error) {
        console.error('Failed to fetch new releases:', error);
      } finally {
        setIsLoadingReleases(false);
      }
    };

    fetchNewReleases();
  }, [country, favoriteArtists.length]);

  useEffect(() => {
    const fetchPopularArtists = async () => {
      setIsLoadingArtists(true);
      try {
        // If user has favorite artists, find similar/related artists
        if (favoriteArtists.length > 0) {
          const favoriteNames = favoriteArtists.map(f => f.item_title.toLowerCase());
          const artists = await getPopularArtists(country);
          
          // Filter out artists the user already has in favorites
          const filteredArtists = artists.filter(
            a => !favoriteNames.includes(a.name.toLowerCase())
          );
          
          setPopularArtists(filteredArtists.slice(0, 12));
        } else {
          const artists = await getPopularArtists(country);
          setPopularArtists(artists);
        }
      } catch (error) {
        console.error('Failed to fetch popular artists:', error);
      } finally {
        setIsLoadingArtists(false);
      }
    };

    fetchPopularArtists();
  }, [country, favoriteArtists.length]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t('goodMorning');
    if (hour < 18) return t('goodAfternoon');
    return t('goodEvening');
  };

  const displayRecent = recentlyPlayed.slice(0, 6);
  const { homeDisplayOptions } = settings;

  return (
    <div className="p-4 md:p-8 pb-32 space-y-8 md:space-y-10 animate-fade-in">
      {/* Welcome Header */}
      <div>
        <h1 className="text-2xl md:text-4xl font-bold text-foreground mb-1 md:mb-2">{getGreeting()}</h1>
        <p className="text-sm md:text-base text-muted-foreground">{t('whatToListen')}</p>
      </div>

      {/* Recently Played Grid */}
      {homeDisplayOptions.showRecentlyPlayed && displayRecent.length > 0 && (
        <section>
          <div className="flex items-center gap-2 md:gap-3 mb-4 md:mb-6">
            <Clock className="w-5 h-5 md:w-6 md:h-6 text-primary" />
            <h2 className="text-lg md:text-2xl font-bold text-foreground">{t('recentlyPlayed')}</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
            {displayRecent.map((track) => {
              const isCurrentTrack = currentTrack?.id === track.id;
              return (
                <TapArea
                  key={track.id}
                  onTap={() => (isCurrentTrack ? toggle() : playTrack(track, displayRecent))}
                  className="group flex items-center gap-3 md:gap-4 p-2 md:p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-all cursor-pointer touch-manipulation"
                >
                  <div className="w-12 h-12 md:w-16 md:h-16 rounded overflow-hidden flex-shrink-0 bg-muted relative">
                    {track.coverUrl ? (
                      <img src={track.coverUrl} alt={track.album} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Music className="w-5 h-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-background/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      {isCurrentTrack && isPlaying ? (
                        <Pause className="w-6 h-6 text-primary" />
                      ) : (
                        <Play className="w-6 h-6 text-foreground ml-0.5" />
                      )}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm md:text-base text-foreground truncate">{track.title}</p>
                    <p className="text-xs md:text-sm text-muted-foreground truncate">{track.artist}</p>
                  </div>
                </TapArea>
              );
            })}
          </div>
        </section>
      )}

      {/* Playlists */}
      {homeDisplayOptions.showPlaylists && (
        <section>
          <div className="flex items-center gap-2 md:gap-3 mb-4 md:mb-6">
            <ListMusic className="w-5 h-5 md:w-6 md:h-6 text-primary" />
            <h2 className="text-lg md:text-2xl font-bold text-foreground">{t('yourPlaylists')}</h2>
          </div>
          <div className="text-center py-8 bg-secondary/30 rounded-xl">
            <ListMusic className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">
              {t('language') === 'it' 
                ? "Non hai creato nessuna playlist" 
                : "You haven't created any playlists"}
            </p>
          </div>
        </section>
      )}

      {/* New Releases - ordered by popularity in selected language */}
      {homeDisplayOptions.showNewReleases && (
        <section>
          <div className="flex items-center gap-2 md:gap-3 mb-4 md:mb-6">
            <TrendingUp className="w-5 h-5 md:w-6 md:h-6 text-primary" />
            <h2 className="text-lg md:text-2xl font-bold text-foreground">{t('newReleases')}</h2>
          </div>
          {isLoadingReleases ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : newReleases.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 md:gap-6">
              {newReleases.slice(0, 12).map((album) => (
                <AlbumCard key={album.id} album={album} />
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">Nessuna nuova uscita disponibile</p>
          )}
        </section>
      )}

      {/* Popular Artists - from selected language/country */}
      {homeDisplayOptions.showPopularArtists && (
        <section>
          <h2 className="text-lg md:text-2xl font-bold text-foreground mb-4 md:mb-6">{t('popularArtists')}</h2>
          {isLoadingArtists ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : popularArtists.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 md:gap-6">
              {popularArtists.map((artist) => (
                <ArtistCard key={artist.id} artist={artist} />
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">Nessun artista disponibile</p>
          )}
        </section>
      )}
    </div>
  );
};

export default Home;
