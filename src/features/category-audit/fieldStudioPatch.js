import fs from 'node:fs/promises';
import path from 'node:path';

export const FIELD_STUDIO_PATCH_SCHEMA_VERSION = 'field-studio-patch.v1';

const PATCH_FILE_SUFFIX = `.${FIELD_STUDIO_PATCH_SCHEMA_VERSION}.json`;
const OS_DUPLICATE_SUFFIX_RE = /\s+\(\d+\)(?=\.json$)/i;
const VALID_VERDICTS = new Set(['keep', 'minor_revise', 'major_revise', 'schema_decision']);
const TOP_LEVEL_KEYS = new Set([
  'schema_version',
  'category',
  'field_key',
  'navigator_ordinal',
  'verdict',
  'patch',
  'audit',
]);
const PATCH_KEYS = new Set(['data_lists', 'field_overrides', 'component_sources']);
const AUDIT_KEYS = new Set([
  'sources_checked',
  'products_checked',
  'conclusion',
  'adjacent_key_roster_decisions',
  'schema_blocked_component_attributes',
  'open_questions',
]);
const DATA_LIST_PATCH_KEYS = new Set(['field', 'manual_values']);
const COMPONENT_SOURCE_PATCH_KEYS = new Set(['component_type', 'roles']);
const COMPONENT_ROLE_PATCH_KEYS = new Set(['properties']);
const COMPONENT_PROPERTY_PATCH_KEYS = new Set([
  'field_key',
  'type',
  'unit',
  'variance_policy',
  'tolerance',
  'constraints',
  'component_only',
]);
const RETIRED_DATA_LIST_KEYS = new Set([
  'mode',
  'normalize',
  'sheet',
  'value_column',
  'column',
  'delimiter',
  'header_row',
  'row_start',
  'start_row',
  'row_end',
  'end_row',
  'priority',
  'ai_assist',
]);
const RETIRED_COMPONENT_SOURCE_KEYS = new Set([
  'type',
  'mode',
  'sheet',
  'header_row',
  'first_data_row',
  'start_row',
  'row_end',
  'stop_after_blank_primary',
  'stop_after_blank_names',
  'auto_derive_aliases',
  'primary_identifier_column',
  'maker_column',
  'canonical_name_column',
  'name_column',
  'brand_column',
  'alias_columns',
  'link_columns',
  'property_columns',
  'priority',
  'ai_assist',
]);
const RETIRED_COMPONENT_ROLE_KEYS = new Set(['primary_identifier', 'maker', 'aliases', 'links']);
const RETIRED_COMPONENT_PROPERTY_KEYS = new Set(['key', 'property_key', 'column', 'col']);
const AUTO_COMPONENT_IDENTITY_FACETS = new Set(['brand', 'link']);

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function sortedKeys(value) {
  return Object.keys(value || {}).sort((a, b) => a.localeCompare(b));
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value || {}, key);
}

function normalizeFieldKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function isAutoComponentIdentityFacetProperty(componentType = '', fieldKey = '') {
  const type = normalizeFieldKey(componentType);
  const key = normalizeFieldKey(fieldKey);
  if (!type || !key) return false;
  return [...AUTO_COMPONENT_IDENTITY_FACETS].some((facet) => key === `${type}_${facet}`);
}

function assertStrictKeys(value, allowed, label) {
  for (const key of Object.keys(value || {})) {
    if (!allowed.has(key)) {
      throw new Error(`${label}: unknown key "${key}"`);
    }
  }
}

function assertNoTextSentinels(value, pathLabel = '$') {
  if (typeof value === 'string') {
    if (value.trim().toLowerCase() === 'no change') {
      throw new Error(`${pathLabel}: "No change" is not valid in strict JSON patches; omit unchanged paths`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoTextSentinels(entry, `${pathLabel}[${index}]`));
    return;
  }
  if (isObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      assertNoTextSentinels(child, `${pathLabel}.${key}`);
    }
  }
}

export function expectedFieldStudioPatchFileName({ category, fieldKey, navigatorOrdinal = null }) {
  if (!category || !fieldKey) {
    throw new Error('expectedFieldStudioPatchFileName: category and fieldKey are required');
  }
  const ordinal = navigatorOrdinal == null || navigatorOrdinal === ''
    ? ''
    : `${String(Number(navigatorOrdinal)).padStart(2, '0')}-`;
  return `${category}-${ordinal}${fieldKey}${PATCH_FILE_SUFFIX}`;
}

export function parseFieldStudioPatchFileName(fileName) {
  const originalBase = safeSourceFileName(fileName);
  const base = normalizeDuplicatePatchFileName(originalBase);
  if (!base.endsWith(PATCH_FILE_SUFFIX)) {
    throw new Error(`invalid field studio patch filename "${originalBase}"`);
  }
  const stem = base.slice(0, -PATCH_FILE_SUFFIX.length);
  const parts = stem.split('-').filter(Boolean);
  if (parts.length < 2) {
    throw new Error(`invalid field studio patch filename "${originalBase}"`);
  }
  const fieldKey = parts.pop();
  const maybeOrdinal = parts.at(-1);
  const navigatorOrdinal = /^\d+$/.test(maybeOrdinal || '') ? Number(parts.pop()) : null;
  const category = parts.join('-');
  if (!category || !/^[a-z0-9_-]+$/i.test(category) || !/^[a-z0-9_]+$/i.test(fieldKey)) {
    throw new Error(`invalid field studio patch filename "${originalBase}"`);
  }
  return {
    category,
    navigatorOrdinal,
    fieldKey,
  };
}

function validateAuditBlock(audit) {
  if (audit == null) return {};
  if (!isObject(audit)) {
    throw new Error('audit must be an object when provided');
  }
  assertStrictKeys(audit, AUDIT_KEYS, 'audit');
  for (const key of [
    'sources_checked',
    'products_checked',
    'adjacent_key_roster_decisions',
    'schema_blocked_component_attributes',
    'open_questions',
  ]) {
    if (audit[key] != null && !Array.isArray(audit[key])) {
      throw new Error(`audit.${key} must be an array when provided`);
    }
  }
  if (audit.conclusion != null && typeof audit.conclusion !== 'string') {
    throw new Error('audit.conclusion must be a string when provided');
  }
  return audit;
}

function validatePatchBlock(patch, fieldKey) {
  if (!isObject(patch)) {
    throw new Error('patch must be an object');
  }
  assertStrictKeys(patch, PATCH_KEYS, 'patch');

  if (patch.field_overrides != null) {
    if (!isObject(patch.field_overrides)) {
      throw new Error('patch.field_overrides must be an object');
    }
    const keys = sortedKeys(patch.field_overrides);
    if (keys.some((key) => key !== fieldKey)) {
      throw new Error(`patch may only patch field_overrides.${fieldKey}`);
    }
  }

  if (patch.data_lists != null) {
    if (!Array.isArray(patch.data_lists)) {
      throw new Error('patch.data_lists must be an array');
    }
    patch.data_lists.forEach((row, index) => {
      if (!isObject(row)) {
        throw new Error(`patch.data_lists[${index}] must be an object`);
      }
      if (row.field !== fieldKey) {
        throw new Error(`patch.data_lists[${index}].field must equal ${fieldKey}`);
      }
      for (const key of Object.keys(row)) {
        if (RETIRED_DATA_LIST_KEYS.has(key)) {
          throw new Error(`patch.data_lists[${index}].${key} is retired; use field and manual_values only`);
        }
        if (!DATA_LIST_PATCH_KEYS.has(key)) {
          throw new Error(`patch.data_lists[${index}].${key} is not allowed; use field and manual_values only`);
        }
      }
    });
  }

  if (patch.component_sources != null) {
    if (!Array.isArray(patch.component_sources)) {
      throw new Error('patch.component_sources must be an array');
    }
    patch.component_sources.forEach((row, index) => {
      if (!isObject(row)) {
        throw new Error(`patch.component_sources[${index}] must be an object`);
      }
      for (const key of Object.keys(row)) {
        if (RETIRED_COMPONENT_SOURCE_KEYS.has(key)) {
          throw new Error(`patch.component_sources[${index}].${key} is retired; use component_type and roles.properties[] only`);
        }
        if (!COMPONENT_SOURCE_PATCH_KEYS.has(key)) {
          throw new Error(`patch.component_sources[${index}].${key} is not allowed; use component_type and roles.properties[] only`);
        }
      }
      const componentType = row.component_type;
      if (!componentType) {
        throw new Error(`patch.component_sources[${index}] must include component_type`);
      }
      const roles = isObject(row.roles) ? row.roles : {};
      for (const key of Object.keys(roles)) {
        if (RETIRED_COMPONENT_ROLE_KEYS.has(key)) {
          throw new Error(`patch.component_sources[${index}].roles.${key} is retired; roles may only carry properties`);
        }
        if (!COMPONENT_ROLE_PATCH_KEYS.has(key)) {
          throw new Error(`patch.component_sources[${index}].roles.${key} is not allowed; roles may only carry properties`);
        }
      }
      const properties = Array.isArray(roles.properties) ? roles.properties : [];
      properties.forEach((prop, propIndex) => {
        if (!isObject(prop)) return;
        for (const key of Object.keys(prop)) {
          if (RETIRED_COMPONENT_PROPERTY_KEYS.has(key)) {
            throw new Error(`patch.component_sources[${index}].roles.properties[${propIndex}].${key} is retired; use field_key`);
          }
          if (!COMPONENT_PROPERTY_PATCH_KEYS.has(key)) {
            throw new Error(`patch.component_sources[${index}].roles.properties[${propIndex}].${key} is not allowed; use field_key, type, unit, variance_policy, tolerance, constraints, and component_only only`);
          }
        }
      });
      if (componentType === fieldKey) return;
      const touchesField = properties.some((prop) => prop?.field_key === fieldKey);
      if (!touchesField) {
        throw new Error(`patch.component_sources[${index}] must identify ${fieldKey} as a component property`);
      }
    });
  }

  return patch;
}

function stripPatchMetadata(patchDoc) {
  if (!isObject(patchDoc)) return patchDoc;
  const { source_file, source_path, ...doc } = patchDoc;
  return doc;
}

function safeSourceFileName(fileName) {
  const base = path.basename(String(fileName || ''));
  if (!base) {
    throw new Error('fileName is required');
  }
  return base;
}

function normalizeDuplicatePatchFileName(fileName) {
  return safeSourceFileName(fileName).replace(OS_DUPLICATE_SUFFIX_RE, '');
}

export function validateFieldStudioPatchDocument(doc, { category = null, fileName = null } = {}) {
  if (!isObject(doc)) {
    throw new Error('Field Studio patch must be a JSON object');
  }
  assertNoTextSentinels(doc);
  assertStrictKeys(doc, TOP_LEVEL_KEYS, 'field_studio_patch');

  if (doc.schema_version !== FIELD_STUDIO_PATCH_SCHEMA_VERSION) {
    throw new Error(`schema_version must be "${FIELD_STUDIO_PATCH_SCHEMA_VERSION}"`);
  }
  if (!doc.category || typeof doc.category !== 'string') {
    throw new Error('category is required');
  }
  if (!doc.field_key || typeof doc.field_key !== 'string') {
    throw new Error('field_key is required');
  }
  if (category && doc.category !== category) {
    throw new Error(`patch category "${doc.category}" does not match requested category "${category}"`);
  }
  if (doc.navigator_ordinal != null && (!Number.isInteger(doc.navigator_ordinal) || doc.navigator_ordinal < 1)) {
    throw new Error('navigator_ordinal must be a positive integer when provided');
  }
  if (!VALID_VERDICTS.has(doc.verdict)) {
    throw new Error(`verdict must be one of ${[...VALID_VERDICTS].join(', ')}`);
  }

  if (fileName) {
    const parsed = parseFieldStudioPatchFileName(fileName);
    if (parsed.category !== doc.category) {
      throw new Error('filename category does not match patch category');
    }
    if (parsed.fieldKey !== doc.field_key) {
      throw new Error('filename field_key does not match patch field_key');
    }
    if (parsed.navigatorOrdinal != null && parsed.navigatorOrdinal !== doc.navigator_ordinal) {
      throw new Error('filename navigator_ordinal does not match patch navigator_ordinal');
    }
  }

  validatePatchBlock(doc.patch, doc.field_key);
  validateAuditBlock(doc.audit);
  return cloneJson(doc);
}

function mergeJson(base, patch) {
  if (patch === null) return null;
  if (Array.isArray(patch)) return cloneJson(patch);
  if (!isObject(patch)) return patch;
  const out = isObject(base) ? cloneJson(base) : {};
  for (const [key, value] of Object.entries(patch)) {
    out[key] = mergeJson(out[key], value);
  }
  return out;
}

function stripRetiredDataListKeys(row) {
  if (!isObject(row)) return row;
  const { normalize: _normalize, ...rest } = row;
  return rest;
}

function componentKey(row) {
  return row?.component_type || '';
}

function propertyKey(row) {
  return row?.field_key || '';
}

function jsonChanged(before, after) {
  return JSON.stringify(before) !== JSON.stringify(after);
}

function pathValue(value, parts) {
  return parts.reduce((current, part) => current?.[part], value);
}

function flattenLeafPaths(value, prefix = []) {
  if (!isObject(value)) return [prefix];
  const keys = Object.keys(value);
  if (keys.length === 0) return [prefix];
  return keys.flatMap((key) => flattenLeafPaths(value[key], [...prefix, key]));
}

function pushChange(changes, seen, change) {
  const key = `${change.kind}:${change.path}`;
  if (seen.has(key)) return;
  seen.add(key);
  changes.push(change);
}

function patchFileSummary(doc) {
  return {
    fileName: doc.source_file || expectedFieldStudioPatchFileName({
      category: doc.category,
      fieldKey: doc.field_key,
      navigatorOrdinal: doc.navigator_ordinal ?? null,
    }),
    fieldKey: doc.field_key,
    navigatorOrdinal: doc.navigator_ordinal ?? null,
    verdict: doc.verdict,
  };
}

function dataListByField(map, fieldKey) {
  const rows = Array.isArray(map?.data_lists) ? map.data_lists : [];
  return rows.find((row) => row?.field === fieldKey);
}

function componentSourceByType(map, type) {
  const rows = Array.isArray(map?.component_sources) ? map.component_sources : [];
  return rows.find((row) => componentKey(row) === type);
}

function componentPropertyByKey(row, fieldKey) {
  const properties = Array.isArray(row?.roles?.properties) ? row.roles.properties : [];
  return properties.find((prop) => propertyKey(prop) === fieldKey);
}

function enumSourceForRule(rule, fieldKey = '') {
  if (!isObject(rule)) return '';
  const explicitSource = typeof rule.enum?.source === 'string'
    ? rule.enum.source
    : (typeof rule.enum_source === 'string' ? rule.enum_source : '');
  if (isObject(rule.enum_source) && rule.enum_source.type === 'component_db') {
    const ref = normalizeFieldKey(rule.enum_source.ref || '');
    return ref ? `component_db.${ref}` : '';
  }
  if (explicitSource.startsWith('component_db.')) return explicitSource;
  const normalizedFieldKey = normalizeFieldKey(fieldKey || rule.field_key || rule.key || '');
  if (isObject(rule.component) && typeof rule.component.source === 'string' && rule.component.source.startsWith('component_db.')) {
    const ref = normalizeFieldKey(rule.component.source.slice('component_db.'.length));
    const componentType = normalizeFieldKey(rule.component.type || ref);
    if (normalizedFieldKey && componentType && componentType === normalizedFieldKey) {
      return rule.component.source;
    }
  }
  const inferredComponentType = normalizeFieldKey(
    rule.parse?.component_type
    || rule.parse_rules?.component_type
    || '',
  );
  if (normalizedFieldKey && inferredComponentType && inferredComponentType === normalizedFieldKey) {
    return `component_db.${inferredComponentType}`;
  }
  if (explicitSource) return explicitSource;
  return '';
}

function buildFieldKeySet(map) {
  const keys = new Set();
  for (const key of Array.isArray(map?.selected_keys) ? map.selected_keys : []) {
    const normalized = normalizeFieldKey(key);
    if (normalized) keys.add(normalized);
  }
  for (const key of Object.keys(isObject(map?.field_overrides) ? map.field_overrides : {})) {
    const normalized = normalizeFieldKey(key);
    if (normalized) keys.add(normalized);
  }
  return keys;
}

function validateLinkedPatchReferences(map) {
  const errors = [];
  const dataListFields = new Set((Array.isArray(map?.data_lists) ? map.data_lists : [])
    .map((row) => normalizeFieldKey(row?.field))
    .filter(Boolean));
  const componentTypes = new Set((Array.isArray(map?.component_sources) ? map.component_sources : [])
    .map((row) => normalizeFieldKey(componentKey(row)))
    .filter(Boolean));
  const fieldOverrides = isObject(map?.field_overrides) ? map.field_overrides : {};
  const knownFieldKeys = buildFieldKeySet(map);
  const shouldValidatePropertyFields = knownFieldKeys.size > 0;

  for (const [fieldKeyRaw, rule] of Object.entries(fieldOverrides)) {
    const fieldKey = normalizeFieldKey(fieldKeyRaw);
    const source = enumSourceForRule(rule, fieldKey);
    if (source.startsWith('data_lists.')) {
      const ref = normalizeFieldKey(source.slice('data_lists.'.length));
      if (ref && !dataListFields.has(ref)) {
        errors.push(`field_overrides.${fieldKey}.enum.source references data_lists.${ref} but no data_lists row with field "${ref}" exists after import`);
      }
    }
    if (source.startsWith('component_db.')) {
      const ref = normalizeFieldKey(source.slice('component_db.'.length));
      if (ref && ref !== fieldKey) {
        errors.push(`field_overrides.${fieldKey}.enum.source = component_db.${ref} must self-lock to component_db.${fieldKey}`);
      }
      if (ref && !componentTypes.has(ref)) {
        errors.push(`field_overrides.${fieldKey}.enum.source references component_db.${ref} but no component_sources row for "${ref}" exists after import`);
      }
    }
  }

  for (const row of Array.isArray(map?.component_sources) ? map.component_sources : []) {
    const type = normalizeFieldKey(componentKey(row));
    if (!type) continue;
    const parentSource = enumSourceForRule(fieldOverrides[type], type);
    if (parentSource !== `component_db.${type}`) {
      errors.push(`component_sources[${type}]: matching field_overrides.${type}.enum.source must be "component_db.${type}"`);
    }
    const properties = Array.isArray(row?.roles?.properties) ? row.roles.properties : [];
    for (const property of properties) {
      const key = normalizeFieldKey(propertyKey(property));
      if (!key) continue;
      if (isAutoComponentIdentityFacetProperty(type, key)) {
        errors.push(`component_sources[${type}].roles.properties.${key}: ${key} is an auto-generated identity facet; do not list it in roles.properties`);
        continue;
      }
      if (property?.component_only === true) continue;
      if (shouldValidatePropertyFields && !knownFieldKeys.has(key)) {
        errors.push(`component_sources[${type}].roles.properties.${key}: no selected key or field_overrides entry exists after import`);
      }
    }
  }

  return { errors, warnings: [] };
}

function fieldOverrideByNormalizedKey(map, fieldKey) {
  const normalized = normalizeFieldKey(fieldKey);
  const fieldOverrides = isObject(map?.field_overrides) ? map.field_overrides : {};
  return Object.entries(fieldOverrides).find(([key]) => normalizeFieldKey(key) === normalized)?.[1] || null;
}

function componentTypeSet(map) {
  return new Set((Array.isArray(map?.component_sources) ? map.component_sources : [])
    .map((row) => normalizeFieldKey(componentKey(row)))
    .filter(Boolean));
}

function isComponentIdentityField(map, fieldKey) {
  const normalized = normalizeFieldKey(fieldKey);
  if (!normalized) return false;
  const source = enumSourceForRule(fieldOverrideByNormalizedKey(map, normalized), normalized);
  return source === `component_db.${normalized}` || componentTypeSet(map).has(normalized);
}

function componentIdentityProjectionForRule(rule) {
  const projection = rule?.component_identity_projection;
  return isObject(projection) ? projection : null;
}

function isAutoComponentIdentityFacetField(map, fieldKey) {
  const normalized = normalizeFieldKey(fieldKey);
  if (!normalized) return false;
  const rule = fieldOverrideByNormalizedKey(map, normalized);
  const projection = componentIdentityProjectionForRule(rule);
  const projectedType = normalizeFieldKey(projection?.component_type);
  const projectedFacet = normalizeFieldKey(projection?.facet);
  if (projectedType && AUTO_COMPONENT_IDENTITY_FACETS.has(projectedFacet)) return true;
  const match = normalized.match(/^(.+)_(brand|link)$/);
  return Boolean(match && isComponentIdentityField(map, match[1]));
}

function isAliasOutOfScopeField(map, fieldKey) {
  return isComponentIdentityField(map, fieldKey) || isAutoComponentIdentityFacetField(map, fieldKey);
}

function hasNonEmptyAliases(value) {
  if (value == null) return false;
  if (Array.isArray(value)) return value.some((entry) => String(entry || '').trim());
  return String(value || '').trim() !== '';
}

function validateComponentIdentityAliasPatches({ patched, patchDocs }) {
  const errors = [];
  for (const rawDoc of patchDocs || []) {
    const doc = validateFieldStudioPatchDocument(stripPatchMetadata(rawDoc), { category: rawDoc?.category });
    const override = doc.patch.field_overrides?.[doc.field_key];
    if (!isObject(override) || !hasOwn(override, 'aliases')) continue;
    if (!hasNonEmptyAliases(override.aliases)) continue;
    const fieldKey = normalizeFieldKey(doc.field_key);
    if (!isAliasOutOfScopeField(patched, fieldKey)) continue;
    errors.push(`field_overrides.${fieldKey}.aliases must be blank/absent for component identity and auto identity-facet fields.`);
  }
  return { errors, warnings: [] };
}

function validatePatchedFieldStudioMap({ category, patched, validateFieldStudioMap, patchDocs = [] }) {
  const validation = typeof validateFieldStudioMap === 'function'
    ? validateFieldStudioMap(patched, { category })
    : { valid: true, errors: [], warnings: [], normalized: patched };
  const normalized = isObject(validation?.normalized) ? validation.normalized : patched;
  const linkedValidation = validateLinkedPatchReferences(normalized);
  const componentAliasValidation = validateComponentIdentityAliasPatches({ patched: normalized, patchDocs });
  const errors = [
    ...(Array.isArray(validation?.errors) ? validation.errors : []),
    ...linkedValidation.errors,
    ...componentAliasValidation.errors,
  ];
  const warnings = [
    ...(Array.isArray(validation?.warnings) ? validation.warnings : []),
    ...linkedValidation.warnings,
    ...componentAliasValidation.warnings,
  ];
  const valid = validation?.valid !== false && errors.length === 0;

  return {
    valid,
    errors,
    warnings,
    normalized,
    validation: {
      ...(isObject(validation) ? validation : {}),
      valid,
      errors,
      warnings,
      normalized,
    },
  };
}

export function buildFieldStudioPatchChangeLog({ before, after, patchDocs }) {
  const changes = [];
  const seen = new Set();

  for (const rawDoc of patchDocs || []) {
    const doc = validateFieldStudioPatchDocument(stripPatchMetadata(rawDoc), { category: rawDoc?.category });
    const fieldKey = doc.field_key;

    if (isObject(doc.patch.field_overrides?.[fieldKey])) {
      const leafPaths = flattenLeafPaths(doc.patch.field_overrides[fieldKey]);
      for (const leafPath of leafPaths) {
        const fullPath = ['field_overrides', fieldKey, ...leafPath];
        const beforeValue = pathValue(before, fullPath);
        const afterValue = pathValue(after, fullPath);
        if (!jsonChanged(beforeValue, afterValue)) continue;
        pushChange(changes, seen, {
          kind: 'field_override',
          action: beforeValue === undefined ? 'added' : 'updated',
          path: fullPath.join('.'),
          label: `${fieldKey} ${leafPath.join('.') || 'override'}`,
          fieldKey,
          before: beforeValue,
          after: afterValue,
        });
      }
    }

    if (Array.isArray(doc.patch.data_lists)) {
      for (const row of doc.patch.data_lists) {
        const beforeRow = dataListByField(before, row.field);
        const afterRow = dataListByField(after, row.field);
        if (!jsonChanged(beforeRow, afterRow)) continue;
        pushChange(changes, seen, {
          kind: 'data_list',
          action: beforeRow ? 'updated' : 'added',
          path: `data_lists.${row.field}`,
          label: `${row.field} data list`,
          fieldKey: row.field,
          before: beforeRow,
          after: afterRow,
        });
      }
    }

    if (Array.isArray(doc.patch.component_sources)) {
      for (const row of doc.patch.component_sources) {
        const type = componentKey(row);
        const beforeRow = componentSourceByType(before, type);
        const afterRow = componentSourceByType(after, type);
        if (jsonChanged(beforeRow, afterRow)) {
          pushChange(changes, seen, {
            kind: 'component_source',
            action: beforeRow ? 'updated' : 'added',
            path: `component_sources.${type}`,
            label: `${type} component source`,
            componentType: type,
            before: beforeRow,
            after: afterRow,
          });
        }

        const incomingProperties = Array.isArray(row.roles?.properties) ? row.roles.properties : [];
        for (const prop of incomingProperties) {
          const key = propertyKey(prop);
          const beforeProp = componentPropertyByKey(beforeRow, key);
          const afterProp = componentPropertyByKey(afterRow, key);
          if (!jsonChanged(beforeProp, afterProp)) continue;
          pushChange(changes, seen, {
            kind: 'component_property',
            action: beforeProp ? 'updated' : 'added',
            path: `component_sources.${type}.roles.properties.${key}`,
            label: `${type}.${key} component property`,
            fieldKey: key,
            componentType: type,
            before: beforeProp,
            after: afterProp,
          });
        }
      }
    }
  }

  return changes;
}

function mergeProperties(existing = [], incoming = []) {
  const out = Array.isArray(existing) ? cloneJson(existing) : [];
  for (const prop of incoming) {
    const key = propertyKey(prop);
    const index = out.findIndex((entry) => propertyKey(entry) === key);
    if (index === -1) {
      out.push(cloneJson(prop));
      continue;
    }
    out[index] = mergeJson(out[index], prop);
  }
  return out;
}

function mergeComponentSource(existing, incoming) {
  const merged = mergeJson(existing, incoming);
  const existingProperties = Array.isArray(existing?.roles?.properties) ? existing.roles.properties : [];
  const incomingProperties = Array.isArray(incoming?.roles?.properties) ? incoming.roles.properties : null;
  if (incomingProperties) {
    merged.roles = {
      ...(isObject(merged.roles) ? merged.roles : {}),
      properties: mergeProperties(existingProperties, incomingProperties),
    };
  }
  return merged;
}

function applyComponentSourcePatch(existing, incoming, { patchFieldKey }) {
  if (normalizeFieldKey(componentKey(incoming)) === normalizeFieldKey(patchFieldKey)) {
    return cloneJson(incoming);
  }
  return mergeComponentSource(existing, incoming);
}

export function applyFieldStudioPatchDocument(fieldStudioMap, patchDoc) {
  const doc = validateFieldStudioPatchDocument(stripPatchMetadata(patchDoc), { category: patchDoc?.category });
  const next = cloneJson(fieldStudioMap || {});

  if (Array.isArray(doc.patch.data_lists)) {
    const rows = Array.isArray(next.data_lists)
      ? cloneJson(next.data_lists).map((row) => stripRetiredDataListKeys(row))
      : [];
    for (const incoming of doc.patch.data_lists) {
      const cleanIncoming = stripRetiredDataListKeys(incoming);
      const index = rows.findIndex((row) => row?.field === incoming.field);
      if (index === -1) {
        rows.push(cloneJson(cleanIncoming));
        continue;
      }
      rows[index] = mergeJson(rows[index], cleanIncoming);
    }
    next.data_lists = rows;
  }

  if (isObject(doc.patch.field_overrides)) {
    next.field_overrides = isObject(next.field_overrides) ? cloneJson(next.field_overrides) : {};
    const incoming = doc.patch.field_overrides[doc.field_key];
    if (incoming) {
      next.field_overrides[doc.field_key] = mergeJson(next.field_overrides[doc.field_key], incoming);
    }
  }

  if (Array.isArray(doc.patch.component_sources)) {
    const rows = Array.isArray(next.component_sources) ? cloneJson(next.component_sources) : [];
    for (const incoming of doc.patch.component_sources) {
      const key = componentKey(incoming);
      const index = rows.findIndex((row) => componentKey(row) === key);
      if (index === -1) {
        rows.push(cloneJson(incoming));
        continue;
      }
      rows[index] = applyComponentSourcePatch(rows[index], incoming, { patchFieldKey: doc.field_key });
    }
    next.component_sources = rows;
  }

  return next;
}

export function applyFieldStudioPatchDocuments(fieldStudioMap, patchDocs) {
  return patchDocs.reduce(
    (current, doc) => applyFieldStudioPatchDocument(current, doc),
    fieldStudioMap,
  );
}

export function parseFieldStudioPatchPayloadFiles({ category, files }) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('files must be a non-empty array');
  }

  return files.map((file, index) => {
    if (!isObject(file)) {
      throw new Error(`files[${index}] must be an object`);
    }
    const fileName = safeSourceFileName(file.fileName || file.name);
    const content = file.content ?? file.text;
    if (typeof content !== 'string') {
      throw new Error(`${fileName}: content must be a string`);
    }
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (err) {
      throw new Error(`${fileName}: invalid JSON (${err.message})`);
    }
    const doc = validateFieldStudioPatchDocument(parsed, { category, fileName });
    return { ...doc, source_file: fileName };
  });
}

export function previewFieldStudioPatchDocuments({
  category,
  fieldStudioMap,
  patchDocs,
  validateFieldStudioMap = null,
}) {
  if (!category) throw new Error('category is required');
  if (!Array.isArray(patchDocs) || patchDocs.length === 0) {
    throw new Error('patchDocs must be a non-empty array');
  }

  const docs = patchDocs.map((doc) => validateFieldStudioPatchDocument(
    stripPatchMetadata(doc),
    { category, fileName: doc?.source_file || null },
  )).map((doc, index) => ({
    ...doc,
    source_file: patchDocs[index]?.source_file || expectedFieldStudioPatchFileName({
      category: doc.category,
      fieldKey: doc.field_key,
      navigatorOrdinal: doc.navigator_ordinal ?? null,
    }),
  }));

  const before = cloneJson(fieldStudioMap || {});
  const patched = applyFieldStudioPatchDocuments(before, docs);
  const validationResult = validatePatchedFieldStudioMap({
    category,
    patched,
    validateFieldStudioMap,
    patchDocs: docs,
  });
  const normalized = validationResult.normalized;

  return {
    category,
    valid: validationResult.valid,
    files: docs.map(patchFileSummary),
    changes: buildFieldStudioPatchChangeLog({ before, after: normalized, patchDocs: docs }),
    errors: validationResult.errors,
    warnings: validationResult.warnings,
    validation: validationResult.validation,
    fieldStudioMap: normalized,
  };
}

export function importFieldStudioPatchDocuments({
  category,
  fieldStudioMap,
  patchDocs,
  validateFieldStudioMap = null,
}) {
  const preview = previewFieldStudioPatchDocuments({
    category,
    fieldStudioMap,
    patchDocs,
    validateFieldStudioMap,
  });

  if (!preview.valid) {
    const details = preview.errors.length > 0 ? preview.errors.join('; ') : 'unknown validation error';
    throw new Error(`patched field_studio_map failed validation: ${details}`);
  }

  return {
    category,
    applied: preview.files,
    changes: preview.changes,
    fieldStudioMap: preview.fieldStudioMap,
    validation: preview.validation,
  };
}

export async function loadFieldStudioPatchDocuments({ category, inputDir }) {
  if (!category) throw new Error('category is required');
  if (!inputDir) throw new Error('inputDir is required');
  const entries = await fs.readdir(inputDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && normalizeDuplicatePatchFileName(entry.name).endsWith(PATCH_FILE_SUFFIX))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const docs = [];
  for (const fileName of files) {
    const filePath = path.join(inputDir, fileName);
    const raw = await fs.readFile(filePath, 'utf8');
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new Error(`${fileName}: invalid JSON (${err.message})`);
    }
    const doc = validateFieldStudioPatchDocument(parsed, { category, fileName });
    docs.push({ ...doc, source_file: fileName, source_path: filePath });
  }
  return docs;
}

export async function importFieldStudioPatchDirectory({
  category,
  inputDir,
  fieldStudioMap,
  validateFieldStudioMap = null,
}) {
  const docs = await loadFieldStudioPatchDocuments({ category, inputDir });
  const patched = applyFieldStudioPatchDocuments(fieldStudioMap, docs);
  const validationResult = validatePatchedFieldStudioMap({
    category,
    patched,
    validateFieldStudioMap,
    patchDocs: docs,
  });
  if (!validationResult.valid) {
    const details = validationResult.errors.length > 0 ? validationResult.errors.join('; ') : 'unknown validation error';
    throw new Error(`patched field_studio_map failed validation: ${details}`);
  }
  return {
    category,
    inputDir,
    applied: docs.map((doc) => ({
      fileName: doc.source_file,
      fieldKey: doc.field_key,
      navigatorOrdinal: doc.navigator_ordinal ?? null,
      verdict: doc.verdict,
    })),
    fieldStudioMap: validationResult.normalized,
    validation: validationResult.validation,
  };
}
