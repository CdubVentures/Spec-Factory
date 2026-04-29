import type {
  ComponentSource,
  ComponentSourceProperty,
  StudioConfig,
} from '../../../types/studio.ts';

export interface StudioPersistSnapshot {
  rules: Record<string, Record<string, unknown>>;
  fieldOrder: string[];
  renames: Record<string, string>;
  egToggles?: Record<string, boolean>;
}

export interface StudioPersistMapOptions {
  baseMap: StudioConfig;
  snapshot: StudioPersistSnapshot;
}

export interface StudioPersistAttemptOptions {
  force: boolean;
  nextFingerprint: string;
  lastSavedFingerprint: string;
  lastAttemptFingerprint: string;
}

export interface StudioMapPayloadAttemptOptions {
  payload: Pick<StudioConfig, 'component_sources' | 'data_lists' | 'enum_lists'>;
  force: boolean;
}

export function stripEditedFlagFromRules(
  ruleMap: Record<string, Record<string, unknown>>,
): Record<string, Record<string, unknown>> {
  const cleaned: Record<string, Record<string, unknown>> = {};
  for (const [key, rule] of Object.entries(ruleMap || {})) {
    const nextRule = { ...(rule || {}) } as Record<string, unknown>;
    delete nextRule._edited;
    cleaned[key] = nextRule;
  }
  return cleaned;
}

export function applyStudioMapRenames(
  inputMap: StudioConfig,
  renames: Record<string, string>,
): StudioConfig {
  const renameMap = renames || {};
  const renameKey = (value: string) => renameMap[value] || value;
  const nextMap: StudioConfig = { ...inputMap };

  if (Array.isArray(nextMap.selected_keys)) {
    nextMap.selected_keys = nextMap.selected_keys.map((key) =>
      renameKey(String(key || '')),
    );
  }

  if (nextMap.field_overrides && typeof nextMap.field_overrides === 'object') {
    const renamedOverrides: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(nextMap.field_overrides)) {
      renamedOverrides[renameKey(key)] = value;
    }
    nextMap.field_overrides = renamedOverrides;
  }

  if (Array.isArray(nextMap.enum_lists)) {
    nextMap.enum_lists = nextMap.enum_lists.map((entry) => {
      if (!entry || typeof entry !== 'object') return entry;
      const field = renameKey(String(entry.field || ''));
      const { normalize: _normalize, ...rest } = entry as Record<string, unknown>;
      return { ...rest, field };
    });
  }

  if (Array.isArray(nextMap.data_lists)) {
    nextMap.data_lists = nextMap.data_lists.map(
      (entry: Record<string, unknown>) => {
        if (!entry || typeof entry !== 'object') return entry;
        const field = renameKey(String(entry.field || ''));
        const { normalize: _normalize, ...rest } = entry;
        return { ...rest, field };
      },
    );
  }

  if (Array.isArray(nextMap.component_sources)) {
    nextMap.component_sources = nextMap.component_sources.map((source) => {
      if (!source || typeof source !== 'object') return source;
      const roles =
        source.roles && typeof source.roles === 'object' ? source.roles : {};
      const properties = Array.isArray(roles.properties)
        ? roles.properties.map((property: ComponentSourceProperty) => {
            if (!property || typeof property !== 'object') return property;
            const fieldKey = renameKey(String(property.field_key || ''));
            return { ...property, field_key: fieldKey };
          })
        : roles.properties;
      return {
        ...source,
        roles: {
          ...roles,
          properties,
        },
      } as ComponentSource;
    });
  }

  if (nextMap.expectations && typeof nextMap.expectations === 'object') {
    const renamedExpectations: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(nextMap.expectations)) {
      renamedExpectations[key] = Array.isArray(value)
        ? value.map((v: unknown) => renameKey(String(v || '')))
        : value;
    }
    nextMap.expectations = renamedExpectations;
  }

  return nextMap;
}

export function buildStudioPersistMap({
  baseMap,
  snapshot,
}: StudioPersistMapOptions): StudioConfig {
  const selectedKeys = snapshot.fieldOrder
    .map((key) => String(key || '').trim())
    .filter((key) => key && !key.startsWith('__grp::'));

  const fieldGroups: string[] = [];
  for (const key of snapshot.fieldOrder) {
    if (key.startsWith('__grp::')) {
      const name = key.slice(7);
      if (name && !fieldGroups.includes(name)) fieldGroups.push(name);
    }
  }

  const selectedKeySet = new Set(selectedKeys);
  const allOverrides = stripEditedFlagFromRules(snapshot.rules);
  const prunedOverrides: Record<string, Record<string, unknown>> = {};
  for (const [key, rule] of Object.entries(allOverrides)) {
    if (selectedKeySet.has(key)) prunedOverrides[key] = rule;
  }

  const withStudioDocs: StudioConfig = {
    ...baseMap,
    selected_keys: selectedKeys,
    field_overrides: prunedOverrides,
    field_groups: fieldGroups,
  };

  // WHY: Merge store's eg_toggles into the persist map so toggle state is saved.
  if (snapshot.egToggles && Object.keys(snapshot.egToggles).length > 0) {
    (withStudioDocs as Record<string, unknown>).eg_toggles = snapshot.egToggles;
  }

  return applyStudioMapRenames(withStudioDocs, snapshot.renames);
}

export function hasStudioMapPayload(
  payload: Pick<StudioConfig, 'component_sources' | 'data_lists' | 'enum_lists'>,
): boolean {
  return [
    payload?.component_sources,
    payload?.data_lists,
    payload?.enum_lists,
  ].some((entries) => Array.isArray(entries) && entries.length > 0);
}

export function shouldPersistStudioMapPayload({
  payload,
}: StudioMapPayloadAttemptOptions): boolean {
  return hasStudioMapPayload(payload);
}

export function shouldFlushStudioMapPayloadOnUnmount(
  payload: Pick<StudioConfig, 'component_sources' | 'data_lists' | 'enum_lists'>,
): boolean {
  return hasStudioMapPayload(payload);
}

export function shouldPersistStudioDocsAttempt({
  force,
  nextFingerprint,
  lastSavedFingerprint,
  lastAttemptFingerprint,
}: StudioPersistAttemptOptions): boolean {
  if (force) return true;
  if (!nextFingerprint) return false;
  if (nextFingerprint === lastSavedFingerprint) return false;
  if (nextFingerprint === lastAttemptFingerprint) return false;
  return true;
}
