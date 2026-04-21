import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Trash2, Crown } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { removePlugin } from '@/lib/plugins';
import type { InstalledPlugin } from '@/types/plugins';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plugins: InstalledPlugin[];
  onUpgrade: () => void;
  onPluginRemoved?: () => void;
}

export const PluginLimitDialog: React.FC<Props> = ({ open, onOpenChange, plugins, onUpgrade, onPluginRemoved }) => {
  const [showList, setShowList] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const handleRemove = async (p: InstalledPlugin) => {
    setRemoving(p.id);
    const { error } = await removePlugin(p.id);
    setRemoving(null);
    if (error) {
      toast.error(`Impossibile rimuovere: ${error}`);
      return;
    }
    toast.success(`"${p.manifest.name}" rimosso`);
    onPluginRemoved?.();
    onOpenChange(false);
    setShowList(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setShowList(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-yellow-500" />
            Limite plugin raggiunto
          </AlertDialogTitle>
          <AlertDialogDescription>
            {!showList
              ? 'Il piano Free permette al massimo 2 plugin installati. Passa a Premium per installazioni illimitate, oppure rimuovi un plugin esistente per liberare spazio.'
              : 'Seleziona il plugin da rimuovere:'}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {showList && (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {plugins.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-md border p-2.5">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{p.manifest.name}</div>
                  <div className="text-[11px] text-muted-foreground">v{p.manifest.version}</div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemove(p)}
                  disabled={removing !== null}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <AlertDialogFooter className="gap-2">
          {!showList ? (
            <>
              <Button variant="outline" onClick={() => setShowList(true)}>
                Rimuovi un plugin
              </Button>
              <AlertDialogAction onClick={onUpgrade}>
                <Crown className="h-4 w-4 mr-2" /> Passa a Premium
              </AlertDialogAction>
            </>
          ) : (
            <AlertDialogCancel onClick={() => setShowList(false)}>Indietro</AlertDialogCancel>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
