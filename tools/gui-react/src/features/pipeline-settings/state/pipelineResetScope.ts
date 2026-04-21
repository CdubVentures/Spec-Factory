// Pure reset-scope builders for Pipeline Settings panels. Separated from the
// page so the dispatch can be tested without React.

import { SETTINGS_BY_CATEGORY } from './settingsCategoryMaps.ts';
import { SETTINGS_CATEGORY_KEYS, type SettingsCategoryId } from './SettingsCategoryRegistry.ts';

/**
 * Returns the flat setting keys owned by a given pipeline section. Only
 * sections that map to a category in SETTINGS_BY_CATEGORY are supported —
 * custom sections (source-strategy, deterministic-strategy, per-finder
 * modules) are not resettable via this path and should handle reset inside
 * their own authorities.
 */
export function collectPipelineSectionKeys(sectionId: string): string[] {
  if (!(SETTINGS_CATEGORY_KEYS as readonly string[]).includes(sectionId)) return [];
  const categoryMap = SETTINGS_BY_CATEGORY[sectionId as SettingsCategoryId];
  if (!categoryMap) return [];
  const keys = new Set<string>();
  for (const entries of Object.values(categoryMap)) {
    for (const entry of entries) keys.add(entry.key);
  }
  return [...keys];
}

/**
 * Returns true if the pipeline section has resettable flat keys. Drives
 * the "Reset panel" button visibility.
 */
export function isPipelineSectionResettable(sectionId: string): boolean {
  return collectPipelineSectionKeys(sectionId).length > 0;
}

/**
 * Builds a partial runtime-settings payload that, when applied, resets only
 * the keys owned by the given section to their manifest defaults.
 */
export function buildPipelineSectionResetPayload(
  sectionId: string,
  manifestDefaults: Record<string, unknown>,
): Record<string, unknown> {
  const keys = collectPipelineSectionKeys(sectionId);
  const payload: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in manifestDefaults) payload[key] = manifestDefaults[key];
  }
  return payload;
}
