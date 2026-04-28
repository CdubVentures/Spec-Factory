import {
  FINDER_IDS_WITH_SETTINGS,
  FINDER_SETTINGS_REGISTRY,
  type FinderIdWithSettings,
  type FinderSettingsEntry,
} from './finderSettingsRegistry.generated.ts';
import {
  MODULE_SETTINGS_SCOPE_BY_ID,
  type ModuleSettingsScope,
} from './moduleSettingsSections.generated.ts';

export type FinderSettingsEntryScope = ModuleSettingsScope;

export interface FinderSettingsEntryScopeOption {
  readonly scope: FinderSettingsEntryScope;
  readonly label: string;
  readonly subtitle: string;
}

const SCOPE_ORDER: readonly FinderSettingsEntryScope[] = ['global', 'category'];

const SCOPE_COPY: Record<FinderSettingsEntryScope, Omit<FinderSettingsEntryScopeOption, 'scope'>> = {
  global: {
    label: 'Global',
    subtitle: 'Shared setup across all categories',
  },
  category: {
    label: 'Per Category',
    subtitle: 'View contracts for the selected category',
  },
};

function isFinderIdWithSettings(id: string): id is FinderIdWithSettings {
  return (FINDER_IDS_WITH_SETTINGS as readonly string[]).includes(id);
}

function resolveModuleScope(finderId: string): ModuleSettingsScope {
  return isFinderIdWithSettings(finderId) ? MODULE_SETTINGS_SCOPE_BY_ID[finderId] : 'category';
}

export function resolveFinderSettingsEntryScope(
  finderId: string,
  entry: Pick<FinderSettingsEntry, 'scope'>,
): FinderSettingsEntryScope {
  return entry.scope ?? resolveModuleScope(finderId);
}

export function filterFinderSettingsByEntryScope(
  finderId: string,
  entryScope: FinderSettingsEntryScope,
): readonly FinderSettingsEntry[] {
  if (!isFinderIdWithSettings(finderId)) return [];
  return FINDER_SETTINGS_REGISTRY[finderId].filter(
    (entry) => resolveFinderSettingsEntryScope(finderId, entry) === entryScope,
  );
}

export function getFinderSettingsEntryScopeOptions(finderId: string): readonly FinderSettingsEntryScopeOption[] {
  if (!isFinderIdWithSettings(finderId)) return [];
  const present = new Set(
    FINDER_SETTINGS_REGISTRY[finderId].map((entry) => resolveFinderSettingsEntryScope(finderId, entry)),
  );
  return SCOPE_ORDER
    .filter((scope) => present.has(scope))
    .map((scope) => ({
      scope,
      ...SCOPE_COPY[scope],
    }));
}

export function hasMixedFinderSettingsEntryScopes(finderId: string): boolean {
  return getFinderSettingsEntryScopeOptions(finderId).length > 1;
}
