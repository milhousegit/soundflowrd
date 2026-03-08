
# Piano: Sistema Canvas per Brani con Video di Sfondo

## Analisi del Sistema Attuale

Dopo aver esaminato il database Supabase, non esiste una tabella centralizzata "tracks". I brani sono referenziati tramite `track_id` in varie tabelle come:
- `user_track_stats` 
- `recently_played`
- `playlist_tracks`
- `youtube_track_mappings`

Il sistema usa track_id (es: "3884477121") come identificatore unico dei brani.

## Soluzione Proposta

### 1. Database Schema
Creare una tabella `track_canvases` per mappare i canvas video ai brani:

```sql
CREATE TABLE track_canvases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id text NOT NULL UNIQUE,
  canvas_url text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS policies per sicurezza
ALTER TABLE track_canvases ENABLE ROW LEVEL SECURITY;

-- Policy: tutti possono vedere i canvas
CREATE POLICY "Anyone can view track canvases" ON track_canvases FOR SELECT TO authenticated, anon USING (true);

-- Policy: solo admin possono gestire i canvas
CREATE POLICY "Admins can manage track canvases" ON track_canvases FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger per updated_at automatico
CREATE TRIGGER track_canvases_updated_at
  BEFORE UPDATE ON track_canvases
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Inserire il canvas di esempio
INSERT INTO track_canvases (track_id, canvas_url) 
VALUES ('3884477121', 'https://canvaz.scdn.co/upload/artist/4jQQ2yfZyDgktZW5eI6BA7/video/61781336f9ec4776a4fa9c6519af7920.cnvs.mp4');
```

### 2. Hook per Canvas
Creare `src/hooks/useTrackCanvas.ts` per recuperare i canvas:

```typescript
export const useTrackCanvas = () => {
  const getTrackCanvas = async (trackId: string): Promise<string | null> => {
    const { data } = await supabase
      .from('track_canvases')
      .select('canvas_url')
      .eq('track_id', trackId)
      .maybeSingle();
    
    return data?.canvas_url || null;
  };
  
  return { getTrackCanvas };
};
```

### 3. Componente Canvas Player
Creare `src/components/CanvasBackground.tsx` per il video di sfondo:

```typescript
interface CanvasBackgroundProps {
  canvasUrl: string | null;
  isPlaying: boolean;
  className?: string;
}

// Video element con loop, muted, autoplay
// Overlay scuro per leggibilità del testo
// Gestione loading e fallback
```

### 4. Integrazione nel Player
Modificare `src/components/Player.tsx`:

- Aggiungere state per `canvasUrl`
- Usare `useTrackCanvas` quando cambia `currentTrack`
- Integrare `<CanvasBackground>` come sfondo
- Assicurarsi che i controlli rimangano visibili sopra il video

### 5. Gestione Admin (Opzionale)
Aggiungere sezione in Settings/Admin per:
- Visualizzare canvas esistenti
- Aggiungere/modificare/rimuovere canvas per brani
- Upload di nuovi video canvas

## Considerazioni Tecniche

**Performance:**
- Video preloading solo quando necessario
- Gestione memoria per video pesanti
- Fallback per connessioni lente

**UX:**
- Video in loop seamless
- Sincronizzazione play/pause con audio
- Transizione smooth tra canvas diversi

**Browser Compatibility:**
- Formati video supportati (.mp4, .webm)
- Autoplay policies (muted video)
- iOS/Safari particolarità

## File da Modificare

1. **Database:** Migration SQL per `track_canvases`
2. **Hook:** `src/hooks/useTrackCanvas.ts` (nuovo)
3. **Componente:** `src/components/CanvasBackground.tsx` (nuovo) 
4. **Player:** `src/components/Player.tsx` (modificato)
5. **Types:** Aggiornare tipi Supabase (auto-generato)

## Implementazione Step-by-Step

1. Creare migrazione database con tabella e dati esempio
2. Implementare hook per recupero canvas  
3. Creare componente video background
4. Integrare nel Player con gestione loading/error
5. Testing con il canvas esempio fornito
6. (Opzionale) Pannello admin per gestione canvas

Il canvas video verrà mostrato come sfondo al player, similar a Spotify Canvas, con i controlli sovrapposti e testo leggibile tramite overlay scuro.
