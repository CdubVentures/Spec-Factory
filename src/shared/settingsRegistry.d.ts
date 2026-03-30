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
  clampModelKey?: string;
  clampModelFallbackKey?: string;
  aliases?: readonly string[];
  deprecated?: boolean;
  // UI presentation metadata (pipeline settings reorganization)
  uiCategory?: 'flow' | 'planner' | 'fetcher' | 'extraction' | 'validation';
  uiSection?: string;
  uiLabel?: string;
  uiTip?: string;
  uiOrder?: number;
  uiHero?: boolean;
  uiAdvanced?: boolean;
  disabledBy?: string;
}

export declare const SEARXNG_AVAILABLE_ENGINES: readonly string[];
export declare const RUNTIME_SETTINGS_REGISTRY: readonly RegistryEntry[];
export declare const UI_SETTINGS_REGISTRY: readonly RegistryEntry[];

