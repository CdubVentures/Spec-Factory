// Pure reset-scope helpers for per-finder module settings sections
// (module-cef, module-pif, module-rdf, module-skf, module-kf).

import {
  FINDER_IDS_WITH_SETTINGS,
  FINDER_SETTINGS_REGISTRY,
  type FinderIdWithSettings,
  type FinderSettingsEntry,
} from './finderSettingsRegistry.generated.ts';
import { MODULE_SETTINGS_SECTIONS } from './moduleSettingsSections.generated.ts';

/**
 * Resolves a pipeline section id like "module-cef" to its backing
 * FinderIdWithSettings ("colorEditionFinder"), or null when the section
 * has no registered finder settings.
 */
export function findModuleIdForSection(sectionId: string): FinderIdWithSettings | null {
  const section = MODULE_SETTINGS_SECTIONS.find((s) => s.id === sectionId);
  if (!section) return null;
  const moduleId = section.moduleId;
  return (FINDER_IDS_WITH_SETTINGS as readonly string[]).includes(moduleId)
    ? (moduleId as FinderIdWithSettings)
    : null;
}

/**
 * Stringifies a finder settings entry's default value. Mirrors the
 * FinderSettingsRenderer rendering path so reset payloads match what the
 * renderer would emit when the user edits a field.
 */
export function stringifyFinderSettingDefault(entry: FinderSettingsEntry): string {
  if (entry.type === 'bool') return entry.default ? 'true' : 'false';
  if (entry.type === 'intMap' && entry.keys && entry.default && typeof entry.default === 'object') {
    const ordered: Record<string, number> = {};
    const def = entry.default as Record<string, number>;
    for (const k of entry.keys) ordered[k] = def[k] ?? 0;
    return JSON.stringify(ordered);
  }
  return String(entry.default);
}

/**
 * Builds a per-category settings payload containing defaults for every
 * visible entry in the finder's schema. Hidden entries (prompt templates,
 * etc.) are excluded.
 */
export function buildModuleSettingsResetPayload(finderId: FinderIdWithSettings): Record<string, string> {
  const schema = FINDER_SETTINGS_REGISTRY[finderId];
  const payload: Record<string, string> = {};
  for (const entry of schema) {
    if (entry.hidden) continue;
    payload[entry.key] = stringifyFinderSettingDefault(entry);
  }
  return payload;
}

/**
 * Batch reset-payload builder: returns one entry per finder in
 * FINDER_IDS_WITH_SETTINGS. Used by "Reset all" on Pipeline Settings to
 * fan out per-finder PUTs for the current category. New finders added to
 * the generated registry flow through automatically.
 */
export function buildAllModuleSettingsResetPayloads(): Array<{
  readonly moduleId: FinderIdWithSettings;
  readonly settings: Record<string, string>;
}> {
  return FINDER_IDS_WITH_SETTINGS.map((moduleId) => ({
    moduleId,
    settings: buildModuleSettingsResetPayload(moduleId),
  }));
}
