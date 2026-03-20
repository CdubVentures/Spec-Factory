// WHY: O(1) Feature Scaling — derive all GUI-side settings maps from the
// canonical registry SSOT. This eliminates hardcoded per-field references
// in normalizers, payload serializers, hydration bindings, and contracts.
// Adding a new setting to the registry auto-propagates to all GUI layers.

import { RUNTIME_SETTINGS_REGISTRY, type RegistryEntry } from '../../../../src/shared/settingsRegistry.js';

// Re-export for consumers that need direct registry access
export { RUNTIME_SETTINGS_REGISTRY };
export type { RegistryEntry };

export interface NumberBound {
  min: number;
  max: number;
  int?: boolean;
}

export type RegistryType = 'int' | 'float' | 'bool' | 'string' | 'enum' | 'csv_enum';

// WHY: Bounds map replaces the 100+ entry RUNTIME_NUMBER_BOUNDS in RuntimeFlowDraftContracts.ts
const _bounds: Record<string, NumberBound> = {};
const _typeMap: Record<string, RegistryType> = {};
const _enumMap: Record<string, readonly string[]> = {};
const _allowEmpty = new Set<string>();
const _secretKeys = new Set<string>();
const _allKeys: string[] = [];
const _defaults: Record<string, unknown> = {};

for (const entry of RUNTIME_SETTINGS_REGISTRY) {
  _allKeys.push(entry.key);
  _typeMap[entry.key] = entry.type;
  _defaults[entry.key] = entry.default;

  if (entry.allowEmpty) _allowEmpty.add(entry.key);
  if (entry.secret) _secretKeys.add(entry.key);

  if ((entry.type === 'int' || entry.type === 'float') && entry.min != null && entry.max != null) {
    _bounds[entry.key] = Object.freeze({
      min: entry.min,
      max: entry.max,
      ...(entry.type === 'int' ? { int: true } : {}),
    });
  }

  if ((entry.type === 'enum' || entry.type === 'csv_enum') && entry.allowed) {
    _enumMap[entry.key] = Object.freeze([...entry.allowed]);
  }
}

export const REGISTRY_BOUNDS: Readonly<Record<string, NumberBound>> = Object.freeze(_bounds);
export const REGISTRY_TYPE_MAP: Readonly<Record<string, RegistryType>> = Object.freeze(_typeMap);
export const REGISTRY_ENUM_MAP: Readonly<Record<string, readonly string[]>> = Object.freeze(_enumMap);
export const REGISTRY_ALLOW_EMPTY: ReadonlySet<string> = _allowEmpty;
export const REGISTRY_SECRET_KEYS: ReadonlySet<string> = _secretKeys;
export const REGISTRY_ALL_KEYS: readonly string[] = Object.freeze(_allKeys);
export const REGISTRY_DEFAULTS: Readonly<Record<string, unknown>> = Object.freeze(_defaults);
