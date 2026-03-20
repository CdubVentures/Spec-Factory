// WHY: Type declarations for frontend TS imports of the JS contract module.
// Follows the proven settingsRegistry.d.ts pattern.

export declare const SOURCE_ENTRY_FIELD_KEYS: readonly string[];
export declare const TIER_VALUES: readonly string[];
export declare const AUTHORITY_VALUES: readonly string[];
export declare const DISCOVERY_METHOD_VALUES: readonly string[];
export declare const FIELD_COVERAGE_KEYS: readonly string[];
export declare const PACING_FIELD_KEYS: readonly string[];
export declare const DISCOVERY_FIELD_KEYS: readonly string[];

export declare const SOURCE_ENTRY_DEFAULTS: Readonly<Record<string, unknown>>;

export declare const DISCOVERY_DEFAULTS: Readonly<{
  method: string;
  source_type: string;
  search_pattern: string;
  priority: number;
  enabled: boolean;
  notes: string;
}>;

export declare function sourceEntryMutableKeys(): Set<string>;
