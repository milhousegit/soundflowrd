# Plugin Amazon Music (via Lucida)

Aggiungo un nuovo plugin `amazon-music` che usa Lucida come backend per cercare e riprodurre brani Amazon Music in streaming diretto (URL `download` di Lucida, ~1h di validità). Nessun upload Send.cm — non necessario perché lo stream diretto già funziona come URL audio riproducibile.

## Cosa farà il plugin

1. **Ricerca**: query → Lucida cerca su Amazon Music → ritorna lista brani con metadati (titolo, artista, album, cover, durata, URL Amazon)
2. **Stream**: dato un URL `music.amazon.com/tracks/...` → flusso identico al Lucida-Deezer attuale (resolve pagina → CSRF → POST `/api/load` → poll handoff → `download` URL)
3. **Compatibile** con il sistema plugin esistente (manifest JSON + edge function + impostazioni)

## File da creare/modificare

### Nuovi
- **`public/manifests/amazon-music.json`** — manifest del plugin con:
  - `id: amazon-music`, `name: Amazon Music (Lucida)`
  - `endpoint`: URL della nuova edge function
  - `settings`: campo "Region" (auto/us/uk/de/fr/it/jp…), default `auto`
  - `capabilities: ['search', 'stream']`

- **`supabase/functions/amazon-music/index.ts`** — edge function basata su `lucida/index.ts`. Due action:
  - `search`: chiama `https://lucida.to/?country=X` con query Amazon, oppure usa direttamente l'API interna di Lucida per la ricerca su Amazon Music. Estrae risultati con stesso pattern `parseEnclosedValue` o via Firecrawl JSON extract come fallback.
  - `get-stream`: identico al flusso Lucida ma con URL `https://music.amazon.com/tracks/{id}` (o accetta direttamente l'URL Amazon dal risultato della search).

### Modificati
- **`supabase/config.toml`** — registra la nuova function
- **`src/lib/plugins.ts`** — aggiungi `amazon-music` ai built-in disponibili (se hai una lista)
- **`src/components/plugins/InstallPluginModal.tsx`** — mostra il nuovo plugin nella lista installabile

## Dettagli tecnici

**Riuso massimo**: la funzione `resolveTrackViaLucida` esistente nel file `lucida/index.ts` è già generica (prende un URL qualsiasi). La copio in `amazon-music/index.ts` ma cambio il prefisso URL da `deezer.com/track/` a `music.amazon.com/tracks/`.

**Search via Lucida**: Lucida non espone un endpoint API pubblico di ricerca documentato, quindi la search avviene scraping della pagina home con `?service=amazon&q=...` e parsing del SvelteKit pageData (con fallback Firecrawl come già fa la function `lucida`). Il connector Firecrawl è già configurato nel progetto.

**Stream**: l'URL finale `https://{server}.lucida.to/api/fetch/request/{handoff}/download` è già un endpoint HTTP audio diretto (Content-Type audio/flac o audio/mp4) — il `<audio>` HTML lo riproduce nativamente. Nessun upload necessario.

**Caching**: gli URL hanno scadenza ~1h (token expiry). La logica di cache esistente del player gestisce già la riacquisizione on-demand quando il brano viene rimesso in coda.

## Limiti noti

- Lucida può rate-limitare se molte richieste consecutive
- Alcune tracce Amazon Music (esclusive HD/Atmos) potrebbero non essere disponibili in tutte le regioni → il setting "Region" del plugin permette all'utente di scegliere
- Ricerca più lenta della Deezer perché fa scraping pagina (~2-4s vs ~500ms)

## Output finale per l'utente

Una volta pronto: plugin installabile dalla sezione **Impostazioni → Plugin → Installa** scegliendo "Amazon Music (Lucida)" dalla lista, oppure incollando l'URL del manifest.
