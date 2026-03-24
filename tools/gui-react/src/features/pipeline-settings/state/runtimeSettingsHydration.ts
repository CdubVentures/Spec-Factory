// WHY: O(1) Feature Scaling — hydration bindings are registry-driven. Adding a new
// setting to settingsRegistry.js auto-generates its hydration binding. Zero per-field code.

import type { RuntimeSettings } from './runtimeSettingsAuthority.ts';
import type {
  RuntimeHydrationBindingSetters,
  RuntimeHydrationBindings,
} from './runtimeSettingsDomainTypes.ts';
import {
  RUNTIME_SETTINGS_REGISTRY,
  REGISTRY_ALLOW_EMPTY,
} from '../../../shared/registryDerivedSettingsMaps.ts';

function hasSnapshotData(
  source: RuntimeSettings | Record<string, unknown> | undefined,
): source is Record<string, unknown> {
  return Boolean(source) && typeof source === 'object' && !Array.isArray(source);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function createRuntimeHydrationBindings(
  setters: RuntimeHydrationBindingSetters,
): RuntimeHydrationBindings {
  const setterMap = setters as unknown as Record<string, ((...args: never[]) => void) | undefined>;
  const stringBindings: RuntimeHydrationBindings['stringBindings'] = [];
  const numberBindings: RuntimeHydrationBindings['numberBindings'] = [];
  const booleanBindings: RuntimeHydrationBindings['booleanBindings'] = [];

  for (const entry of RUNTIME_SETTINGS_REGISTRY) {
    const setterName = `set${capitalize(entry.key)}`;
    const setter = setterMap[setterName];
    if (!setter) continue;

    const allowEmpty = REGISTRY_ALLOW_EMPTY.has(entry.key);

    // WHY: Route to correct binding type based on registry type metadata.
    switch (entry.type) {
      case 'bool':
        booleanBindings.push({ key: entry.key, apply: setter as (v: boolean) => void });
        break;
      case 'int':
      case 'float':
        // WHY: Number setters receive String(value) because the draft stores
        // numeric inputs as strings for controlled input behavior.
        numberBindings.push({
          key: entry.key,
          apply: ((v: number) => (setter as (v: string) => void)(String(v))) as (v: number) => void,
        });
        break;
      default:
        stringBindings.push({
          key: entry.key,
          allowEmpty,
          apply: setter as (v: string) => void,
        });
    }

    // WHY: Legacy alias bindings — when old key names appear in snapshot data,
    // route them to the canonical setter. Derived from registry aliases field.
    if (entry.aliases) {
      for (const alias of entry.aliases) {
        switch (entry.type) {
          case 'bool':
            booleanBindings.push({ key: alias, apply: setter as (v: boolean) => void });
            break;
          case 'int':
          case 'float':
            numberBindings.push({
              key: alias,
              apply: ((v: number) => (setter as (v: string) => void)(String(v))) as (v: number) => void,
            });
            break;
          default:
            stringBindings.push({
              key: alias,
              allowEmpty,
              apply: setter as (v: string) => void,
            });
        }
      }
    }
  }

  return { stringBindings, numberBindings, booleanBindings };
}

export function hydrateRuntimeSettingsFromBindings(
  source: RuntimeSettings | Record<string, unknown> | undefined,
  dirty: boolean,
  bindings: RuntimeHydrationBindings,
): boolean {
  if (!hasSnapshotData(source) || dirty) return false;
  for (const binding of bindings.stringBindings) {
    const value = source[binding.key];
    if (typeof value !== 'string') continue;
    if (!binding.allowEmpty && !value) continue;
    binding.apply(value);
  }
  for (const binding of bindings.numberBindings) {
    const value = source[binding.key];
    if (typeof value !== 'number') continue;
    binding.apply(value);
  }
  for (const binding of bindings.booleanBindings) {
    const value = source[binding.key];
    if (typeof value !== 'boolean') continue;
    binding.apply(value);
  }
  return true;
}
