// WHY: O(1) Feature Scaling — normalizer is registry-driven. Adding a new
// setting to settingsRegistry.js auto-normalizes it here. Zero per-field code.

import {
  type RuntimeSettingDefaults,
  type SearxngEngine,
} from '../../../stores/settingsManifest';
import {
  RUNTIME_SETTINGS_REGISTRY,
  REGISTRY_BOUNDS,
  REGISTRY_ENUM_MAP,
  REGISTRY_ALLOW_EMPTY,
  type RegistryEntry,
} from '../../../shared/registryDerivedSettingsMaps';
import { type RuntimeSettings } from './runtimeSettingsAuthority';
import { parseRuntimeLlmTokenCap } from './runtimeSettingsDomain';
import {
  SEARXNG_ENGINE_OPTIONS,
  type RuntimeDraft,
} from './RuntimeFlowDraftContracts';

// --- Parse helpers (unchanged from original) ---

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true' || value === 'yes' || value === 'on') return true;
  if (value === 0 || value === '0' || value === 'false' || value === 'no' || value === 'off') return false;
  return fallback;
}

function parseNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBoundedNumber(
  value: unknown,
  fallback: number,
  bounds: { min: number; max: number; int?: boolean },
): number {
  const parsed = Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(parsed)) return fallback;
  const clamped = Math.min(bounds.max, Math.max(bounds.min, parsed));
  return bounds.int ? Math.round(clamped) : clamped;
}

function parseString(value: unknown, fallback: string, allowEmpty = false): string {
  if (typeof value !== 'string') return fallback;
  if (allowEmpty) return value;
  const token = value.trim();
  return token || fallback;
}

function parseEnum(
  value: unknown,
  options: readonly string[],
  fallback: string,
): string {
  const token = String(value || '').trim();
  if (!token) return fallback;
  return options.includes(token) ? token : fallback;
}

// --- csv_enum special: legacy migration for searchEngines ---

const LEGACY_MIGRATION_MAP: Record<string, string> = {
  dual: 'bing,google',
  google: 'google',
  bing: 'bing',
  searxng: 'bing,google-proxy,duckduckgo',
  none: '',
};

function parseSearchEngines(value: unknown, fallback: string): string {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  if (raw in LEGACY_MIGRATION_MAP) return LEGACY_MIGRATION_MAP[raw];
  const tokens = raw.split(',').map(t => t.trim()).filter(Boolean);
  const seen = new Set<string>();
  const valid: string[] = [];
  for (const token of tokens) {
    if ((SEARXNG_ENGINE_OPTIONS as readonly string[]).includes(token) && !seen.has(token)) {
      seen.add(token);
      valid.push(token);
    }
  }
  return valid.length > 0 ? valid.join(',') : fallback;
}

// --- Alias resolution: check entry.key then entry.aliases ---

function resolveRawValue(
  raw: Record<string, unknown>,
  entry: RegistryEntry,
): unknown {
  const value = raw[entry.key];
  if (value !== undefined && value !== null) return value;
  if (entry.aliases) {
    for (const alias of entry.aliases) {
      const aliasValue = raw[alias];
      if (aliasValue !== undefined && aliasValue !== null) return aliasValue;
    }
  }
  return undefined;
}

// --- Generic type dispatch ---

function normalizeEntry(
  raw: Record<string, unknown>,
  fallback: Record<string, unknown>,
  entry: RegistryEntry,
): unknown {
  const rawValue = resolveRawValue(raw, entry);
  const fb = fallback[entry.key];

  switch (entry.type) {
    case 'int':
    case 'float': {
      if (entry.tokenClamped) {
        return parseRuntimeLlmTokenCap(rawValue) || fb;
      }
      const bounds = REGISTRY_BOUNDS[entry.key];
      if (bounds) return parseBoundedNumber(rawValue, fb as number, bounds);
      return parseNumber(rawValue, fb as number);
    }
    case 'bool':
      return parseBoolean(rawValue, fb as boolean);
    case 'enum':
      return parseEnum(
        rawValue,
        REGISTRY_ENUM_MAP[entry.key] ?? [],
        fb as string,
      );
    case 'csv_enum':
      return parseSearchEngines(rawValue, fb as string);
    case 'string':
      return parseString(rawValue, fb as string, REGISTRY_ALLOW_EMPTY.has(entry.key));
    default:
      return fb;
  }
}

// --- Entries to skip (not part of RuntimeDraft) ---
const SKIP_KEYS = new Set(['runtimeAutoSaveEnabled']);

export function normalizeRuntimeDraft(
  source: RuntimeSettings | undefined,
  fallback: RuntimeSettingDefaults,
): RuntimeDraft {
  const raw = (source || {}) as Record<string, unknown>;
  const fb = fallback as unknown as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const entry of RUNTIME_SETTINGS_REGISTRY) {
    if (SKIP_KEYS.has(entry.key)) continue;
    result[entry.key] = normalizeEntry(raw, fb, entry);
  }

  return result as unknown as RuntimeDraft;
}
