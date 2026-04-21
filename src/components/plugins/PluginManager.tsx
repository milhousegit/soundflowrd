import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Plus,
  Settings as SettingsIcon,
  Trash2,
  ArrowUp,
  ArrowDown,
  Crown,
  Puzzle,
  AlertTriangle,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { usePlugins } from '@/hooks/usePlugins';
import { useAuth } from '@/contexts/AuthContext';
import {
  removePlugin,
  setPluginEnabled,
  reorderPlugins,
  isPluginConfigured,
} from '@/lib/plugins';
import type { InstalledPlugin } from '@/types/plugins';
import { InstallPluginModal } from './InstallPluginModal';
import { PluginConfigModal } from './PluginConfigModal';
import { PluginLimitDialog } from './PluginLimitDialog';

const FREE_LIMIT = 2;

interface Props {
  onUpgrade?: () => void;
}

export const PluginManager: React.FC<Props> = ({ onUpgrade }) => {
  const { plugins, loading, refresh } = usePlugins();
  const { profile, isAdmin, simulateFreeUser } = useAuth();
  const isPremium = (profile?.is_premium && !simulateFreeUser) || isAdmin;
  const limitReached = !isPremium && plugins.length >= FREE_LIMIT;

  const [installOpen, setInstallOpen] = useState(false);
  const [limitOpen, setLimitOpen] = useState(false);
  const [configPlugin, setConfigPlugin] = useState<InstalledPlugin | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const handleInstallClick = () => {
    if (limitReached) {
      setLimitOpen(true);
      return;
    }
    setInstallOpen(true);
  };

  const handleRemove = async (p: InstalledPlugin) => {
    if (!confirm(`Rimuovere "${p.manifest.name}"?`)) return;
    setBusyId(p.id);
    const { error } = await removePlugin(p.id);
    setBusyId(null);
    if (error) toast.error(error);
    else toast.success(`"${p.manifest.name}" rimosso`);
  };

  const handleToggle = async (p: InstalledPlugin, enabled: boolean) => {
    setBusyId(p.id);
    const { error } = await setPluginEnabled(p.id, enabled);
    setBusyId(null);
    if (error) toast.error(error);
  };

  const handleMove = async (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= plugins.length) return;
    const sorted = [...plugins].sort((a, b) => a.position - b.position);
    const reordered = [...sorted];
    [reordered[idx], reordered[newIdx]] = [reordered[newIdx], reordered[idx]];
    setBusyId(sorted[idx].id);
    const { error } = await reorderPlugins(reordered.map((p) => p.id));
    setBusyId(null);
    if (error) toast.error(error);
  };

  const sortedPlugins = [...plugins].sort((a, b) => a.position - b.position);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Puzzle className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Plugin di riproduzione</h3>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isPremium ? (
              <>{plugins.length}/∞ plugin · Premium</>
            ) : (
              <>
                {plugins.length}/{FREE_LIMIT} plugin · Free
              </>
            )}
          </p>
        </div>
        <Button size="sm" onClick={handleInstallClick}>
          <Plus className="h-4 w-4 mr-1.5" /> Installa
        </Button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      )}

      {!loading && sortedPlugins.length === 0 && (
        <Card className="p-6 text-center space-y-3">
          <AlertTriangle className="h-8 w-8 mx-auto text-yellow-500" />
          <div>
            <p className="text-sm font-medium">Nessun plugin installato</p>
            <p className="text-xs text-muted-foreground mt-1">
              Installa almeno un plugin per poter avviare la riproduzione.
            </p>
          </div>
          <Button size="sm" onClick={handleInstallClick}>
            <Plus className="h-4 w-4 mr-1.5" /> Installa il primo plugin
          </Button>
        </Card>
      )}

      <div className="space-y-2">
        {sortedPlugins.map((p, idx) => {
          const configured = isPluginConfigured(p);
          const status = !p.enabled ? 'disabled' : !configured ? 'unconfigured' : 'active';
          return (
            <Card key={p.id} className="p-3">
              <div className="flex items-start gap-3">
                <div className="flex flex-col gap-0.5 pt-1">
                  <button
                    onClick={() => handleMove(idx, -1)}
                    disabled={idx === 0 || busyId !== null}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                    aria-label="Sposta su"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleMove(idx, 1)}
                    disabled={idx === sortedPlugins.length - 1 || busyId !== null}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                    aria-label="Sposta giù"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm truncate">{p.manifest.name}</span>
                    <span className="text-[10px] text-muted-foreground">v{p.manifest.version}</span>
                    {status === 'active' && (
                      <Badge variant="secondary" className="text-[10px] py-0 px-1.5 h-4">
                        Attivo
                      </Badge>
                    )}
                    {status === 'unconfigured' && (
                      <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4 border-yellow-500/40 text-yellow-600 dark:text-yellow-400">
                        Da configurare
                      </Badge>
                    )}
                    {status === 'disabled' && (
                      <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4 text-muted-foreground">
                        Disattivato
                      </Badge>
                    )}
                  </div>
                  {p.manifest.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {p.manifest.description}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <Switch
                    checked={p.enabled}
                    onCheckedChange={(v) => handleToggle(p, v)}
                    disabled={busyId !== null}
                  />
                  {(p.manifest.config?.fields?.length ?? 0) > 0 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setConfigPlugin(p)}
                      disabled={busyId !== null}
                    >
                      <SettingsIcon className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => handleRemove(p)}
                    disabled={busyId !== null}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-2 border-t">
        <Link
          to="/app/info/plugins"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          Documentazione plugin <ExternalLink className="h-3 w-3" />
        </Link>
        {!isPremium && (
          <Button variant="ghost" size="sm" className="text-xs h-7" onClick={onUpgrade}>
            <Crown className="h-3 w-3 mr-1 text-yellow-500" /> Premium per illimitati
          </Button>
        )}
      </div>

      <InstallPluginModal open={installOpen} onOpenChange={setInstallOpen} onInstalled={refresh} />
      <PluginConfigModal
        plugin={configPlugin}
        open={configPlugin !== null}
        onOpenChange={(o) => !o && setConfigPlugin(null)}
      />
      <PluginLimitDialog
        open={limitOpen}
        onOpenChange={setLimitOpen}
        plugins={sortedPlugins}
        onUpgrade={() => {
          setLimitOpen(false);
          onUpgrade?.();
        }}
        onPluginRemoved={refresh}
      />
    </div>
  );
};
