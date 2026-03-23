// WHY: O(1) Feature Scaling — bounds, enums, and draft type derived from registry SSOT.
// Adding a setting with min/max to the registry auto-populates RUNTIME_NUMBER_BOUNDS.
// No manual entries needed here.

import {
  REGISTRY_BOUNDS,
  REGISTRY_ENUM_MAP,
  type NumberBound,
} from '../../../shared/registryDerivedSettingsMaps';
import {
  type RuntimeSettingDefaults,
  type RuntimeResumeMode,
  type RuntimeOcrBackend,
  type RuntimeRepairDedupeRule,
} from '../../../stores/settingsManifest';

// WHY: Re-export registry-derived bounds as the canonical GUI bounds map.
// Previously 104 hand-typed entries; now auto-derived from settingsRegistry.js.
export const RUNTIME_NUMBER_BOUNDS = REGISTRY_BOUNDS;

// WHY: Enum options derived from registry allowed[] arrays.
// Previously 4 hand-typed arrays; now auto-derived. Cast to specific union
// types so downstream consumers (sections, normalizer) get type safety.
export const SEARXNG_ENGINE_OPTIONS = (REGISTRY_ENUM_MAP.searchEngines ?? []) as readonly string[];
export const OCR_BACKEND_OPTIONS = (REGISTRY_ENUM_MAP.scannedPdfOcrBackend ?? []) as readonly RuntimeOcrBackend[];
export const RESUME_MODE_OPTIONS = (REGISTRY_ENUM_MAP.resumeMode ?? []) as readonly RuntimeResumeMode[];
export const REPAIR_DEDUPE_RULE_OPTIONS = (REGISTRY_ENUM_MAP.repairDedupeRule ?? []) as readonly RuntimeRepairDedupeRule[];

export type { NumberBound };
// WHY: Pick<> preserves mapped-type index compatibility that downstream
// consumers rely on (e.g., `as Record<string, unknown>` casts).
export type RuntimeDraft = Pick<RuntimeSettingDefaults, keyof RuntimeSettingDefaults>;

export function toRuntimeDraft(defaults: RuntimeSettingDefaults): RuntimeDraft {
  return defaults;
}

export function runtimeDraftEqual(a: RuntimeDraft, b: RuntimeDraft) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function normalizeToken(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

export function parseBoundedNumber(value: unknown, fallback: number, bounds: NumberBound): number {
  const parsed = Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(parsed)) return fallback;
  const clamped = Math.min(bounds.max, Math.max(bounds.min, parsed));
  return bounds.int ? Math.round(clamped) : clamped;
}
