import { supabase } from '@/integrations/supabase/client';
import { Track } from '@/types/music';

/**
 * Aggiorna le statistiche di ascolto aggregate per artista e traccia.
 * Invece di creare un record per ogni ascolto, fa upsert su record aggregati.
 */
export const updateListeningStats = async (
  track: Track,
  userId: string,
  actualSecondsListened: number
) => {
  // Solo se ha ascoltato almeno 10 secondi
  if (actualSecondsListened < 10) {
    console.log('[ListeningStats] Skipped - listened less than 10 seconds');
    return;
  }

  try {
    // 1. Aggiorna statistiche artista (upsert)
    const artistId = track.artistId || track.artist.toLowerCase().replace(/\s+/g, '-');
    
    // Prima prova a fare update
    const { data: existingArtist } = await supabase
      .from('user_artist_stats')
      .select('id, total_seconds_listened, total_plays')
      .eq('user_id', userId)
      .eq('artist_id', artistId)
      .maybeSingle();

    if (existingArtist) {
      // Update existing record
      await supabase
        .from('user_artist_stats')
        .update({
          total_seconds_listened: existingArtist.total_seconds_listened + actualSecondsListened,
          total_plays: existingArtist.total_plays + 1,
          last_played_at: new Date().toISOString(),
        })
        .eq('id', existingArtist.id);
    } else {
      // Insert new record
      await supabase
        .from('user_artist_stats')
        .insert({
          user_id: userId,
          artist_id: artistId,
          artist_name: track.artist,
          artist_image_url: null, // Will be fetched when displaying Wrapped
          total_seconds_listened: actualSecondsListened,
          total_plays: 1,
          last_played_at: new Date().toISOString(),
        });
    }

    // 2. Aggiorna statistiche traccia (upsert)
    const { data: existingTrack } = await supabase
      .from('user_track_stats')
      .select('id, play_count, total_seconds_listened')
      .eq('user_id', userId)
      .eq('track_id', track.id)
      .maybeSingle();

    if (existingTrack) {
      // Update existing record
      await supabase
        .from('user_track_stats')
        .update({
          play_count: existingTrack.play_count + 1,
          total_seconds_listened: existingTrack.total_seconds_listened + actualSecondsListened,
          last_played_at: new Date().toISOString(),
        })
        .eq('id', existingTrack.id);
    } else {
      // Insert new record
      await supabase
        .from('user_track_stats')
        .insert({
          user_id: userId,
          track_id: track.id,
          track_title: track.title,
          track_artist: track.artist,
          artist_id: track.artistId || null,
          track_album: track.album || null,
          track_album_id: track.albumId || null,
          track_cover_url: track.coverUrl || null,
          track_duration: track.duration || null,
          play_count: 1,
          total_seconds_listened: actualSecondsListened,
          last_played_at: new Date().toISOString(),
        });
    }

    console.log(`[ListeningStats] Updated stats: ${track.title} (+${actualSecondsListened}s)`);
  } catch (error) {
    console.error('[ListeningStats] Failed to update stats:', error);
  }
};

/**
 * Recupera le statistiche aggregate per il Wrapped
 */
export const getAggregatedStats = async (userId: string) => {
  try {
    // Fetch artist stats ordinati per tempo di ascolto
    const { data: artistStats, error: artistError } = await supabase
      .from('user_artist_stats')
      .select('*')
      .eq('user_id', userId)
      .order('total_seconds_listened', { ascending: false })
      .limit(10);

    if (artistError) throw artistError;

    // Fetch track stats ordinati per numero di riproduzioni
    const { data: trackStats, error: trackError } = await supabase
      .from('user_track_stats')
      .select('*')
      .eq('user_id', userId)
      .order('play_count', { ascending: false })
      .limit(10);

    if (trackError) throw trackError;

    // Calcola totali
    const totalMinutes = Math.round(
      (artistStats || []).reduce((acc, a) => acc + a.total_seconds_listened, 0) / 60
    );
    
    const totalPlays = (trackStats || []).reduce((acc, t) => acc + t.play_count, 0);

    return {
      artistStats: artistStats || [],
      trackStats: trackStats || [],
      totalMinutes,
      totalPlays,
    };
  } catch (error) {
    console.error('[ListeningStats] Failed to get aggregated stats:', error);
    return {
      artistStats: [],
      trackStats: [],
      totalMinutes: 0,
      totalPlays: 0,
    };
  }
};
