import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { InstalledPlugin } from '@/types/plugins';
import { isPluginConfigured } from '@/lib/plugins';

export function usePlugins() {
  const { user } = useAuth();
  const [plugins, setPlugins] = useState<InstalledPlugin[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setPlugins([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('user_plugins')
      .select('*')
      .eq('user_id', user.id)
      .order('position', { ascending: true });
    if (!error && data) setPlugins(data as unknown as InstalledPlugin[]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`user_plugins_${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_plugins', filter: `user_id=eq.${user.id}` },
        () => {
          load();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, load]);

  const activePlugins = plugins.filter((p) => p.enabled && isPluginConfigured(p));
  const hasUsablePlugins = activePlugins.length > 0;

  return { plugins, activePlugins, loading, hasUsablePlugins, refresh: load };
}
