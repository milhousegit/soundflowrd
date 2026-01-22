-- Rimuovi il vincolo UNIQUE che impedisce inserimenti multipli della stessa traccia
ALTER TABLE public.recently_played DROP CONSTRAINT IF EXISTS recently_played_user_id_track_id_key;