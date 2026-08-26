export type PluginConfigFieldType = 'text' | 'password' | 'url' | 'number';

export interface PluginConfigField {
  key: string;
  label: string;
  type: PluginConfigFieldType;
  required?: boolean;
  placeholder?: string;
  helpText?: string;
  helpUrl?: string;
  /** Optional action name sent to the plugin endpoint to verify this field's value */
  verifyAction?: string;
}

export interface PluginConfigSchema {
  fields: PluginConfigField[];
}

export type PluginType = 'audio-source' | 'lyrics' | 'metadata';
export type PluginTransport = 'edge-function' | 'http';
export type PluginCapability = 'search' | 'stream' | 'lossless' | 'verify';

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  author?: string;
  description?: string;
  type: PluginType;
  transport: PluginTransport;
  /** Edge-function name (when transport=edge-function) or full HTTPS URL (when transport=http) */
  endpoint: string;
  capabilities: PluginCapability[];
  config?: PluginConfigSchema;
  icon?: string;
  homepage?: string;
}

export interface InstalledPlugin {
  id: string;
  user_id: string;
  plugin_id: string;
  manifest: PluginManifest;
  config: Record<string, unknown>;
  enabled: boolean;
  position: number;
  installed_at: string;
  updated_at: string;
}

export interface PluginInvokePayload {
  action: 'search-and-stream' | 'search' | 'get-stream' | 'verify' | string;
  title?: string;
  artist?: string;
  album?: string;
  tidalId?: string | number;
  trackId?: string;
  quality?: 'high' | 'medium' | 'low' | 'lossless';
  config?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface PluginStreamResult {
  streamUrl?: string;
  /** Video identifier for plugins that delegate playback to an embedded player. */
  videoId?: string;
  duration?: number;
  title?: string;
  artist?: string;
  album?: string;
  quality?: string;
  bitDepth?: number;
  sampleRate?: number;
  mimeType?: string;
  [key: string]: unknown;
}

export interface ManifestValidationResult {
  valid: boolean;
  errors: string[];
  manifest?: PluginManifest;
}
