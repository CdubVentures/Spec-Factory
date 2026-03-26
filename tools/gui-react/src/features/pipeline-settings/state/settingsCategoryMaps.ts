// WHY: Derive settings-by-category and settings-by-section from the backend registry SSOT.
// A new setting with uiCategory + uiSection auto-appears in the correct UI panel.
// Adding uiGroup to a registry entry auto-groups it in a collapsible block.
// No per-setting .tsx code needed.

import { RUNTIME_SETTINGS_REGISTRY, type RegistryEntry } from '../../../shared/registryDerivedSettingsMaps.ts';
import type { SettingsCategoryId } from './SettingsCategoryRegistry.ts';

export interface CategorySettingsMap {
  [sectionId: string]: RegistryEntry[];
}

/* ── Per-entry indexing ────────────────────────────────────────────── */

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

/* ── Group rendering hints ─────────────────────────────────────────── */
// WHY: Controls display order and default collapsed state for uiGroup blocks.
// Groups not listed here render expanded at the end (order 999).

interface GroupHint {
  readonly order: number;
  readonly collapsed?: boolean;
}

const UI_GROUP_HINTS: Readonly<Record<string, GroupHint>> = Object.freeze({
  // Search Execution
  'Engine Selection':   { order: 0 },
  'Google Search':      { order: 1, collapsed: true },
  'Serper':             { order: 2, collapsed: true },
  'SearXNG':            { order: 3, collapsed: true },
  'Brave Search':       { order: 4, collapsed: true },
  'Loop Control':       { order: 5 },
  // Search Profile
  'Query Caps':         { order: 0 },
  'Synonyms & Aliases': { order: 1 },
  // Fetch Plugins — per-plugin detail groups
  'Consent Settings':   { order: 0 },
  'Scroll Settings':    { order: 0 },
  'Expansion Settings': { order: 0 },
  'Video Recording':    { order: 0 },
  // Browser & Crawlee
  'Crawlee Internals':  { order: 0, collapsed: true },
  // Observability
  'Trace':              { order: 0 },
  'Screencast':         { order: 1 },
  'Events':             { order: 2 },
  // Network — Bypass Detection removed (knobs retired)
  // Extraction — Provider
  'API Keys':           { order: 0 },
  'Plan Provider':      { order: 1 },
  // Extraction — Screenshots
  'Capture Settings':   { order: 0 },
  // Extraction — Models (hidden token defaults stripped from UI — per-phase now)
  'Plan Phase':         { order: 0 },
  'Reasoning Phase':    { order: 1 },
  // Extraction — Limits
  'Token Costs':        { order: 0 },
  'Advanced Config':    { order: 1, collapsed: true },
  // Global — Output
  'Paths':              { order: 0 },
  'Runtime Output':     { order: 1 },
});

/* ── Grouped section data ──────────────────────────────────────────── */

export interface SettingGroup {
  readonly label: string;
  readonly entries: RegistryEntry[];
  readonly collapsed: boolean;
}

export interface GroupedSectionSettings {
  readonly heroes: RegistryEntry[];
  readonly groups: SettingGroup[];
}

/** Derive grouped settings for a section: heroes + named collapsible groups */
export function getGroupedSettingsForSection(
  categoryId: SettingsCategoryId,
  sectionId: string,
): GroupedSectionSettings {
  const entries = getSettingsForSection(categoryId, sectionId);
  const heroes = entries.filter(isHeroSetting);
  const regular = entries.filter((e) => !isHeroSetting(e));

  const groupMap = new Map<string, RegistryEntry[]>();
  const ungrouped: RegistryEntry[] = [];

  for (const entry of regular) {
    const g = (entry as unknown as Record<string, unknown>).uiGroup as string | undefined;
    if (g) {
      let list = groupMap.get(g);
      if (!list) { list = []; groupMap.set(g, list); }
      list.push(entry);
    } else {
      ungrouped.push(entry);
    }
  }

  const groups: SettingGroup[] = [...groupMap.entries()]
    .map(([label, items]) => ({
      label,
      entries: items,
      collapsed: UI_GROUP_HINTS[label]?.collapsed ?? false,
    }))
    .sort((a, b) =>
      (UI_GROUP_HINTS[a.label]?.order ?? 999) - (UI_GROUP_HINTS[b.label]?.order ?? 999),
    );

  // Ungrouped regular entries render in a plain block at the end
  if (ungrouped.length > 0) {
    groups.push({ label: sectionId, entries: ungrouped, collapsed: false });
  }

  return { heroes, groups };
}
