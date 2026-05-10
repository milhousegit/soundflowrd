import { supabase } from '@/integrations/supabase/client';
import type {
  PluginManifest,
  InstalledPlugin,
  ManifestValidationResult,
  PluginInvokePayload,
  PluginStreamResult,
  PluginConfigField,
} from '@/types/plugins';

const VALID_TYPES = ['audio-source', 'lyrics', 'metadata'];
const VALID_TRANSPORTS = ['edge-function', 'http'];

/** Validate a raw manifest object. Returns errors and (if valid) the typed manifest. */
export function validateManifest(raw: unknown): ManifestValidationResult {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object') {
    return { valid: false, errors: ['Manifest must be a JSON object'] };
  }
  const m = raw as Record<string, unknown>;

  const requireStr = (key: string) => {
    if (typeof m[key] !== 'string' || !(m[key] as string).trim()) {
      errors.push(`Missing or invalid field: "${key}"`);
    }
  };

  requireStr('id');
  requireStr('name');
  requireStr('version');
  requireStr('type');
  requireStr('transport');
  requireStr('endpoint');

  if (typeof m.id === 'string' && !/^[a-z0-9][a-z0-9-_]*$/i.test(m.id)) {
    errors.push('"id" must be a slug (alphanumeric, dash, underscore)');
  }
  if (typeof m.type === 'string' && !VALID_TYPES.includes(m.type)) {
    errors.push(`"type" must be one of: ${VALID_TYPES.join(', ')}`);
  }
  if (typeof m.transport === 'string' && !VALID_TRANSPORTS.includes(m.transport)) {
    errors.push(`"transport" must be one of: ${VALID_TRANSPORTS.join(', ')}`);
  }
  if (m.transport === 'http' && typeof m.endpoint === 'string' && !/^https?:\/\//.test(m.endpoint)) {
    errors.push('"endpoint" must be a full HTTPS URL when transport is "http"');
  }
  if (!Array.isArray(m.capabilities)) {
    errors.push('"capabilities" must be an array of strings');
  }

  if (m.config !== undefined) {
    const cfg = m.config as Record<string, unknown>;
    if (!cfg || typeof cfg !== 'object' || !Array.isArray(cfg.fields)) {
      errors.push('"config.fields" must be an array');
    } else {
      cfg.fields.forEach((f: unknown, i: number) => {
        if (!f || typeof f !== 'object') {
          errors.push(`config.fields[${i}] must be an object`);
          return;
        }
        const fld = f as Record<string, unknown>;
        if (typeof fld.key !== 'string') errors.push(`config.fields[${i}].key required`);
        if (typeof fld.label !== 'string') errors.push(`config.fields[${i}].label required`);
        if (typeof fld.type !== 'string') errors.push(`config.fields[${i}].type required`);
      });
    }
  }

  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, errors: [], manifest: raw as PluginManifest };
}

/** Fetch a manifest from a URL and validate it. */
export async function fetchManifest(url: string): Promise<ManifestValidationResult> {
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return { valid: false, errors: [`HTTP ${res.status}: failed to fetch manifest`] };
    const json = await res.json();
    return validateManifest(json);
  } catch (e) {
    return { valid: false, errors: [(e as Error).message || 'Failed to fetch manifest'] };
  }
}

/** Parse a JSON string and validate as manifest. */
export function parseManifestJSON(text: string): ManifestValidationResult {
  try {
    return validateManifest(JSON.parse(text));
  } catch (e) {
    return { valid: false, errors: [`Invalid JSON: ${(e as Error).message}`] };
  }
}

/** Returns true if all required config fields are filled. */
export function isPluginConfigured(plugin: InstalledPlugin): boolean {
  const fields = plugin.manifest.config?.fields ?? [];
  return fields.every((f) => {
    if (!f.required) return true;
    const v = plugin.config?.[f.key];
    return typeof v === 'string' ? v.trim().length > 0 : v !== undefined && v !== null;
  });
}

/** Generic invoker. Routes to edge-function or HTTP based on manifest.transport. */
export async function invokePlugin<T = unknown>(
  plugin: InstalledPlugin | PluginManifest,
  payload: PluginInvokePayload,
  configOverride?: Record<string, unknown>
): Promise<{ data?: T; error?: string }> {
  const manifest: PluginManifest = 'manifest' in plugin ? plugin.manifest : plugin;
  const config = configOverride ?? ('config' in plugin ? (plugin.config as Record<string, unknown>) : {});
  const body = { ...payload, config };

  try {
    if (manifest.transport === 'edge-function') {
      // Use direct fetch (not supabase.functions.invoke) so non-2xx responses
      // don't trigger SDK console.error logging — plugin failures are expected
      // (e.g. "no results", "login required") and we want to fall back silently.
      const projectId = (import.meta as { env?: Record<string, string> }).env?.VITE_SUPABASE_PROJECT_ID || '';
      const anonKey = (import.meta as { env?: Record<string, string> }).env?.VITE_SUPABASE_PUBLISHABLE_KEY || '';
      const url = `https://${projectId}.supabase.co/functions/v1/${manifest.endpoint}`;
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token || anonKey;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'apikey': anonKey,
        },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return { error: json?.error || `HTTP ${res.status}` };
      if (json?.error) return { error: String(json.error) };
      return { data: json as T };
    }
    // HTTP transport
    const res = await fetch(manifest.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { error: json?.error || `HTTP ${res.status}` };
    if (json?.error) return { error: String(json.error) };
    return { data: json as T };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** Verify a config field via the plugin's verify action. */
export async function verifyConfigField(
  manifest: PluginManifest,
  field: PluginConfigField,
  config: Record<string, unknown>
): Promise<{ ok: boolean; error?: string }> {
  if (!field.verifyAction) return { ok: true };
  const { data, error } = await invokePlugin<Record<string, unknown>>(
    manifest,
    { action: field.verifyAction, ...config },
    config
  );
  if (error) return { ok: false, error };
  // Convention: { valid: true } | { ok: true } | no error => ok
  if (data && typeof data === 'object') {
    if ('valid' in data) return { ok: Boolean(data.valid), error: data.valid ? undefined : 'Invalid value' };
    if ('ok' in data) return { ok: Boolean(data.ok) };
  }
  return { ok: true };
}

/** Install a plugin for the current user.
 * Optionally pass `source` to record where the manifest came from
 * (URL string, or 'inline' for raw JSON installs). Stored inside manifest.__source.
 */
export async function installPlugin(
  manifest: PluginManifest,
  config: Record<string, unknown> = {},
  source?: { kind: 'url' | 'inline'; value: string }
): Promise<{ data?: InstalledPlugin; error?: string }> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return { error: 'Not authenticated' };

  // Determine next position
  const { data: existing } = await supabase
    .from('user_plugins')
    .select('position')
    .eq('user_id', userId)
    .order('position', { ascending: false })
    .limit(1);
  const nextPos = (existing?.[0]?.position ?? -1) + 1;

  const manifestWithSource = source
    ? { ...manifest, __source: source }
    : manifest;

  const { data, error } = await supabase
    .from('user_plugins')
    .insert({
      user_id: userId,
      plugin_id: manifest.id,
      manifest: manifestWithSource as unknown as never,
      config: config as unknown as never,
      enabled: true,
      position: nextPos,
    })
    .select()
    .single();

  if (error) return { error: error.message };
  return { data: data as unknown as InstalledPlugin };
}

export async function removePlugin(pluginRowId: string): Promise<{ error?: string }> {
  const { error } = await supabase.from('user_plugins').delete().eq('id', pluginRowId);
  return error ? { error: error.message } : {};
}

export async function updatePluginConfig(
  pluginRowId: string,
  config: Record<string, unknown>
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('user_plugins')
    .update({ config: config as unknown as never })
    .eq('id', pluginRowId);
  return error ? { error: error.message } : {};
}

export async function setPluginEnabled(pluginRowId: string, enabled: boolean): Promise<{ error?: string }> {
  const { error } = await supabase.from('user_plugins').update({ enabled }).eq('id', pluginRowId);
  return error ? { error: error.message } : {};
}

export async function reorderPlugins(orderedIds: string[]): Promise<{ error?: string }> {
  // Sequential updates; rows are tiny.
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase.from('user_plugins').update({ position: i }).eq('id', orderedIds[i]);
    if (error) return { error: error.message };
  }
  return {};
}

/** Run search-and-stream through the user's plugin chain (in order, enabled, configured). */
export async function streamWithPluginChain(
  plugins: InstalledPlugin[],
  payload: PluginInvokePayload
): Promise<{ result?: PluginStreamResult; pluginUsed?: InstalledPlugin; error?: string }> {
  const chain = plugins
    .filter((p) => p.enabled && isPluginConfigured(p))
    .sort((a, b) => a.position - b.position);

  if (chain.length === 0) {
    return { error: 'No configured plugins available' };
  }

  let lastError = 'All plugins failed';
  for (const plugin of chain) {
    const { data, error } = await invokePlugin<PluginStreamResult>(plugin, payload);
    if (error) {
      lastError = error;
      continue;
    }
    if (data && typeof data === 'object' && 'streamUrl' in data && data.streamUrl) {
      return { result: data, pluginUsed: plugin };
    }
  }
  return { error: lastError };
}
