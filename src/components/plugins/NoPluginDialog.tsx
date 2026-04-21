import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Puzzle } from 'lucide-react';

export const NO_PLUGIN_EVENT = 'soundflow:no-plugin';

/** Global dialog shown when the user tries to play but has no usable plugin.
 *  Triggered by dispatching `new CustomEvent(NO_PLUGIN_EVENT)` anywhere.
 *  Mount once near the top of the app (App.tsx). */
export const NoPluginDialog: React.FC = () => {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener(NO_PLUGIN_EVENT, handler);
    return () => window.removeEventListener(NO_PLUGIN_EVENT, handler);
  }, []);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-2">
            <Puzzle className="h-5 w-5 text-primary" />
            <AlertDialogTitle>Nessun plugin di riproduzione attivo</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="pt-2">
            Per avviare la riproduzione devi avere almeno un plugin installato,
            attivo e configurato. Apri Impostazioni → Plugin per installarne uno.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annulla</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              setOpen(false);
              navigate('/app/settings');
            }}
          >
            Vai a Plugin
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
