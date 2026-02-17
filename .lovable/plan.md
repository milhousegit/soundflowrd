

# Fix Audio TV: Riproduzione Funzionante

## Problema
Il browser blocca completamente `audio.play()` perche l'elemento audio e creato con `new Audio()` in un `useEffect`, fuori dal DOM e senza mai ricevere un gesto utente. I log confermano: `[TV-Audio] Still blocked: AbortError`.

## Soluzione

### Cambiamento principale in `src/pages/TV.tsx`

1. **Sostituire `new Audio()` con un tag `<audio>` nel JSX**
   - Aggiungere `<audio ref={tvAudioRef} muted crossOrigin="anonymous" />` nel return del componente TVDisplay
   - Rimuovere il `useEffect` che crea `new Audio()` programmaticamente

2. **Riscrivere il pulsante Mute/Unmute**
   - Al click dell'utente (gesto valido per il browser):
     - Se l'audio e in pausa, chiamare `tvAudioRef.current.play()` dentro il gestore click
     - Impostare `muted = false`
   - Questo sblocca permanentemente l'elemento audio per il browser

3. **Aggiornare la logica di ricezione `player-state`**
   - Quando arriva un nuovo `streamUrl`, impostare `audio.src` e chiamare `audio.load()`
   - NON chiamare `audio.play()` automaticamente se l'audio non e ancora stato sbloccato dall'utente
   - Usare un flag `audioUnlocked` (ref) che diventa `true` solo dopo il primo click utente
   - Se `audioUnlocked` e `true`, allora si puo chiamare `play()` automaticamente sui cambi di stato successivi

4. **Sync del tempo**
   - Mantenere la logica esistente: se la differenza tra `currentTime` del telefono e della TV supera 3 secondi, aggiornare la posizione

### Flusso corretto dopo la fix

```text
Telefono                          TV (Browser)
   |                                  |
   |--- phone-connected ------------>|
   |<------------ tv-ack ------------|
   |                                  |
   |--- player-state --------------->| Riceve streamUrl, lo carica
   |    (streamUrl, currentTime,     | ma NON chiama play()
   |     isPlaying, track)           |
   |                                  |
   |                          [Utente clicca Unmute]
   |                                  | -> audio.play() (gesto utente)
   |                                  | -> audioUnlocked = true
   |                                  | -> audio.muted = false
   |                                  |
   |--- player-state --------------->| Ora play/pause/seek
   |    (ogni 2 secondi)             | funzionano automaticamente
```

### File modificati
- **`src/pages/TV.tsx`** - Unico file da modificare

### Dettagli tecnici

Il tag `<audio>` nel DOM con `ref={tvAudioRef}`:
- E visibile al browser come elemento media legittimo
- Puo essere sbloccato con un singolo click utente
- Una volta sbloccato, le chiamate `.play()` successive funzionano senza gesti aggiuntivi
- L'attributo `crossOrigin="anonymous"` e necessario per URL di streaming esterni

Il pulsante unmute mostrera:
- `VolumeX` quando muto (stato iniziale)
- `Volume2` quando attivo
- Al primo click: sblocca + unmute + play
- Click successivi: solo toggle mute/unmute
