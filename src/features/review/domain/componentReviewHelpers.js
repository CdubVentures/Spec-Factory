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

export function isTestModeCategory(category) {
  return String(category || '').trim().toLowerCase().startsWith('_test_');
}

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

export function enforceNonDiscoveredRows(rows = [], category = '') {
  const normalizedRows = normalizeDiscoveryRows(rows);
  if (!isTestModeCategory(category) || normalizedRows.length === 0) {
    return normalizedRows;
  }
  const maxNonDiscovered = 3;
  let nonDiscoveredSeen = 0;
  const result = normalizedRows.map((row) => {
    if (!row.discovered) {
      nonDiscoveredSeen += 1;
      if (nonDiscoveredSeen > maxNonDiscovered) {
        return { ...row, discovered: true };
      }
    }
    return row;
  });
  const hasNonDiscovered = result.some((row) => !row.discovered);
  if (!hasNonDiscovered) {
    const firstUnlinked = result.findIndex((row) => (row?.linked_products?.length || 0) === 0);
    const anchorIdx = firstUnlinked >= 0 ? firstUnlinked : 0;
    return result.map((row, index) => (index === anchorIdx ? { ...row, discovered: false } : row));
  }
  return result;
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

  const keys = new Set();
  const fields = resolveFieldRulesEntries(fieldRules);
  for (const rule of Object.values(fields)) {
    if (!isObject(rule)) continue;
    const componentBlock = isObject(rule.component) ? rule.component : {};
    if (normalizeFieldKey(componentBlock.type || '') !== targetType) continue;
    const matchBlock = isObject(componentBlock.match) ? componentBlock.match : {};
    for (const rawKey of toArray(matchBlock.property_keys)) {
      const key = normalizeFieldKey(rawKey);
      if (!key || key.startsWith('__')) continue;
      keys.add(key);
    }
  }

  const componentSources = isObject(fieldRules?.component_db_sources)
    ? fieldRules.component_db_sources
    : (isObject(fieldRules?.rules?.component_db_sources) ? fieldRules.rules.component_db_sources : {});
  for (const [sourceType, sourceDef] of Object.entries(componentSources)) {
    if (normalizeFieldKey(sourceType) !== targetType) continue;
    const roles = isObject(sourceDef?.roles) ? sourceDef.roles : {};
    for (const mapping of toArray(roles.properties)) {
      if (!isObject(mapping)) continue;
      const key = normalizeFieldKey(mapping.field_key || mapping.key || mapping.property_key || '');
      if (!key || key.startsWith('__')) continue;
      keys.add(key);
    }
  }

  return [...keys].sort();
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

// ── Field Rules Metadata Resolution ──────────────────────────────────

export function resolvePropertyFieldMeta(propertyKey, fieldRules) {
  if (!propertyKey || propertyKey.startsWith('__')) return null;
  const fields = fieldRules?.rules?.fields ?? fieldRules?.fields ?? {};
  const rule = fields[propertyKey];
  if (!rule) return null;

  const variance_policy = rule.variance_policy ?? null;
  const constraints = Array.isArray(rule.constraints) ? rule.constraints : [];

  let enum_values = null;
  let enum_policy = null;
  if (rule.enum && typeof rule.enum === 'object') {
    enum_policy = rule.enum.policy ?? null;
    const source = String(rule.enum.source || '');
    if (source.startsWith('data_lists.')) {
      const listKey = source.slice('data_lists.'.length);
      const enums = fieldRules?.knownValues?.enums ?? {};
      const entry = enums[listKey];
      if (entry) {
        const vals = Array.isArray(entry.values) ? entry.values : (Array.isArray(entry) ? entry : []);
        enum_values = vals
          .map(v => typeof v === 'object' ? String(v.canonical ?? v.value ?? '') : String(v))
          .filter(Boolean);
      }
    }
  }

  return { variance_policy, constraints, enum_values, enum_policy };
}
