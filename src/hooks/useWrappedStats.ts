import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { searchArtists } from '@/lib/deezer';

interface ArtistStats {
  id: string;
  name: string;
  imageUrl: string;
  minutesListened: number;
  songsPlayed: number;
}

interface TrackStats {
  id: string;
  title: string;
  artist: string;
  artistId?: string;
  coverUrl?: string;
  plays: number;
}

interface AlbumStats {
  id: string;
  title: string;
  artist: string;
  coverUrl?: string;
  plays: number;
}

interface GenreStats {
  name: string;
  percentage: number;
  color: string;
}

interface SocialStats {
  posts: number;
  comments: number;
  likes: number;
}

export interface WrappedStats {
  totalMinutes: number;
  totalSongs: number;
  topArtist: ArtistStats | null;
  topArtists: ArtistStats[];
  topTracks: TrackStats[];
  topAlbums: AlbumStats[];
  topGenres: GenreStats[];
  socialStats: SocialStats;
  isLoading: boolean;
  error: string | null;
}

const GENRE_COLORS = [
  'from-primary to-cyan-400',
  'from-purple-500 to-pink-500',
  'from-orange-500 to-red-500',
  'from-blue-500 to-indigo-500',
  'from-green-500 to-emerald-500',
];

// Try to detect genre from artist name (simplified approach)
const detectGenre = (artistName: string): string => {
  const lowerName = artistName.toLowerCase();
  
  const artistGenreMap: Record<string, string> = {
    'drake': 'Hip-Hop',
    'kendrick lamar': 'Hip-Hop',
    'j. cole': 'Hip-Hop',
    'travis scott': 'Hip-Hop',
    'kanye west': 'Hip-Hop',
    'eminem': 'Hip-Hop',
    'the weeknd': 'R&B',
    'sza': 'R&B',
    'frank ocean': 'R&B',
    'daniel caesar': 'R&B',
    'taylor swift': 'Pop',
    'ed sheeran': 'Pop',
    'dua lipa': 'Pop',
    'ariana grande': 'Pop',
    'billie eilish': 'Pop',
    'bad bunny': 'Reggaeton',
    'j balvin': 'Reggaeton',
    'ozuna': 'Reggaeton',
    'coldplay': 'Rock',
    'imagine dragons': 'Rock',
    'daft punk': 'Electronic',
    'calvin harris': 'Electronic',
    'david guetta': 'Electronic',
    'sfera ebbasta': 'Hip-Hop',
    'geolier': 'Hip-Hop',
    'anna': 'Hip-Hop',
    'tony effe': 'Hip-Hop',
    'lazza': 'Hip-Hop',
    'shiva': 'Hip-Hop',
    'ghali': 'Hip-Hop',
    'marracash': 'Hip-Hop',
    'mahmood': 'Pop',
    'blanco': 'Pop',
    'thasup': 'Hip-Hop',
  };
  
  for (const [artist, genre] of Object.entries(artistGenreMap)) {
    if (lowerName.includes(artist)) {
      return genre;
    }
  }
  
  return 'Pop';
};

export const useWrappedStats = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<WrappedStats>({
    totalMinutes: 0,
    totalSongs: 0,
    topArtist: null,
    topArtists: [],
    topTracks: [],
    topAlbums: [],
    topGenres: [],
    socialStats: { posts: 0, comments: 0, likes: 0 },
    isLoading: true,
    error: null,
  });

  const fetchStats = useCallback(async () => {
    if (!user?.id) {
      setStats(prev => ({ ...prev, isLoading: false }));
      return;
    }

    try {
      // Fetch all data in parallel from aggregated tables
      const [
        artistStatsResult,
        trackStatsResult,
        postsResult,
        commentsResult,
        postLikesResult,
        albumLikesResult,
        commentLikesResult,
      ] = await Promise.all([
        // Top artists by listening time
        supabase
          .from('user_artist_stats')
          .select('*')
          .eq('user_id', user.id)
          .order('total_seconds_listened', { ascending: false })
          .limit(6),
        // Top tracks by play count
        supabase
          .from('user_track_stats')
          .select('*')
          .eq('user_id', user.id)
          .order('play_count', { ascending: false })
          .limit(10),
        // Social stats
        supabase
          .from('posts')
          .select('id')
          .eq('user_id', user.id),
        supabase
          .from('comments')
          .select('id')
          .eq('user_id', user.id),
        supabase
          .from('post_likes')
          .select('id')
          .eq('user_id', user.id),
        supabase
          .from('album_likes')
          .select('id')
          .eq('user_id', user.id),
        supabase
          .from('comment_likes')
          .select('id')
          .eq('user_id', user.id),
      ]);

      if (artistStatsResult.error) throw artistStatsResult.error;
      if (trackStatsResult.error) throw trackStatsResult.error;

      const artistStatsData = artistStatsResult.data || [];
      const trackStatsData = trackStatsResult.data || [];
      
      // Calculate total minutes from aggregated artist stats
      const totalSeconds = artistStatsData.reduce((acc, artist) => {
        return acc + (artist.total_seconds_listened || 0);
      }, 0);
      const totalMinutes = Math.round(totalSeconds / 60);
      
      // Calculate total songs from aggregated track stats
      const totalSongs = trackStatsData.reduce((acc, track) => {
        return acc + (track.play_count || 0);
      }, 0);

      // Build top tracks from aggregated data
      const topTracks: TrackStats[] = trackStatsData.slice(0, 5).map(track => ({
        id: track.track_id,
        title: track.track_title,
        artist: track.track_artist,
        artistId: track.artist_id || undefined,
        coverUrl: track.track_cover_url || undefined,
        plays: track.play_count,
      }));

      // Fetch real artist images from Deezer API
      const artistImagePromises = artistStatsData.map(async (artist) => {
        try {
          const results = await searchArtists(artist.artist_name);
          const matchedArtist = results.find(
            a => a.name.toLowerCase() === artist.artist_name.toLowerCase()
          ) || results[0];
          return {
            id: artist.artist_id,
            name: artist.artist_name,
            imageUrl: matchedArtist?.imageUrl || '/placeholder.svg',
            minutesListened: Math.round(artist.total_seconds_listened / 60),
            songsPlayed: artist.total_plays,
          };
        } catch {
          return {
            id: artist.artist_id,
            name: artist.artist_name,
            imageUrl: '/placeholder.svg',
            minutesListened: Math.round(artist.total_seconds_listened / 60),
            songsPlayed: artist.total_plays,
          };
        }
      });

      const topArtists: ArtistStats[] = await Promise.all(artistImagePromises);
      const topArtist = topArtists[0] || null;

      // Build top albums from track stats (aggregate by album)
      const albumPlayCounts = new Map<string, {
        id: string;
        title: string;
        artist: string;
        coverUrl?: string;
        plays: number;
      }>();

      trackStatsData.forEach(track => {
        if (!track.track_album_id || !track.track_album) return;
        
        const key = track.track_album_id;
        if (albumPlayCounts.has(key)) {
          albumPlayCounts.get(key)!.plays += track.play_count;
        } else {
          albumPlayCounts.set(key, {
            id: track.track_album_id,
            title: track.track_album,
            artist: track.track_artist,
            coverUrl: track.track_cover_url || undefined,
            plays: track.play_count,
          });
        }
      });

      const topAlbums = Array.from(albumPlayCounts.values())
        .sort((a, b) => b.plays - a.plays)
        .slice(0, 3);

      // Calculate genre distribution from artist stats
      const genreCounts = new Map<string, number>();
      artistStatsData.forEach(artist => {
        const genre = detectGenre(artist.artist_name);
        genreCounts.set(genre, (genreCounts.get(genre) || 0) + artist.total_plays);
      });

      const totalGenrePlays = artistStatsData.reduce((acc, a) => acc + a.total_plays, 0) || 1;
      const topGenres = Array.from(genreCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([name, count], index) => ({
          name,
          percentage: Math.round((count / totalGenrePlays) * 100),
          color: GENRE_COLORS[index] || GENRE_COLORS[0],
        }));

      // Calculate social stats
      const totalLikes = 
        (postLikesResult.data?.length || 0) + 
        (albumLikesResult.data?.length || 0) +
        (commentLikesResult.data?.length || 0);

      const socialStats: SocialStats = {
        posts: postsResult.data?.length || 0,
        comments: commentsResult.data?.length || 0,
        likes: totalLikes,
      };

      setStats({
        totalMinutes,
        totalSongs,
        topArtist,
        topArtists,
        topTracks,
        topAlbums,
        topGenres,
        socialStats,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      console.error('Failed to fetch wrapped stats:', error);
      setStats(prev => ({
        ...prev,
        isLoading: false,
        error: 'Failed to load statistics',
      }));
    }
  }, [user?.id]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return stats;
};
