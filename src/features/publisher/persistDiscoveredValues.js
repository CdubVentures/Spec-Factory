import fs from 'node:fs';
import path from 'node:path';
import { normalizeKnownValueMatchKey } from '../../shared/primitives.js';

/**
 * Persists newly discovered enum values into list_values.
 * Called by pipeline orchestrators after validation/repair succeeds.
 * Receives specDb as injected dependency; no direct DB imports.
 *
 * WHY: onValueDiscovered enables DB + JSON dual-write for the rebuild contract.
 *
 * @param {{ specDb: object, fieldKey: string, value: *, fieldRule: object|null, onValueDiscovered?: Function }} opts
 */

function isBooleanFieldRule(fieldRule) {
  return String(fieldRule?.contract?.type || fieldRule?.type || fieldRule?.data_type || '').trim().toLowerCase() === 'boolean';
}

function discoveredValues(value) {
  const values = Array.isArray(value) ? value : [value];
  return values
    .filter((entry) => entry != null && entry !== '')
    .map((entry) => String(entry))
    .filter((entry) => entry.trim());
}

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return null; }
}

function resolveDiscoveredEnumPath({ category, config }) {
  const outputRoot = config?.localOutputRoot || path.resolve('.workspace', 'output');
  return path.join(outputRoot, category, 'discovered_enums.json');
}

export function appendDiscoveredEnumJson({ category, config, fieldKey, value, firstSeenAt }) {
  const key = String(fieldKey || '').trim();
  const values = discoveredValues(value);
  if (!category || !key || values.length === 0) return;

  const filePath = resolveDiscoveredEnumPath({ category, config });
  const doc = readJson(filePath) || {};
  const next = {
    ...doc,
    category: doc.category || category,
    version: Number.isFinite(doc.version) ? doc.version : 1,
    values: doc.values && typeof doc.values === 'object' && !Array.isArray(doc.values)
      ? { ...doc.values }
      : {},
  };

  const existing = Array.isArray(next.values[key]) ? [...next.values[key]] : [];
  const existingTokens = new Set(existing.map((entry) => normalizeKnownValueMatchKey(entry?.value)));
  for (const entryValue of values) {
    const token = normalizeKnownValueMatchKey(entryValue);
    if (!token || existingTokens.has(token)) continue;
    existing.push({ value: entryValue, first_seen_at: firstSeenAt || new Date().toISOString() });
    existingTokens.add(token);
  }

  next.values[key] = existing;
  next.updated_at = new Date().toISOString();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(next, null, 2));
}

export function persistDiscoveredValue({ specDb, fieldKey, value, fieldRule, onValueDiscovered }) {
  if (!fieldRule || fieldRule?.enum?.policy !== 'open_prefer_known') return;
  if (isBooleanFieldRule(fieldRule)) return;

  for (const strValue of discoveredValues(value)) {
    const existing = specDb.getListValueByFieldAndValue(fieldKey, strValue);
    if (existing) continue;

    const firstSeenAt = new Date().toISOString();
    specDb.upsertListValue({
      fieldKey,
      value: strValue,
      normalizedValue: normalizeKnownValueMatchKey(strValue),
      source: 'pipeline',
      enumPolicy: fieldRule.enum.policy,
      needsReview: true,
      sourceTimestamp: firstSeenAt,
    });

    // WHY: Notify caller to append the same discovery to durable JSON.
    if (typeof onValueDiscovered === 'function') {
      onValueDiscovered({ fieldKey, value: strValue, firstSeenAt });
    }
  }
}
