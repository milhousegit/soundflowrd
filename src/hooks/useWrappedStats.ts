import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

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
  
  // Mapping of common artists to genres
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
  
  return 'Pop'; // Default genre
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
      // Fetch all data in parallel
      const [
        recentlyPlayedResult,
        postsResult,
        commentsResult,
        postLikesResult,
        albumLikesResult,
        commentLikesResult,
      ] = await Promise.all([
        supabase
          .from('recently_played')
          .select('*')
          .eq('user_id', user.id)
          .order('played_at', { ascending: false }),
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

      if (recentlyPlayedResult.error) throw recentlyPlayedResult.error;

      const recentlyPlayed = recentlyPlayedResult.data || [];
      
      // Calculate total listening time in minutes
      const totalSeconds = recentlyPlayed.reduce((acc, track) => {
        return acc + (track.track_duration || 0);
      }, 0);
      const totalMinutes = Math.round(totalSeconds / 60);
      const totalSongs = recentlyPlayed.length;

      // Count plays by track
      const trackPlayCounts = new Map<string, { 
        id: string;
        title: string; 
        artist: string; 
        artistId?: string;
        coverUrl?: string;
        plays: number;
      }>();
      
      recentlyPlayed.forEach(record => {
        const key = record.track_id;
        if (trackPlayCounts.has(key)) {
          trackPlayCounts.get(key)!.plays++;
        } else {
          trackPlayCounts.set(key, {
            id: record.track_id,
            title: record.track_title,
            artist: record.track_artist,
            artistId: record.artist_id || undefined,
            coverUrl: record.track_cover_url || undefined,
            plays: 1,
          });
        }
      });

      // Get top 5 tracks
      const topTracks = Array.from(trackPlayCounts.values())
        .sort((a, b) => b.plays - a.plays)
        .slice(0, 5);

      // Count plays and listening time by artist
      const artistStats = new Map<string, {
        id: string;
        name: string;
        minutesListened: number;
        songsPlayed: number;
      }>();

      recentlyPlayed.forEach(record => {
        const artistKey = record.track_artist.toLowerCase();
        const artistId = record.artist_id || record.track_artist;
        const duration = (record.track_duration || 0) / 60;
        
        if (artistStats.has(artistKey)) {
          const existing = artistStats.get(artistKey)!;
          existing.minutesListened += duration;
          existing.songsPlayed++;
        } else {
          artistStats.set(artistKey, {
            id: artistId,
            name: record.track_artist,
            minutesListened: duration,
            songsPlayed: 1,
          });
        }
      });

      // Get top 6 artists (1 main + 5 others)
      const sortedArtists = Array.from(artistStats.values())
        .sort((a, b) => b.minutesListened - a.minutesListened)
        .slice(0, 6);

      // Build artist stats with images from Deezer
      const topArtists: ArtistStats[] = sortedArtists.map(artist => ({
        id: artist.id,
        name: artist.name,
        imageUrl: `https://e-cdns-images.dzcdn.net/images/artist/${artist.id}/500x500-000000-80-0-0.jpg`,
        minutesListened: Math.round(artist.minutesListened),
        songsPlayed: artist.songsPlayed,
      }));

      const topArtist = topArtists[0] || null;

      // Count plays by album
      const albumPlayCounts = new Map<string, {
        id: string;
        title: string;
        artist: string;
        coverUrl?: string;
        plays: number;
      }>();

      recentlyPlayed.forEach(record => {
        if (!record.track_album_id || !record.track_album) return;
        
        const key = record.track_album_id;
        if (albumPlayCounts.has(key)) {
          albumPlayCounts.get(key)!.plays++;
        } else {
          albumPlayCounts.set(key, {
            id: record.track_album_id,
            title: record.track_album,
            artist: record.track_artist,
            coverUrl: record.track_cover_url || undefined,
            plays: 1,
          });
        }
      });

      // Get top 3 albums
      const topAlbums = Array.from(albumPlayCounts.values())
        .sort((a, b) => b.plays - a.plays)
        .slice(0, 3);

      // Calculate genre distribution
      const genreCounts = new Map<string, number>();
      recentlyPlayed.forEach(record => {
        const genre = detectGenre(record.track_artist);
        genreCounts.set(genre, (genreCounts.get(genre) || 0) + 1);
      });

      const totalGenrePlays = recentlyPlayed.length || 1;
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
