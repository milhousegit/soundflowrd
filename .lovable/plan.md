

# Sistema Plugin con Manifest

Trasformiamo la sezione "Riproduzione" in **"Plugin"**. La riproduzione richiede almeno un plugin installato e configurato — senza plugin nessun audio parte. Monochrome e Real‑Debrid diventano plugin esterni come qualsiasi altro, ma vengono pre‑installati per gli utenti esistenti.

## Concetti chiave

- **Plugin manifest**: file JSON che descrive una sorgente audio (id, nome, versione, transport, endpoint, capacità, schema config).
- **Installazione**: l'utente incolla un URL del manifest **oppure** il JSON grezzo. Il sistema valida e salva.
- **Limite Free**: massimo 2 plugin attivi. Tentando di installarne un terzo appare un dialog "Passa a Premium" con CTA secondaria "Rimuovi un plugin esistente" che mostra la lista per scegliere quale eliminare e poi continuare l'installazione.
- **Premium / Admin**: plugin illimitati.
- **Riproduzione**: la `hybridFallbackChain` è sostituita da una **catena di plugin installati** ordinabile. Se nessun plugin abilitato e configurato → toast "Installa un plugin di riproduzione per continuare" + CTA verso Settings → Plugin.

## Struttura manifest standard

```text
{
  "id": "real-debrid",                // slug univoco
  "name": "Real Debrid",
  "version": "1.0.0",
  "author": "SoundFlow",
  "description": "Streaming via torrents su Real-Debrid",
  "type": "audio-source",             // futuro: lyrics, metadata
  "transport": "edge-function",       // edge-function | http
  "endpoint": "real-debrid",          // nome edge-function o URL HTTP
  "capabilities": ["search", "stream"],
  "config": {
    "fields": [
      {
        "key": "apiKey",
        "label": "API Key",
        "type": "password",
        "required": true,
        "verifyAction": "verify"
      }
    ]
  },
  "icon": "https://..."
}
```

Monochrome avrà `config.fields = []`. Real‑Debrid richiederà l'API Key al momento dell'installazione, con verifica via `action: "verify"` sull'edge-function.

## Backend

**Nuova tabella `user_plugins`**
- `id uuid pk`, `user_id uuid → auth.users`, `plugin_id text` (slug), `manifest jsonb`, `config jsonb`, `enabled boolean default true`, `position int`, `installed_at timestamptz`
- Unique `(user_id, plugin_id)`
- RLS: solo proprietario CRUD

**Migrazione one‑shot per utenti esistenti** (eseguita in SQL dentro la migration):
- Per ogni `profiles.id` esistente: inserisce riga `monochrome` (config vuota, position 0).
- Se `profiles.real_debrid_api_key IS NOT NULL`: inserisce riga `real-debrid` con `config = {"apiKey": "..."}` (position 1).
- I nuovi utenti registrati dopo la migrazione **non ricevono nulla** — devono installare manualmente.

## Frontend

### Nuova sezione "Plugin" in Settings (sostituisce "Riproduzione")
Mantenuti: qualità audio, crossfade. Rimossi: Audio Source Mode, RD inline, Hybrid chain, Bridge URL.

Componenti:
1. **Lista plugin installati**: card con icona, nome, versione, badge stato (`Attivo` / `Da configurare` / `Disattivato`), drag‑handle per riordinare la fallback chain, switch enable/disable, pulsante config (apre modal con `config.fields`), pulsante elimina.
2. **Counter**: `2/2 plugin (Free)` o `3/∞ (Premium)`.
3. **Pulsante "Installa plugin"** → modal con due tab: **"Da URL"** / **"Da JSON"**. Validazione del manifest, anteprima campi/capabilities, e se `config.fields` non è vuoto chiede subito i valori (con verifica per RD).
4. **Link "Documentazione plugin"** → `/app/info/plugins`.

### Player & playback
- `PlayerContext` non legge più `audioSourceMode` / `selectedScrapingSource` / `hybridFallbackChain`.
- Legge la lista `user_plugins` ordinata per `position`, filtra solo `enabled === true` e config valida (campi required popolati).
- Per ogni plugin nella catena chiama dinamicamente l'edge‑function (`manifest.endpoint`) con payload standard `{action: "search-and-stream", title, artist, quality, config}`.
- Lista vuota o tutti senza config → `play()` mostra toast "Installa un plugin di riproduzione per continuare" + CTA Settings.

### Login.tsx
- Rimosso il campo "Real‑Debrid API Key" dalla registrazione.
- Rimossa logica `pendingApiKey` post‑signup.

### Documentazione
Pagina `/app/info/plugins` con:
- Specifica completa del manifest (campi obbligatori/opzionali, tipi field).
- Contratto API che endpoint deve rispettare:
  - Input: `{action: "search-and-stream" | "search" | "get-stream" | "verify", title?, artist?, tidalId?, quality?, config?}`
  - Output success: `{streamUrl, quality, bitDepth?, sampleRate?}`
  - Output error: `{error: string}`
- Esempi: manifest Monochrome, manifest Real‑Debrid.
- Istruzioni installazione (URL vs JSON).

## Dettagli tecnici

**File da creare**
- `supabase/migrations/<ts>_user_plugins.sql` — tabella + RLS + seed utenti esistenti
- `src/types/plugins.ts` — tipi `PluginManifest`, `PluginConfigField`, `InstalledPlugin`
- `src/lib/plugins.ts` — `fetchManifest`, `validateManifest`, `invokePlugin`, `installPlugin`, `removePlugin`, `reorderPlugins`, `updatePluginConfig`
- `src/hooks/usePlugins.ts` — load + realtime subscription su `user_plugins`
- `src/components/plugins/PluginManager.tsx` — sezione Settings
- `src/components/plugins/InstallPluginModal.tsx` — tab URL/JSON + validazione + form config inline
- `src/components/plugins/PluginConfigModal.tsx` — modifica config plugin installato
- `src/components/plugins/PluginLimitDialog.tsx` — dialog limite Free con CTA Premium / Rimuovi
- `public/manifests/monochrome.json` + `public/manifests/real-debrid.json` — manifest ufficiali (URL pubblico riutilizzabile)

**File da modificare**
- `src/pages/Settings.tsx` — sostituire sezione Playback con `<PluginManager />`
- `src/contexts/PlayerContext.tsx` — sostituire chain hardcoded con loop sui plugin installati
- `src/components/Login.tsx` — rimuovere campo API Key e logica pending
- `src/pages/Info.tsx` — aggiungere link/sezione "Documentazione plugin"
- `src/types/settings.ts` — deprecare `audioSourceMode`, `hybridFallbackChain`, `selectedScrapingSource`, `bridgeUrl`

**Edge functions** (`monochrome`, `real-debrid`): nessuna modifica — già compatibili col contratto. Real‑Debrid riceverà l'API Key dal `config` invece che dal profilo.

**Edge cases**
- Manifest invalido → errore inline nel modal con dettaglio campo mancante
- Plugin senza config required compilata → badge giallo "Da configurare", saltato nella catena
- Verifica API Key RD al salvataggio (azione `verify` con apiKey nel body)
- Migrazione idempotente: `ON CONFLICT (user_id, plugin_id) DO NOTHING`

