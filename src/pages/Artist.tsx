import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Play, Shuffle, User, ChevronDown, ChevronUp, Disc, Music } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ArtistPageSkeleton from '@/components/skeletons/ArtistPageSkeleton';
import BackButton from '@/components/BackButton';
import TrackCard from '@/components/TrackCard';
import AlbumCard from '@/components/AlbumCard';
import ArtistCard from '@/components/ArtistCard';
import FavoriteButton from '@/components/FavoriteButton';
import AdminArtistEditor from '@/components/AdminArtistEditor';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { useSettings } from '@/contexts/SettingsContext';
import { usePlayer, type PlaybackSource } from '@/contexts/PlayerContext';
import { useAuth } from '@/contexts/AuthContext';
import { getArtist, getArtistPlaylists, DeezerPlaylist } from '@/lib/deezer';
import { supabase } from '@/integrations/supabase/client';
import { Artist as ArtistType, Album, Track } from '@/types/music';

interface HiddenItem {
  id: string;
  artist_id: string;
  item_id: string;
  item_type: 'track' | 'album' | 'playlist';
  item_title: string;
}

const Artist: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { playTrack, setPlaybackSource } = usePlayer();
  const { t } = useSettings();
  const [artist, setArtist] = useState<ArtistType | null>(null);
  const [releases, setReleases] = useState<Album[]>([]);
  const [topTracks, setTopTracks] = useState<Track[]>([]);
  const [relatedArtists, setRelatedArtists] = useState<ArtistType[]>([]);
  const [artistPlaylists, setArtistPlaylists] = useState<DeezerPlaylist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAllTracks, setShowAllTracks] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [hiddenItems, setHiddenItems] = useState<HiddenItem[]>([]);
  const { user } = useAuth();

  // Use artist image or fallback to latest album cover
  const artistImage = artist?.imageUrl || (releases.length > 0 ? releases[0]?.coverUrl : undefined);

  // Check admin status
  useEffect(() => {
    const checkAdmin = async () => {
      if (!user) {
        setIsAdmin(false);
        return;
      }
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle();
      setIsAdmin(!!data);
    };
    checkAdmin();
  }, [user]);

  // Fetch hidden items for this artist
  useEffect(() => {
    const fetchHiddenItems = async () => {
      if (!id) return;
      const { data } = await supabase
        .from('artist_hidden_items')
        .select('*')
        .eq('artist_id', id);
      if (data) {
        setHiddenItems(data as HiddenItem[]);
      }
    };
    fetchHiddenItems();
  }, [id]);

  const handleHiddenItemsChange = useCallback((items: HiddenItem[]) => {
    setHiddenItems(items);
  }, []);

  const handlePlaylistsChange = useCallback((playlists: DeezerPlaylist[]) => {
    setArtistPlaylists(playlists);
  }, []);

  useEffect(() => {
    const fetchArtist = async () => {
      if (!id) return;
      setIsLoading(true);
      
      try {
        const artistData = await getArtist(id);
        
        setArtist(artistData);
        
        // Sort releases by date (most recent first)
        const sortedReleases = (artistData.releases || []).sort((a, b) => {
          const dateA = a.releaseDate ? new Date(a.releaseDate).getTime() : 0;
          const dateB = b.releaseDate ? new Date(b.releaseDate).getTime() : 0;
          return dateB - dateA;
        });
        setReleases(sortedReleases);
        
        // Use top tracks from artist data
        setTopTracks((artistData.topTracks || []).slice(0, 20));
        
        // Related artists
        setRelatedArtists((artistData.relatedArtists || []).slice(0, 10));
        
        // Fetch artist playlists - first check database for saved playlists
        const { data: savedPlaylists } = await supabase
          .from('artist_playlists')
          .select('*')
          .eq('artist_id', id)
          .order('position', { ascending: true });

        if (savedPlaylists && savedPlaylists.length > 0) {
          // Use saved playlists from database
          const dbPlaylists: DeezerPlaylist[] = savedPlaylists.map((p: any) => ({
            id: p.playlist_type === 'local' ? `local-${p.playlist_id}` : p.playlist_id,
            title: p.playlist_title,
            coverUrl: p.playlist_cover_url || '',
            trackCount: p.playlist_track_count || 0,
            creator: p.playlist_type === 'local' ? 'SoundFlow' : 'Deezer',
          }));
          setArtistPlaylists(dbPlaylists);
        } else if (artistData.name) {
          // Fallback: fetch from Deezer API
          const deezerPlaylists = await getArtistPlaylists(artistData.name, id).catch(() => []);
          setArtistPlaylists(deezerPlaylists);
        }
      } catch (error) {
        console.error('Failed to fetch artist:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchArtist();
  }, [id]);

  if (isLoading) {
    return <ArtistPageSkeleton />;
  }

  if (!artist) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">{t('artist')} not found</p>
      </div>
    );
  }

  // Filter out hidden items
  const isHidden = (itemId: string, itemType: string) =>
    hiddenItems.some(h => h.item_id === itemId && h.item_type === itemType);

  const visibleTopTracks = topTracks.filter(t => !isHidden(t.id, 'track'));
  const visibleReleases = releases.filter(r => !isHidden(r.id, 'album'));
  const visiblePlaylists = artistPlaylists.filter(p => !isHidden(String(p.id), 'playlist'));

  const handlePlayAll = () => {
    if (visibleTopTracks.length > 0) {
      setPlaybackSource({ type: 'artist', name: artist?.name || null, path: `/artist/${id}` });
      playTrack(visibleTopTracks[0], visibleTopTracks);
    }
  };

  const handleShuffle = () => {
    if (visibleTopTracks.length > 0) {
      const shuffled = [...visibleTopTracks].sort(() => Math.random() - 0.5);
      setPlaybackSource({ type: 'artist', name: artist?.name || null, path: `/artist/${id}` });
      playTrack(shuffled[0], shuffled);
    }
  };

  // Get latest release (album or single) - from visible releases
  const latestRelease = visibleReleases[0];
  
  // Separate albums from singles/EPs - from visible releases
  const albums = visibleReleases.filter(r => (r as any).recordType === 'album' || !(r as any).recordType);
  const singlesAndEps = visibleReleases.filter(r => (r as any).recordType === 'single' || (r as any).recordType === 'ep');
  
  // Tracks to display (5 by default, all if expanded)
  const displayedTracks = showAllTracks ? visibleTopTracks : visibleTopTracks.slice(0, 5);

  return (
    <div className="pb-32 animate-fade-in relative">
      {/* Back button mobile */}
      <div className="absolute top-4 left-4 z-10">
        <BackButton />
      </div>
      
      {/* Hero Section */}
      <div className="relative h-72 md:h-80 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/20 to-background" />
        {artistImage && (
          <img 
            src={artistImage} 
            alt={artist.name}
            className="absolute inset-0 w-full h-full object-cover opacity-30 blur-xl"
          />
        )}
        <div className="absolute bottom-0 left-0 right-0 p-4 md:p-8 flex flex-col md:flex-row items-center md:items-end gap-4 md:gap-6">
          <div className="w-32 h-32 md:w-48 md:h-48 rounded-full overflow-hidden bg-muted shadow-2xl flex-shrink-0">
            {artistImage ? (
              <img src={artistImage} alt={artist.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <User className="w-16 md:w-24 h-16 md:h-24 text-muted-foreground" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0 text-center md:text-left">
            <p className="text-xs md:text-sm text-foreground/70 uppercase tracking-wider mb-1">{t('artist')}</p>
            <h1 className="text-3xl md:text-6xl font-bold text-foreground mb-2 md:mb-4 truncate">{artist.name}</h1>
            {artist.genres && artist.genres.length > 0 && (
              <div className="flex flex-wrap justify-center md:justify-start gap-2">
                {artist.genres.slice(0, 3).map(genre => (
                  <span key={genre} className="px-2 md:px-3 py-1 rounded-full bg-secondary text-xs md:text-sm text-secondary-foreground">
                    {genre}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 md:px-8 py-4 md:py-6 flex items-center gap-3 md:gap-4">
        <Button variant="player" size="player" onClick={handlePlayAll} disabled={visibleTopTracks.length === 0}>
          <Play className="w-5 md:w-6 h-5 md:h-6 ml-0.5" />
        </Button>
        <Button variant="ghost" size="icon" className="w-10 h-10 md:w-12 md:h-12" onClick={handleShuffle} disabled={visibleTopTracks.length === 0}>
          <Shuffle className="w-5 h-5 md:w-6 md:h-6" />
        </Button>
        <FavoriteButton itemType="artist" item={artist} size="md" variant="ghost" />
        
        {/* Admin editor button */}
        {isAdmin && id && (
          <div className="ml-auto">
            <AdminArtistEditor
              artistId={id}
              artistName={artist.name}
              tracks={topTracks}
              albums={releases}
              playlists={artistPlaylists}
              onHiddenItemsChange={handleHiddenItemsChange}
              onPlaylistsChange={handlePlaylistsChange}
            />
          </div>
        )}
      </div>

      {/* Popular Tracks - 5 visible, expand to show all */}
      {visibleTopTracks.length > 0 && (
        <section className="px-4 md:px-8 mb-8 md:mb-10">
          <h2 className="text-lg md:text-2xl font-bold text-foreground mb-3 md:mb-4">{t('popular')}</h2>
          <div className="space-y-1">
            {displayedTracks.map((track, index) => (
              <TrackCard 
                key={track.id} 
                track={track}
                queue={visibleTopTracks}
                index={index}
                showArtist={false}
              />
            ))}
          </div>
          {visibleTopTracks.length > 5 && (
            <Button
              variant="ghost"
              className="w-full mt-2 text-muted-foreground hover:text-foreground"
              onClick={() => setShowAllTracks(!showAllTracks)}
            >
              {showAllTracks ? (
                <>
                  <ChevronUp className="w-4 h-4 mr-2" />
                  Mostra meno
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4 mr-2" />
                  Visualizza altro ({visibleTopTracks.length - 5} brani)
                </>
              )}
            </Button>
          )}
        </section>
      )}

      {/* Latest Release - Horizontal banner */}
      {latestRelease && (
        <section className="px-4 md:px-8 mb-8 md:mb-10">
          <h2 className="text-lg md:text-2xl font-bold text-foreground mb-3 md:mb-4">Ultima uscita</h2>
          <div 
            className="flex items-center gap-4 p-3 rounded-xl bg-card hover:bg-card/80 transition-colors cursor-pointer group"
            onClick={() => navigate(`/album/${latestRelease.id}`)}
          >
            <div className="w-20 h-20 md:w-24 md:h-24 rounded-lg overflow-hidden bg-muted flex-shrink-0">
              {latestRelease.coverUrl ? (
                <img 
                  src={latestRelease.coverUrl} 
                  alt={latestRelease.title} 
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Disc className="w-8 h-8 text-muted-foreground" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground truncate">{latestRelease.title}</p>
              <p className="text-sm text-muted-foreground truncate">{artist.name}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {latestRelease.releaseDate ? new Date(latestRelease.releaseDate).getFullYear() : ''} • {(latestRelease as any).recordType === 'single' ? 'Singolo' : (latestRelease as any).recordType === 'ep' ? 'EP' : 'Album'}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Artist Playlists - Horizontal scroll */}
      {visiblePlaylists.length > 0 && (
        <section className="px-4 md:px-8 mb-8 md:mb-10">
          <h2 className="text-lg md:text-2xl font-bold text-foreground mb-3 md:mb-4">Playlist dell'artista</h2>
          <ScrollArea className="w-full whitespace-nowrap">
            <div className="flex gap-3 md:gap-4 pb-4">
              {visiblePlaylists.map((playlist) => (
                <div 
                  key={playlist.id} 
                  className="flex-shrink-0 w-32 md:w-40"
                  onClick={() => navigate(`/deezer-playlist/${playlist.id}`)}
                >
                  <div className="group relative cursor-pointer">
                    <div className="relative aspect-square rounded-lg overflow-hidden bg-muted mb-2">
                      {playlist.coverUrl ? (
                        <img 
                          src={playlist.coverUrl} 
                          alt={playlist.title} 
                          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Music className="w-8 h-8 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <p className="text-sm font-medium text-foreground truncate">{playlist.title}</p>
                    <p className="text-xs text-muted-foreground">{playlist.trackCount} brani</p>
                  </div>
                </div>
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </section>
      )}

      {/* Discography - Albums - Horizontal scroll */}
      {albums.length > 0 && (
        <section className="px-4 md:px-8 mb-8 md:mb-10">
          <div className="flex items-center gap-2 mb-3 md:mb-4">
            <Disc className="w-5 h-5 text-primary" />
            <h2 className="text-lg md:text-2xl font-bold text-foreground">{t('discography')}</h2>
          </div>
          <ScrollArea className="w-full whitespace-nowrap">
            <div className="flex gap-3 md:gap-4 pb-4">
              {albums.map((album) => (
                <div key={album.id} className="flex-shrink-0 w-[120px] md:w-[160px]">
                  <AlbumCard album={{ ...album, artist: artist.name, artistId: artist.id }} />
                </div>
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </section>
      )}

      {/* Singles & EPs - Horizontal scroll */}
      {singlesAndEps.length > 0 && (
        <section className="px-4 md:px-8 mb-8 md:mb-10">
          <h2 className="text-lg md:text-2xl font-bold text-foreground mb-3 md:mb-4">Singoli ed EP</h2>
          <ScrollArea className="w-full whitespace-nowrap">
            <div className="flex gap-3 md:gap-4 pb-4">
              {singlesAndEps.map((album) => (
                <div key={album.id} className="flex-shrink-0 w-[120px] md:w-[160px]">
                  <AlbumCard album={{ ...album, artist: artist.name, artistId: artist.id }} />
                </div>
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </section>
      )}

      {/* Related Artists - Horizontal scroll */}
      {relatedArtists.length > 0 && (
        <section className="px-4 md:px-8 mb-8 md:mb-10">
          <h2 className="text-lg md:text-2xl font-bold text-foreground mb-3 md:mb-4">Artisti simili</h2>
          <ScrollArea className="w-full whitespace-nowrap">
            <div className="flex gap-3 md:gap-4 pb-4">
              {relatedArtists.map((relatedArtist) => (
                <div key={relatedArtist.id} className="flex-shrink-0 w-32 md:w-40">
                  <ArtistCard artist={relatedArtist} />
                </div>
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </section>
      )}
    </div>
  );
};

export default Artist;
