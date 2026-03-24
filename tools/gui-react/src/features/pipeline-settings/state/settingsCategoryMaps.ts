// WHY: Derive settings-by-category and settings-by-section from the backend registry SSOT.
// A new setting with uiCategory + uiSection auto-appears in the correct UI panel.
// No per-setting .tsx code needed.

import { RUNTIME_SETTINGS_REGISTRY, type RegistryEntry } from '../../../shared/registryDerivedSettingsMaps';
import type { SettingsCategoryId } from './SettingsCategoryRegistry';

export interface CategorySettingsMap {
  [sectionId: string]: RegistryEntry[];
}

const _byCategory: Record<string, CategorySettingsMap> = {};
const _disabledBy: Record<string, string> = {};

for (const entry of RUNTIME_SETTINGS_REGISTRY) {
  if (!entry.uiCategory) continue;
  if (!_byCategory[entry.uiCategory]) _byCategory[entry.uiCategory] = {};
  const section = entry.uiSection || '_default';
  if (!_byCategory[entry.uiCategory][section]) _byCategory[entry.uiCategory][section] = [];
  _byCategory[entry.uiCategory][section].push(entry);

  if (entry.disabledBy) _disabledBy[entry.key] = entry.disabledBy;
}

// Sort entries within each section by uiOrder
for (const cat of Object.values(_byCategory)) {
  for (const entries of Object.values(cat)) {
    entries.sort((a, b) => (a.uiOrder ?? 999) - (b.uiOrder ?? 999));
  }
}

/** Settings grouped by category → section → sorted entries */
export const SETTINGS_BY_CATEGORY: Readonly<Record<SettingsCategoryId, CategorySettingsMap>> =
  _byCategory as Record<SettingsCategoryId, CategorySettingsMap>;

/** Map of setting key → parent key that gates it (disabledBy) */
export const DISABLED_BY_MAP: Readonly<Record<string, string>> = Object.freeze(_disabledBy);

/** Get all settings for a specific category + section */
export function getSettingsForSection(categoryId: SettingsCategoryId, sectionId: string): RegistryEntry[] {
  return SETTINGS_BY_CATEGORY[categoryId]?.[sectionId] ?? [];
}

/** Check if a setting is a hero (MasterSwitchRow) */
export function isHeroSetting(entry: RegistryEntry): boolean {
  return Boolean(entry.uiHero);
}

/** Get the disabledBy parent key for a setting, if any */
export function getDisabledByKey(settingKey: string): string | undefined {
  return DISABLED_BY_MAP[settingKey];
}
