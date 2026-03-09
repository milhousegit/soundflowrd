

# Fix: Audio torna indietro nei primi secondi

## Problema
Quando la TV inizia a riprodurre un nuovo brano, il telefono e gia avanti di qualche secondo (perche stava riproducendo mentre la TV fetchava lo stream). La logica di sincronizzazione (soglia di 3 secondi) continua a correggere la posizione della TV ad ogni heartbeat (ogni 2 secondi), causando piccoli salti indietro durante i primi secondi di riproduzione.

## Soluzione
Ignorare la sincronizzazione del tempo per i primi secondi dopo che la TV inizia a riprodurre un nuovo brano.

### Modifiche in `src/pages/TV.tsx`

1. **Aggiungere un ref `playbackStartedAtRef`** che registra il timestamp (`Date.now()`) di quando la TV inizia effettivamente la riproduzione di un nuovo brano (dentro `fetchStreamForTrack`, dopo `audio.play()`)

2. **Nella logica di sync del broadcast handler** (linee 141-145), aggiungere una guardia:
   - Se sono passati meno di 5 secondi da `playbackStartedAtRef`, NON sincronizzare il `currentTime`
   - Questo da alla TV il tempo di stabilizzarsi senza essere interrotta dai heartbeat del telefono
   - Dopo 5 secondi, la sincronizzazione riprende normalmente con la soglia di 3 secondi

3. **Rimuovere la sync iniziale** alle linee 101-104 (`if (remoteCurrentTimeRef.current > 0) audio.currentTime = ...`). Non serve piu perche la TV riproduce autonomamente dall'inizio e la sync partira dopo 5 secondi.

### Dettagli tecnici

```text
Prima (problematico):
  TV fetch stream -> audio.currentTime = phone.progress (5s)
  -> heartbeat arriva -> diff < 3s ma posizione cambia -> piccolo salto
  -> altro heartbeat -> altro salto

Dopo (fix):
  TV fetch stream -> audio.play() da 0
  -> playbackStartedAt = Date.now()
  -> heartbeat arriva (entro 5s) -> IGNORATO
  -> heartbeat arriva (dopo 5s) -> sync normale con soglia 3s
```

### File modificato
- `src/pages/TV.tsx` - Aggiungere `playbackStartedAtRef`, guardia temporale nel sync handler, rimuovere sync iniziale
