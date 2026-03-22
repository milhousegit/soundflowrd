

## Problema e Diagnosi

Il tracker ufficiale di uptime (`tidal-uptime.jiffy-puffs-1j.workers.dev`) mostra che **quasi tutti i mirror hardcoded nella edge function sono DOWN**:

- `hifitui.401658.xyz` -- non esiste nel tracker
- `triton.squid.wtf` -- **504**
- `tidal-api.binimum.org` -- non esiste nel tracker
- `hund/katze/maus.qqdl.site` -- **401**
- `ohio/virginia/oregon.monochrome.tf` -- non esistono

**Istanze attualmente funzionanti** (dal tracker live):
- API (search): `eu-central.monochrome.tf`, `us-west.monochrome.tf`, `hifi-one.spotisaver.net`, `api.monochrome.tf`, `monochrome-api.samidy.com`, `tidal.kinoplus.online`
- Streaming (track): `hifi-one.spotisaver.net`, `api.monochrome.tf`

**Come fa Monochrome stesso**: non hardcoda i mirror, ma **interroga dinamicamente il tracker di uptime** per ottenere le istanze live ad ogni richiesta (con cache).

## Piano

### 1. Riscrivere la edge function `monochrome` con discovery dinamico

Invece di una lista statica di mirror, la funzione:

1. Chiama il tracker di uptime (`tidal-uptime.jiffy-puffs-1j.workers.dev` con fallback a `tidal-uptime.props-76styles.workers.dev`) per ottenere le istanze live
2. Crea due pool: **API instances** (per search) e **streaming instances** (per `/track/`)
3. Cache il risultato per 5 minuti (durata della vita dell'edge function)
4. Fallback a istanze hardcoded aggiornate se entrambi i tracker sono irraggiungibili

Il formato degli endpoint resta invariato:
- Search: `GET /search/?s={query}`
- Stream: `GET /track/?id={id}&quality={quality}`

La gestione della risposta sarà più robusta: `data.data || data` per gestire wrapper variabili tra le istanze.

### 2. Gestione manifest migliorata

Seguendo il codice sorgente di Monochrome (`extractStreamUrlFromManifest`):
- `application/vnd.tidal.bts` → decodifica base64 del manifest JSON, estrae `urls[0]`
- `application/dash+xml` → decodifica base64 XML, estrae URL di inizializzazione
- Aggiunta gestione `OriginalTrackUrl` come source primaria (come fa Monochrome)
- Gestione di risposte dove il manifest è già un oggetto JSON (non solo stringa base64)

### 3. Aggiornare CORS headers

Aggiungere gli header mancanti per compatibilità con il client Supabase.

### Dettagli tecnici

```text
Edge Function Flow:
  Request → Fetch uptime tracker (cached 5min)
          → Get live instances (api[] + streaming[])
          → For search: try api instances with fallback
          → For stream: try streaming instances first, then api
          → Parse response (handle data.data || data wrapper)
          → Extract stream URL from manifest
          → Return result
```

File da modificare:
- `supabase/functions/monochrome/index.ts` -- riscrittura completa con discovery dinamico

Nessuna modifica al client necessaria -- l'interfaccia della funzione (input/output) resta identica.

