import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { updatePluginConfig, verifyConfigField } from '@/lib/plugins';
import type { InstalledPlugin } from '@/types/plugins';

interface Props {
  plugin: InstalledPlugin | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const PluginConfigModal: React.FC<Props> = ({ plugin, open, onOpenChange }) => {
  const [config, setConfig] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState<string | null>(null);

  useEffect(() => {
    if (!plugin) return;
    const init: Record<string, string> = {};
    plugin.manifest.config?.fields.forEach((f) => {
      init[f.key] = String(plugin.config?.[f.key] ?? '');
    });
    setConfig(init);
  }, [plugin]);

  if (!plugin) return null;
  const fields = plugin.manifest.config?.fields ?? [];

  const handleSave = async () => {
    const missing = fields.filter((f) => f.required && !config[f.key]?.trim());
    if (missing.length > 0) {
      toast.error(`Compila i campi richiesti: ${missing.map((f) => f.label).join(', ')}`);
      return;
    }
    for (const field of fields) {
      if (field.verifyAction && config[field.key] && config[field.key] !== plugin.config?.[field.key]) {
        setVerifying(field.key);
        const { ok, error } = await verifyConfigField(plugin.manifest, field, { [field.key]: config[field.key] });
        setVerifying(null);
        if (!ok) {
          toast.error(`Verifica fallita per ${field.label}: ${error || 'valore non valido'}`);
          return;
        }
      }
    }
    setSaving(true);
    const { error } = await updatePluginConfig(plugin.id, config);
    setSaving(false);
    if (error) {
      toast.error(`Salvataggio fallito: ${error}`);
      return;
    }
    toast.success('Configurazione salvata');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Configura {plugin.manifest.name}</DialogTitle>
        </DialogHeader>

        {fields.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">Questo plugin non richiede configurazione.</p>
        ) : (
          <div className="space-y-3">
            {fields.map((field) => (
              <div key={field.key} className="space-y-1.5">
                <Label htmlFor={`pcfg-${field.key}`} className="text-xs">
                  {field.label} {field.required && <span className="text-destructive">*</span>}
                </Label>
                <Input
                  id={`pcfg-${field.key}`}
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
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button onClick={handleSave} disabled={saving || verifying !== null || fields.length === 0}>
            {(saving || verifying) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salva
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
