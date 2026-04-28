// ── Component Review Helpers ────────────────────────────────────────
//
// Review-specific helpers extracted from componentReviewData.js.
// Parsing, matching, discovery normalization, file I/O, field rules,
// and property column resolution.

import fs from 'node:fs/promises';
import path from 'node:path';
import { isConsumerEnabled } from '../../../field-rules/consumerGate.js';
import {
  isObject,
  toArray,
  normalizeToken,
  normalizeFieldKey,
  slugify,
  splitCandidateParts,
} from './reviewNormalization.js';
import {
  hasKnownValue,
  normalizeSourceToken,
} from './candidateInfrastructure.js';

// ── Attribute Parsing ───────────────────────────────────────────────

export function parseReviewItemAttributes(reviewItem) {
  const raw = reviewItem?.product_attributes;
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      return {};
    }
  }
  return {};
}

// ── Field Rules ─────────────────────────────────────────────────────

export function resolveFieldRulesEntries(fieldRules = null) {
  if (!isObject(fieldRules)) return {};
  if (isObject(fieldRules?.rules?.fields)) return fieldRules.rules.fields;
  if (isObject(fieldRules?.fields)) return fieldRules.fields;
  return {};
}

export function resolveReviewEnabledEnumFieldSet(fieldRules = null) {
  if (!isObject(fieldRules)) return null;
  const rules = resolveFieldRulesEntries(fieldRules);
  const entries = Object.entries(rules);
  if (entries.length === 0) return null;
  const enabled = new Set();
  for (const [rawFieldKey, rule] of entries) {
    if (!isObject(rule)) continue;
    if (!isConsumerEnabled(rule, 'enum.source', 'review')) continue;
    const fieldKey = normalizeFieldKey(rawFieldKey);
    if (!fieldKey) continue;
    enabled.add(fieldKey);
  }
  return enabled.size > 0 ? enabled : null;
}

// ── Maker Matching ──────────────────────────────────────────────────

export function makerTokensFromReviewItem(reviewItem, componentType) {
  const attrs = parseReviewItemAttributes(reviewItem);
  const fieldKey = String(reviewItem?.field_key || '').trim();
  const keys = [
    `${componentType}_brand`,
    `${componentType}_maker`,
    fieldKey ? `${fieldKey}_brand` : '',
    fieldKey ? `${fieldKey}_maker` : '',
    'brand',
    'maker',
  ].filter(Boolean);

  const tokens = [];
  for (const key of keys) {
    for (const value of splitCandidateParts(attrs[key])) {
      const token = normalizeToken(value);
      if (!hasKnownValue(token)) continue;
      tokens.push(token);
    }
  }
  for (const value of splitCandidateParts(reviewItem?.ai_suggested_maker)) {
    const token = normalizeToken(value);
    if (!hasKnownValue(token)) continue;
    tokens.push(token);
  }
  return [...new Set(tokens)];
}

export function reviewItemMatchesMakerLane(reviewItem, {
  componentType,
  maker,
  allowMakerlessForNamedLane = false,
}) {
  const makerTokens = makerTokensFromReviewItem(reviewItem, componentType);
  const laneMakerToken = normalizeToken(maker);
  if (!laneMakerToken) {
    return makerTokens.length === 0;
  }
  if (makerTokens.length === 0) {
    return Boolean(allowMakerlessForNamedLane);
  }
  return makerTokens.includes(laneMakerToken);
}

export function componentLaneSlug(componentName, componentMaker = '') {
  return `${slugify(componentName)}_${slugify(componentMaker || 'na')}`;
}

// ── Discovery ───────────────────────────────────────────────────────

export function discoveredFromSource(source) {
  const token = normalizeSourceToken(source);
  return token === 'pipeline' || token === 'discovered' || token === 'ai_discovered';
}

export function normalizeDiscoveryRows(rows = []) {
  return toArray(rows).map((row) => {
    const source = String(row?.discovery_source || '').trim();
    const discovered = typeof row?.discovered === 'boolean'
      ? row.discovered
      : discoveredFromSource(source);
    return {
      ...row,
      discovery_source: source,
      discovered,
    };
  });
}

export function enforceNonDiscoveredRows(rows = []) {
  return normalizeDiscoveryRows(rows);
}

// ── File I/O ────────────────────────────────────────────────────────

export async function safeReadJson(fp) {
  try { return JSON.parse(await fs.readFile(fp, 'utf8')); } catch { return null; }
}

export async function listJsonFiles(dirPath) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries.filter(e => e.isFile() && e.name.endsWith('.json')).map(e => e.name).sort();
  } catch { return []; }
}

// ── Property Columns ────────────────────────────────────────────────

export function resolveDeclaredComponentPropertyColumns({ fieldRules = null, componentType = '' } = {}) {
  const targetType = normalizeFieldKey(componentType);
  if (!targetType || !isObject(fieldRules)) return [];

  const keys = [];
  const seen = new Set();
  const addKey = (raw) => {
    const key = normalizeFieldKey(raw);
    if (!key || key.startsWith('__') || seen.has(key)) return;
    seen.add(key);
    keys.push(key);
  };
  // Phase 2: parent identity comes from `enum.source === component_db.<self>`
  // and property_keys live in field_studio_map.component_sources (walked
  // below via the `component_db_sources` block). The legacy
  // `rule.component.match.property_keys` walk is gone.
  const fields = resolveFieldRulesEntries(fieldRules);
  for (const [fieldKey, rule] of Object.entries(fields)) {
    if (!isObject(rule)) continue;
    const enumSource = String(rule?.enum?.source || '');
    if (enumSource !== `component_db.${targetType}`) continue;
    if (normalizeFieldKey(fieldKey) !== targetType) continue;
    // Self-locked parent — record nothing here; properties come from sources walk.
  }

  const componentSources = isObject(fieldRules?.component_db_sources)
    ? fieldRules.component_db_sources
    : (isObject(fieldRules?.rules?.component_db_sources) ? fieldRules.rules.component_db_sources : {});
  for (const [sourceType, sourceDef] of Object.entries(componentSources)) {
    if (normalizeFieldKey(sourceType) !== targetType) continue;
    const roles = isObject(sourceDef?.roles) ? sourceDef.roles : {};
    for (const mapping of toArray(roles.properties)) {
      if (!isObject(mapping)) continue;
      addKey(mapping.field_key || mapping.key || mapping.property_key || '');
    }
  }

  return keys;
}

function readComponentSourcesFromSpecDb(specDb = null) {
  if (!specDb || typeof specDb.getFieldStudioMap !== 'function') return [];
  const row = specDb.getFieldStudioMap();
  const raw = row?.map_json;
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return toArray(parsed?.component_sources);
  } catch {
    return [];
  }
}

export function resolveDeclaredComponentTypeOrder({ fieldRules = null, specDb = null } = {}) {
  const ordered = [];
  const seen = new Set();
  const addType = (raw) => {
    const componentType = normalizeFieldKey(raw);
    if (!componentType || seen.has(componentType)) return;
    seen.add(componentType);
    ordered.push(componentType);
  };

  for (const row of readComponentSourcesFromSpecDb(specDb)) {
    addType(row?.component_type || row?.type || '');
  }
  if (ordered.length > 0) return ordered;

  const componentSources = isObject(fieldRules?.component_db_sources)
    ? fieldRules.component_db_sources
    : (isObject(fieldRules?.rules?.component_db_sources) ? fieldRules.rules.component_db_sources : {});
  for (const sourceType of Object.keys(componentSources)) {
    addType(sourceType);
  }
  return ordered;
}

export function hasDeclaredComponentSource({ fieldRules = null, componentType = '' } = {}) {
  const targetType = normalizeFieldKey(componentType);
  if (!targetType || !isObject(fieldRules)) return false;
  const componentSources = isObject(fieldRules?.component_db_sources)
    ? fieldRules.component_db_sources
    : (isObject(fieldRules?.rules?.component_db_sources) ? fieldRules.rules.component_db_sources : {});
  return Object.keys(componentSources).some((sourceType) => normalizeFieldKey(sourceType) === targetType);
}

export function mergePropertyColumns(observedColumns = [], declaredColumns = []) {
  const keys = new Set();
  for (const raw of [...toArray(observedColumns), ...toArray(declaredColumns)]) {
    const key = normalizeFieldKey(raw);
    if (!key || key.startsWith('__')) continue;
    keys.add(key);
  }
  return [...keys].sort((a, b) => a.localeCompare(b));
}

export function resolveComponentReviewPropertyColumns({
  observedColumns = [],
  declaredColumns = [],
  declaredComponentSource = false,
} = {}) {
  if (declaredComponentSource) {
    const keys = [];
    const seen = new Set();
    for (const raw of toArray(declaredColumns)) {
      const key = normalizeFieldKey(raw);
      if (!key || key.startsWith('__') || seen.has(key)) continue;
      seen.add(key);
      keys.push(key);
    }
    return keys;
  }
  return mergePropertyColumns(observedColumns, declaredColumns);
}

// ── Field Rules Metadata Resolution ──────────────────────────────────

export function resolvePropertyFieldMeta(propertyKey, fieldRules) {
  if (!propertyKey || propertyKey.startsWith('__')) return null;
  const fields = fieldRules?.rules?.fields ?? fieldRules?.fields ?? {};
  const rule = fields[propertyKey];
  if (rule) return readMetaFromFieldRule(rule, fieldRules);

  // WHY: component_only properties are intentionally absent from fields[] but
  // still need metadata for Component Review. Fall back to the property entry
  // declared on the component source itself.
  const fallback = findComponentSourceProperty(propertyKey, fieldRules);
  if (fallback) return readMetaFromComponentSourceProperty(fallback, propertyKey, fieldRules);

  return null;
}

function readMetaFromFieldRule(rule, fieldRules) {
  const variance_policy = rule.variance_policy ?? null;
  const constraints = Array.isArray(rule.constraints) ? rule.constraints : [];

  let enum_values = null;
  let enum_policy = null;
  if (rule.enum && typeof rule.enum === 'object') {
    enum_policy = rule.enum.policy ?? null;
    const source = String(rule.enum.source || '');
    if (source.startsWith('data_lists.')) {
      const listKey = source.slice('data_lists.'.length);
      enum_values = readEnumValues(fieldRules, listKey);
    }
  }
  return { variance_policy, constraints, enum_values, enum_policy, component_only: false };
}

function readMetaFromComponentSourceProperty(prop, propertyKey, fieldRules) {
  const variance_policy = prop.variance_policy ?? null;
  const constraints = Array.isArray(prop.constraints) ? prop.constraints : [];
  // WHY: For component_only properties, knownValues.enums[propertyKey] is the
  // best-effort enum source — populated when authors declared a data_list for
  // the property. If absent, return null (open enum / unknown).
  const enum_values = readEnumValues(fieldRules, propertyKey);
  const enum_policy = enum_values && enum_values.length > 0 ? 'closed' : null;
  return {
    variance_policy,
    constraints,
    enum_values,
    enum_policy,
    component_only: prop.component_only === true,
  };
}

function readEnumValues(fieldRules, listKey) {
  const enums = fieldRules?.knownValues?.enums ?? {};
  const entry = enums[listKey];
  if (!entry) return null;
  const vals = Array.isArray(entry.values) ? entry.values : (Array.isArray(entry) ? entry : []);
  const out = vals
    .map(v => typeof v === 'object' ? String(v.canonical ?? v.value ?? '') : String(v))
    .filter(Boolean);
  return out.length > 0 ? out : null;
}

function findComponentSourceProperty(propertyKey, fieldRules) {
  const sources = fieldRules?.component_db_sources ?? fieldRules?.rules?.component_db_sources ?? {};
  if (!sources || typeof sources !== 'object') return null;
  for (const sourceBlock of Object.values(sources)) {
    const props = sourceBlock?.roles?.properties;
    if (!Array.isArray(props)) continue;
    for (const prop of props) {
      if (!prop || typeof prop !== 'object') continue;
      if (prop.field_key === propertyKey || prop.key === propertyKey) return prop;
    }
  }
  return null;
}
