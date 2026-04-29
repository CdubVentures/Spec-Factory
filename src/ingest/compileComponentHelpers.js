import {
  toArray,
  isObject,
  normalizeText,
  normalizeToken,
  normalizeFieldKey,
  isNumericContractType,
  isComponentPropertyType,
  titleFromKey,
} from './compileUtils.js';
import { EG_LOCKED_KEYS as EG_LOCKED_KEYS_LIST } from '../features/studio/contracts/egPresets.js';

export function buildPropertyConstraintsFromMap(map, fieldKey) {
  const meta = resolveComponentPropertyMetaFromMap(map, fieldKey);
  if (!meta) {
    return [];
  }
  return meta.constraints;
}

export function resolveComponentPropertyMetaFromMap(map, fieldKey) {
  const normalizedFieldKey = normalizeFieldKey(fieldKey);
  if (!normalizedFieldKey) {
    return null;
  }
  const numericOnlyPolicies = new Set(['upper_bound', 'lower_bound', 'range']);
  const sources = toArray(map?.component_sources);
  for (const row of sources) {
    if (!isObject(row)) continue;
    const rolesBlock = isObject(row.roles) ? row.roles : {};
    for (const entry of toArray(rolesBlock.properties)) {
      if (!isObject(entry)) continue;
      const entryKey = normalizeFieldKey(entry.field_key || '');
      if (entryKey !== normalizedFieldKey) {
        continue;
      }
      const entryTypeToken = normalizeToken(entry.type);
      const type = isComponentPropertyType(entryTypeToken)
        ? entryTypeToken
        : 'string';
      const rawPolicy = normalizeToken(entry.variance_policy || 'authoritative') || 'authoritative';
      const variancePolicy = !isNumericContractType(type) && numericOnlyPolicies.has(rawPolicy)
        ? 'authoritative'
        : rawPolicy;
      return {
        type,
        unit: normalizeText(entry.unit || ''),
        variance_policy: variancePolicy,
        constraints: Array.isArray(entry.constraints) ? entry.constraints.filter(Boolean) : [],
      }
    }
  }
  return null;
}

export function applyKeyLevelConstraintsToEntities(componentDb, fieldsRuntime) {
  for (const rows of Object.values(componentDb)) {
    for (const entity of toArray(rows)) {
      if (!isObject(entity?.properties)) continue;
      for (const propKey of Object.keys(entity.properties)) {
        const fieldDef = fieldsRuntime[propKey];
        if (!isObject(fieldDef)) continue;
        const keyConstraints = Array.isArray(fieldDef.constraints) ? fieldDef.constraints.filter(Boolean) : [];
        if (keyConstraints.length === 0) continue;
        if (!entity.__constraints) entity.__constraints = {};
        entity.__constraints[propKey] = keyConstraints;
      }
    }
  }
}

export function buildComponentSourceSummary({
  map,
  componentDb,
  sourceStats,
  fieldsRuntime
} = {}) {
  const fr = isObject(fieldsRuntime) ? fieldsRuntime : {};
  const out = {};
  const sourceRows = toArray(map?.component_sources);
  for (const row of sourceRows) {
    if (!isObject(row)) {
      continue;
    }
    const componentType = normalizeFieldKey(row.component_type || '');
    if (!componentType) {
      continue;
    }
    const rolesBlock = isObject(row.roles) ? row.roles : {};
    const propertyMappings = toArray(rolesBlock.properties)
      .filter((entry) => isObject(entry))
      .map((entry) => {
        const fieldKey = normalizeFieldKey(entry.field_key || '');
        const resolvedKey = fieldKey;
        const keyLevelConstraints = Array.isArray(fr[resolvedKey]?.constraints) ? fr[resolvedKey].constraints.filter(Boolean) : null;
        const mapConstraints = Array.isArray(entry.constraints) ? entry.constraints.map((c) => normalizeText(c)) : [];
        const out = {
          key: resolvedKey,
          type: isComponentPropertyType(entry.type) ? normalizeToken(entry.type) : 'string',
          unit: normalizeText(entry.unit || ''),
          field_key: fieldKey || undefined,
          variance_policy: normalizeToken(entry.variance_policy || 'authoritative'),
          constraints: keyLevelConstraints !== null ? keyLevelConstraints : mapConstraints
        };
        if (entry.component_only === true) out.component_only = true;
        const tolerance = entry.tolerance != null ? Number(entry.tolerance) : null;
        if (Number.isFinite(tolerance)) out.tolerance = tolerance;
        return out;
      })
      .filter((entry) => entry.field_key);
    const entries = toArray(componentDb?.[componentType]);
    const sampleEntities = entries
      .map((rowValue) => normalizeText(rowValue?.name || rowValue?.canonical_name || ''))
      .filter(Boolean)
      .slice(0, 10);

    out[componentType] = {
      type: componentType,
      roles: {
        properties: propertyMappings
      },
      entity_count: entries.length,
      sample_entities: sampleEntities
    };
  }
  return out;
}

export function declaredComponentTypesFromMap(map = {}) {
  const rows = toArray(map?.component_sources);
  return new Set(
    rows
      .map((row) => normalizeFieldKey(row?.component_type || ''))
      .filter(Boolean)
  );
}

export function declaredComponentPropertyKeysFromMap(map = {}) {
  const rows = toArray(map?.component_sources);
  const out = new Set();
  for (const row of rows) {
    if (!isObject(row)) {
      continue;
    }
    const roles = isObject(row.roles) ? row.roles : {};
    for (const prop of toArray(roles.properties)) {
      if (!isObject(prop)) {
        continue;
      }
      // WHY: component_only properties stay scoped to the component DB. They
      // must NOT enter componentPropertyKeySet — that's the gate that lets
      // properties promote into product-level field_rules + ui_field_catalog.
      // EG-locked keys (colors/editions/release_date) override this — they are
      // variant generators that must always be product fields regardless.
      if (prop.component_only === true && !EG_LOCKED_KEYS.has(normalizeFieldKey(prop.field_key || ''))) {
        continue;
      }
      const key = normalizeFieldKey(prop.field_key || '');
      if (key) {
        out.add(key);
      }
    }
  }
  return out;
}

export const COMPONENT_IDENTITY_PROJECTION_SPECS = Object.freeze({
  brand: Object.freeze({
    suffix: 'brand',
    facet: 'brand',
    type: 'string',
    enum_policy: 'open_prefer_known',
  }),
  link: Object.freeze({
    suffix: 'link',
    facet: 'link',
    type: 'url',
    enum_policy: 'open',
  }),
});

export function componentIdentityProjectionKey(componentType = '', facet = '') {
  const type = normalizeFieldKey(componentType);
  const spec = COMPONENT_IDENTITY_PROJECTION_SPECS[normalizeToken(facet)];
  return type && spec ? `${type}_${spec.suffix}` : '';
}

export function declaredComponentIdentityProjectionKeysFromMap(map = {}) {
  const out = new Set();
  for (const componentType of declaredComponentTypesFromMap(map)) {
    for (const spec of Object.values(COMPONENT_IDENTITY_PROJECTION_SPECS)) {
      const key = componentIdentityProjectionKey(componentType, spec.facet);
      if (key) out.add(key);
    }
  }
  return out;
}

export function resolveComponentIdentityProjectionMetaFromMap(map = {}, fieldKey = '') {
  const key = normalizeFieldKey(fieldKey);
  if (!key) {
    return null;
  }
  for (const componentType of declaredComponentTypesFromMap(map)) {
    for (const spec of Object.values(COMPONENT_IDENTITY_PROJECTION_SPECS)) {
      if (key !== componentIdentityProjectionKey(componentType, spec.facet)) {
        continue;
      }
      return {
        component_type: componentType,
        facet: spec.facet,
        type: spec.type,
        enum_policy: spec.enum_policy,
        label: `${titleFromKey(componentType)} ${titleFromKey(spec.suffix)}`,
        group: `${titleFromKey(componentType)} Identity`,
      };
    }
  }
  return null;
}

// WHY: Variant-generator keys must always promote to product fields even if
// authors mistakenly mark them component_only.
const EG_LOCKED_KEYS = new Set(EG_LOCKED_KEYS_LIST);

export function inferComponentTypeForField(fieldKey = '', componentTypes = new Set()) {
  const keyToken = normalizeFieldKey(fieldKey);
  if (!keyToken) return '';
  for (const typeToken of componentTypes) {
    const normalizedType = normalizeFieldKey(typeToken);
    if (!normalizedType) continue;
    const singularType = normalizedType.endsWith('s') ? normalizedType.slice(0, -1) : normalizedType;
    if (keyToken === normalizedType || keyToken === singularType) {
      return normalizedType;
    }
  }
  return '';
}
