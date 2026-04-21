import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Loader2, AlertCircle, CheckCircle2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchManifest,
  parseManifestJSON,
  installPlugin,
  verifyConfigField,
} from '@/lib/plugins';
import type { PluginManifest } from '@/types/plugins';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInstalled?: () => void;
}

export const InstallPluginModal: React.FC<Props> = ({ open, onOpenChange, onInstalled }) => {
  const [tab, setTab] = useState<'url' | 'json'>('url');
  const [url, setUrl] = useState('');
  const [json, setJson] = useState('');
  const [validating, setValidating] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [manifest, setManifest] = useState<PluginManifest | null>(null);
  const [config, setConfig] = useState<Record<string, string>>({});
  const [verifying, setVerifying] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);

  const reset = () => {
    setUrl('');
    setJson('');
    setErrors([]);
    setManifest(null);
    setConfig({});
    setVerifying(null);
    setInstalling(false);
  };

  const handleClose = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const handleValidate = async () => {
    setValidating(true);
    setErrors([]);
    setManifest(null);
    const result = tab === 'url' ? await fetchManifest(url.trim()) : parseManifestJSON(json);
    setValidating(false);
    if (!result.valid) {
      setErrors(result.errors);
      return;
    }
    setManifest(result.manifest!);
    // Init config with empty strings for required fields
    const initial: Record<string, string> = {};
    result.manifest!.config?.fields.forEach((f) => {
      initial[f.key] = '';
    });
    setConfig(initial);
  };

  const handleInstall = async () => {
    if (!manifest) return;
    // Validate required fields
    const missing = manifest.config?.fields.filter((f) => f.required && !config[f.key]?.trim()) ?? [];
    if (missing.length > 0) {
      toast.error(`Compila i campi richiesti: ${missing.map((f) => f.label).join(', ')}`);
      return;
    }

    // Verify fields with verifyAction
    for (const field of manifest.config?.fields ?? []) {
      if (field.verifyAction && config[field.key]) {
        setVerifying(field.key);
        const { ok, error } = await verifyConfigField(manifest, field, { [field.key]: config[field.key] });
        setVerifying(null);
        if (!ok) {
          toast.error(`Verifica fallita per ${field.label}: ${error || 'valore non valido'}`);
          return;
        }
      }
    }

    setInstalling(true);
    const { error } = await installPlugin(manifest, config);
    setInstalling(false);
    if (error) {
      toast.error(`Installazione fallita: ${error}`);
      return;
    }
    toast.success(`Plugin "${manifest.name}" installato`);
    onInstalled?.();
    handleClose(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Installa Plugin</DialogTitle>
        </DialogHeader>

        {!manifest && (
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'url' | 'json')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="url">Da URL</TabsTrigger>
              <TabsTrigger value="json">Da JSON</TabsTrigger>
            </TabsList>
            <TabsContent value="url" className="space-y-3 mt-4">
              <Label htmlFor="manifest-url">URL del manifest</Label>
              <Input
                id="manifest-url"
                placeholder="https://example.com/plugin.json"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </TabsContent>
            <TabsContent value="json" className="space-y-3 mt-4">
              <Label htmlFor="manifest-json">Manifest JSON</Label>
              <Textarea
                id="manifest-json"
                placeholder='{ "id": "...", "name": "...", "version": "1.0.0", ... }'
                rows={10}
                value={json}
                onChange={(e) => setJson(e.target.value)}
                className="font-mono text-xs"
              />
            </TabsContent>
          </Tabs>
        )}

        {errors.length > 0 && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium text-destructive">
              <AlertCircle className="h-4 w-4" /> Manifest non valido
            </div>
            <ul className="text-xs text-destructive/90 list-disc pl-5 space-y-0.5">
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        {manifest && (
          <div className="space-y-4">
            <div className="rounded-md border bg-muted/30 p-3 space-y-1">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="font-semibold">{manifest.name}</span>
                <span className="text-xs text-muted-foreground">v{manifest.version}</span>
              </div>
              {manifest.description && (
                <p className="text-xs text-muted-foreground">{manifest.description}</p>
              )}
              <div className="flex flex-wrap gap-1 pt-1">
                {manifest.capabilities.map((c) => (
                  <span key={c} className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">
                    {c}
                  </span>
                ))}
              </div>
            </div>

            {(manifest.config?.fields?.length ?? 0) > 0 && (
              <div className="space-y-3">
                <div className="text-sm font-medium">Configurazione</div>
                {manifest.config!.fields.map((field) => (
                  <div key={field.key} className="space-y-1.5">
                    <Label htmlFor={`cfg-${field.key}`} className="text-xs">
                      {field.label} {field.required && <span className="text-destructive">*</span>}
                    </Label>
                    <Input
                      id={`cfg-${field.key}`}
                      type={field.type === 'password' ? 'password' : 'text'}
                      placeholder={field.placeholder}
                      value={config[field.key] || ''}
                      onChange={(e) => setConfig((c) => ({ ...c, [field.key]: e.target.value }))}
                    />
                    {field.helpText && (
                      <p className="text-[11px] text-muted-foreground">
                        {field.helpText}
                        {field.helpUrl && (
                          <a
                            href={field.helpUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 ml-1 text-primary hover:underline"
                          >
                            apri <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        )}
                      </p>
                    )}
                    {verifying === field.key && (
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" /> Verifica in corso...
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {!manifest ? (
            <Button onClick={handleValidate} disabled={validating || (!url && !json)}>
              {validating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Valida manifest
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setManifest(null)}>
                Indietro
              </Button>
              <Button onClick={handleInstall} disabled={installing || verifying !== null}>
                {(installing || verifying) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Installa
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
