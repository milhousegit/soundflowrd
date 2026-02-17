

# Piano: Riscrittura completa TV Sync

## Problemi identificati

### Problema 1: La musica si interrompe premendo la X
La route `/tv` si trova **fuori** dal `Layout` nell'albero delle route. Quando navighi da `/tv` a `/`, l'intero Layout (incluso il Player) viene distrutto e ricreato da zero, interrompendo la riproduzione audio.

### Problema 2: La connessione non funziona
Il canale Supabase Realtime nella funzione `connectToRoom` potrebbe non sottoscriversi correttamente. Inoltre, la callback `subscribe` potrebbe non ricevere lo stato corretto a causa di un problema di timing.

---

## Soluzione

### 1. Spostare `/tv` dentro il Layout (App.tsx)
Rendere `/tv` una route figlia di Layout, cosi il Player resta montato durante la navigazione. Questo risolve completamente il problema della musica che si interrompe.

```text
Route "/" (Layout)
  ├── index -> Home
  ├── search -> Search
  ├── tv -> TV          <-- spostato qui dentro
  └── ...altri
```

### 2. Riscrivere TVConnectionContext.tsx
- Assicurarsi che il canale Supabase venga creato e sottoscritto correttamente
- Usare `async/await` per la sottoscrizione del canale con gestione errori
- Aggiungere un piccolo delay prima di inviare `phone-connected` per garantire che il canale sia pronto
- Mantenere il ref per il volume per evitare stale closures

### 3. Riscrivere la pagina TV (MobileRemote)
- La X usa `navigate('/', { replace: true })` che ora funziona senza problemi perche resta dentro il Layout
- Pulizia scanner al dismount
- Gestire correttamente il parametro `room` dall'URL

---

## Dettagli tecnici

### File modificati:
1. **`src/App.tsx`** - Spostare `<Route path="tv" element={<TV />} />` dentro il gruppo Layout
2. **`src/contexts/TVConnectionContext.tsx`** - Riscrivere `connectToRoom` con sottoscrizione robusta
3. **`src/pages/TV.tsx`** - Riscrivere MobileRemote: rimuovere `min-h-screen` (ora e dentro il Layout), mantenere safe-area-inset, X funzionante

### Comportamento atteso:
- Apri `/tv` da mobile: vedi la schermata di collegamento dentro il layout dell'app (con player e nav attivi)
- Scansioni o inserisci codice: ti connetti e torni alla home con il banner TV visibile
- Premi X: torni alla home senza interruzione musicale
- Navighi liberamente nell'app con il banner TV sempre visibile
- Premi il banner: dialog di disconnessione

