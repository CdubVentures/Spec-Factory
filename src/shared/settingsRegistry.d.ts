// WHY: Type declaration for the JS ESM registry, consumed by GUI TypeScript.
// This mirrors the shape of RUNTIME_SETTINGS_REGISTRY entries.

export interface RegistryEntry {
  key: string;
  type: 'int' | 'float' | 'bool' | 'string' | 'enum' | 'csv_enum';
  default: unknown;
  min?: number;
  max?: number;
  allowed?: readonly string[];
  allowEmpty?: boolean;
  secret?: boolean;
  readOnly?: boolean;
  defaultsOnly?: boolean;
  routeOnly?: boolean;
  configKey?: string;
  cfgKey?: string;
  envKey?: string;
  tokenClamped?: boolean;
  aliases?: readonly string[];
  deprecated?: boolean;
}

export declare const SEARXNG_AVAILABLE_ENGINES: readonly string[];
export declare const RUNTIME_SETTINGS_REGISTRY: readonly RegistryEntry[];
