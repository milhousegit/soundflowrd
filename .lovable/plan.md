
# Integrazione Multi-Sorgente Audio

## Panoramica

Trasformare il sistema audio da sorgenti fisse (SquidWTF / RD) a un sistema modulare dove l'utente puo configurare quali sorgenti usare, in che ordine, e vedere nel player da quale sito sta arrivando l'audio.

## Cosa cambia

### 1. Nuovo tipo "Scraping Source" con URL configurabile

Quando si seleziona "Scraping Ponte" nelle impostazioni, appare un campo di testo per inserire l'indirizzo del sito ponte. Predefinito: SquidWTF. Opzione rapida per aggiungere Monochrome.

### 2. Monochrome.tf come nuova sorgente

Monochrome usa le stesse API HiFi di SquidWTF ma con server propri (`ohio.monochrome.tf`, `virginia.monochrome.tf`, `oregon.monochrome.tf`). Viene creata una nuova edge function `monochrome` che usa questi server.

### 3. Player: mostra il nome della sorgente reale

Invece di "Tidal HQ" nel badge del player, mostra il nome del sito effettivo: "SquidWTF", "Monochrome", "Real-Debrid", "Offline".

### 4. Modalita Ibrida con fallback multipli ordinabili

La modalita ibrida diventa una lista ordinabile di sorgenti. L'utente puo:
- Aggiungere/rimuovere sorgenti (RD, SquidWTF, Monochrome)
- Trascinare per riordinare la priorita
- Avere anche solo una sorgente

---

## Dettagli Tecnici

### Modifiche ai tipi (`src/types/settings.ts`)

- Nuovo tipo `ScrapingSource` con `id`, `name`, `url`
- Sorgenti predefinite: SquidWTF e Monochrome
- Nuovo campo `hybridFallbackChain: string[]` (array di ID sorgente ordinati)
- Nuovo campo `selectedScrapingSource: string` (ID della sorgente attiva in modalita scraping)

### Nuova Edge Function (`supabase/functions/monochrome/index.ts`)

Identica alla funzione `squidwtf` ma usa i server Monochrome:
- `https://ohio.monochrome.tf`
- `https://virginia.monochrome.tf`
- `https://oregon.monochrome.tf`

Stesse API: `/search/?s=...` e `/track/?id=...&quality=...`

### Nuovo lib (`src/lib/monochrome.ts`)

Simile a `src/lib/tidal.ts` ma chiama la funzione edge `monochrome` invece di `squidwtf`.

### Modifiche Settings (`src/pages/Settings.tsx`)

Quando "Scraping Ponte" e selezionato:
- Dropdown o bottoni per scegliere tra SquidWTF e Monochrome
- Campo testo opzionale per URL personalizzato

Nella sezione "Ibrida":
- Lista ordinabile delle sorgenti fallback
- Bottoni +/- per aggiungere/rimuovere
- Drag & drop o frecce su/giu per riordinare

### Modifiche PlayerContext (`src/contexts/PlayerContext.tsx`)

- Il tipo `AudioSource` diventa: `'squidwtf' | 'monochrome' | 'real-debrid' | 'offline' | null`
- In modalita `deezer_priority`: usa la sorgente selezionata (SquidWTF o Monochrome)
- In modalita `hybrid_priority`: segue la catena di fallback configurata
- Salva quale sorgente ha effettivamente fornito l'audio

### Modifiche Player (`src/components/Player.tsx`)

Il badge sorgente mostra:
- "SquidWTF" (viola) quando audio da SquidWTF
- "Monochrome" (azzurro) quando audio da Monochrome
- "Real-Debrid" (arancione) quando audio da RD
- "Offline" (verde) quando offline

### Modifiche SettingsContext (`src/contexts/SettingsContext.tsx`)

Gestione dei nuovi campi di configurazione (sorgente selezionata, catena fallback).

### Database

Nuovo campo `scraping_source` e `hybrid_fallback_chain` nella tabella `profiles` per persistere le preferenze (migrazione SQL).

### File coinvolti

1. `src/types/settings.ts` - nuovi tipi
2. `supabase/functions/monochrome/index.ts` - nuova edge function
3. `src/lib/monochrome.ts` - nuovo client lib
4. `src/pages/Settings.tsx` - UI configurazione sorgenti
5. `src/contexts/PlayerContext.tsx` - logica fallback chain
6. `src/components/Player.tsx` - badge sorgente
7. `src/contexts/SettingsContext.tsx` - gestione nuovi settings
8. `src/types/settings.ts` - traduzioni nuove
9. Migrazione DB per nuovi campi profilo
