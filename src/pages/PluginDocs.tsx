import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Puzzle, Code2, Link2, FileJson, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSettings } from '@/contexts/SettingsContext';

const monochromeManifest = `{
  "id": "monochrome",
  "name": "Monochrome",
  "version": "1.0.0",
  "author": "SoundFlow",
  "description": "FLAC streaming via Tidal mirrors discovered dynamically",
  "type": "audio-source",
  "transport": "edge-function",
  "endpoint": "monochrome",
  "capabilities": ["search", "stream", "lossless"],
  "config": { "fields": [] }
}`;

const realDebridManifest = `{
  "id": "real-debrid",
  "name": "Real Debrid",
  "version": "1.0.0",
  "author": "SoundFlow",
  "description": "High-quality streaming via Real-Debrid torrents",
  "type": "audio-source",
  "transport": "edge-function",
  "endpoint": "real-debrid",
  "capabilities": ["search", "stream", "verify"],
  "config": {
    "fields": [
      {
        "key": "apiKey",
        "label": "API Key",
        "type": "password",
        "required": true,
        "verifyAction": "verify",
        "helpText": "Get your API token from Real-Debrid",
        "helpUrl": "https://real-debrid.com/apitoken"
      }
    ]
  }
}`;

const requestExample = `// POST to plugin endpoint
{
  "action": "search-and-stream",
  "title": "Bohemian Rhapsody",
  "artist": "Queen",
  "quality": "lossless",
  "config": { "apiKey": "user-provided-key" }
}`;

const responseExample = `// Success
{
  "streamUrl": "https://...",
  "quality": "lossless",
  "bitDepth": 16,
  "sampleRate": 44100,
  "mimeType": "audio/flac"
}

// Error
{ "error": "Track not found" }`;

const PluginDocs: React.FC = () => {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const isItalian = settings.language === 'it';

  return (
    <div className="p-4 md:p-8 pb-32 max-w-3xl animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 md:mb-8">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="shrink-0">
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-2xl md:text-4xl font-bold text-foreground">
          {isItalian ? 'Documentazione Plugin' : 'Plugin Documentation'}
        </h1>
      </div>

      <div className="space-y-6 md:space-y-8">
        {/* Intro */}
        <section className="p-4 md:p-5 rounded-xl bg-card">
          <div className="flex items-center gap-3 mb-3">
            <Puzzle className="w-5 h-5 text-primary" />
            <h2 className="text-lg md:text-xl font-semibold text-foreground">
              {isItalian ? 'Cos\'è un plugin SoundFlow' : 'What is a SoundFlow plugin'}
            </h2>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {isItalian
              ? "Un plugin è descritto da un file JSON (manifest) che dichiara l'endpoint di streaming, le capacità e gli eventuali campi di configurazione richiesti all'utente. Il manifest può essere installato incollando un URL pubblico oppure il JSON grezzo. Tutti i plugin attivi formano una catena di fallback per la riproduzione."
              : "A plugin is described by a JSON file (manifest) that declares the streaming endpoint, capabilities, and any configuration fields required from the user. Manifests can be installed by pasting a public URL or the raw JSON. All enabled plugins form the playback fallback chain."}
          </p>
        </section>

        {/* Manifest schema */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <FileJson className="w-5 h-5 text-primary" />
            <h2 className="text-lg md:text-xl font-semibold text-foreground">
              {isItalian ? 'Struttura del manifest' : 'Manifest structure'}
            </h2>
          </div>

          <div className="p-4 rounded-xl bg-card space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">
                {isItalian ? 'Campi obbligatori' : 'Required fields'}
              </h3>
              <ul className="text-sm text-muted-foreground space-y-1.5">
                <li><code className="text-primary">id</code> — {isItalian ? 'slug univoco (es. "real-debrid")' : 'unique slug (e.g. "real-debrid")'}</li>
                <li><code className="text-primary">name</code> — {isItalian ? 'nome leggibile' : 'human-readable name'}</li>
                <li><code className="text-primary">version</code> — {isItalian ? 'versione semver' : 'semver version'}</li>
                <li><code className="text-primary">type</code> — <code>audio-source</code> | <code>lyrics</code> | <code>metadata</code></li>
                <li><code className="text-primary">transport</code> — <code>edge-function</code> | <code>http</code></li>
                <li><code className="text-primary">endpoint</code> — {isItalian ? 'nome edge-function o URL HTTPS completo' : 'edge-function name or full HTTPS URL'}</li>
                <li><code className="text-primary">capabilities</code> — {isItalian ? 'array di' : 'array of'} <code>search</code>, <code>stream</code>, <code>lossless</code>, <code>verify</code></li>
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">
                {isItalian ? 'Campi opzionali' : 'Optional fields'}
              </h3>
              <ul className="text-sm text-muted-foreground space-y-1.5">
                <li><code className="text-primary">author</code>, <code className="text-primary">description</code>, <code className="text-primary">icon</code>, <code className="text-primary">homepage</code></li>
                <li><code className="text-primary">config.fields[]</code> — {isItalian ? 'campi di configurazione (vedi sotto)' : 'configuration fields (see below)'}</li>
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">
                {isItalian ? 'Campo di configurazione' : 'Configuration field'}
              </h3>
              <ul className="text-sm text-muted-foreground space-y-1.5">
                <li><code className="text-primary">key</code> — {isItalian ? "chiave salvata nella config dell'utente" : "key stored in user's config"}</li>
                <li><code className="text-primary">label</code> — {isItalian ? 'etichetta UI' : 'UI label'}</li>
                <li><code className="text-primary">type</code> — <code>text</code> | <code>password</code> | <code>url</code> | <code>number</code></li>
                <li><code className="text-primary">required</code>, <code className="text-primary">placeholder</code>, <code className="text-primary">helpText</code>, <code className="text-primary">helpUrl</code></li>
                <li><code className="text-primary">verifyAction</code> — {isItalian ? "azione opzionale per verificare il valore (es. 'verify')" : "optional action to verify the value (e.g. 'verify')"}</li>
              </ul>
            </div>
          </div>
        </section>

        {/* API contract */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Code2 className="w-5 h-5 text-primary" />
            <h2 className="text-lg md:text-xl font-semibold text-foreground">
              {isItalian ? 'Contratto API endpoint' : 'Endpoint API contract'}
            </h2>
          </div>

          <div className="p-4 rounded-xl bg-card space-y-4">
            <p className="text-sm text-muted-foreground">
              {isItalian
                ? "L'endpoint deve accettare richieste POST con un corpo JSON contenente l'azione e il payload. Le azioni standard sono:"
                : "The endpoint must accept POST requests with a JSON body containing the action and payload. Standard actions are:"}
            </p>
            <ul className="text-sm text-muted-foreground space-y-1.5 ml-4 list-disc">
              <li><code className="text-primary">search-and-stream</code> — {isItalian ? 'cerca e ritorna stream URL in un solo passaggio' : 'search and return stream URL in one shot'}</li>
              <li><code className="text-primary">search</code> — {isItalian ? 'solo ricerca' : 'search only'}</li>
              <li><code className="text-primary">get-stream</code> — {isItalian ? 'ottieni stream da ID noto' : 'get stream from known ID'}</li>
              <li><code className="text-primary">verify</code> — {isItalian ? 'verifica config (es. API key valida)' : 'verify config (e.g. valid API key)'}</li>
            </ul>

            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">{isItalian ? 'Esempio richiesta' : 'Request example'}</h3>
              <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto text-muted-foreground"><code>{requestExample}</code></pre>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">{isItalian ? 'Esempio risposta' : 'Response example'}</h3>
              <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto text-muted-foreground"><code>{responseExample}</code></pre>
            </div>
          </div>
        </section>

        {/* Examples */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-primary" />
            <h2 className="text-lg md:text-xl font-semibold text-foreground">
              {isItalian ? 'Esempi di manifest' : 'Manifest examples'}
            </h2>
          </div>

          <div className="p-4 rounded-xl bg-card space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">Monochrome ({isItalian ? 'senza config' : 'no config'})</h3>
              <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto text-muted-foreground"><code>{monochromeManifest}</code></pre>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">Real Debrid ({isItalian ? 'con API key' : 'with API key'})</h3>
              <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto text-muted-foreground"><code>{realDebridManifest}</code></pre>
            </div>
          </div>
        </section>

        {/* Installation */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Link2 className="w-5 h-5 text-primary" />
            <h2 className="text-lg md:text-xl font-semibold text-foreground">
              {isItalian ? 'Come installare' : 'How to install'}
            </h2>
          </div>

          <div className="p-4 rounded-xl bg-card space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-1">{isItalian ? 'Da URL' : 'From URL'}</h3>
              <p className="text-sm text-muted-foreground">
                {isItalian
                  ? "Pubblica il manifest su un URL HTTPS e incollalo nel tab \"Da URL\" del modal di installazione. Il sistema scarica e valida il file."
                  : 'Publish the manifest at an HTTPS URL and paste it into the "From URL" tab in the install modal. The system fetches and validates the file.'}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-1">{isItalian ? 'Da JSON' : 'From JSON'}</h3>
              <p className="text-sm text-muted-foreground">
                {isItalian
                  ? 'Incolla direttamente il JSON del manifest nel tab "Da JSON". Utile per testing o plugin privati.'
                  : 'Paste the manifest JSON directly into the "From JSON" tab. Useful for testing or private plugins.'}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-1">{isItalian ? 'Configurazione' : 'Configuration'}</h3>
              <p className="text-sm text-muted-foreground">
                {isItalian
                  ? "Se il manifest dichiara campi richiesti, verranno richiesti subito dopo l'installazione. I valori sono salvati nella riga utente e mai esposti pubblicamente."
                  : 'If the manifest declares required fields, they are requested right after installation. Values are stored on the user row and never exposed publicly.'}
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default PluginDocs;
