// Builds the componentDBs payload consumed by FieldRulesEngine, Component
// Review, and the test-mode audit by composing componentStore's
// getComponentTypeList + getAllComponentsForType. Output matches the shape
// expected by normalizeComponentDbPayload (which also builds __index Maps).

import { normalizeComponentDbPayload } from '../../field-rules/loader.js';

function parseLinks(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseConstraints(raw) {
  if (raw == null) return null;
  if (Array.isArray(raw)) return raw.length > 0 ? raw : null;
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function buildEntry({ identity, aliases, properties }) {
  const canonicalName = String(identity?.canonical_name || '').trim();
  const maker = String(identity?.maker || '').trim();

  const aliasList = [];
  for (const row of aliases || []) {
    const alias = String(row?.alias || '').trim();
    if (!alias) continue;
    // WHY: seed.js:601 inserts canonical_name as an alias row for
    // findComponentByAlias lookups. Drop it on read so the entry's
    // aliases[] matches the original JSON shape.
    if (alias === canonicalName) continue;
    aliasList.push(alias);
  }

  const propertiesDict = {};
  const variancePolicies = {};
  const constraints = {};
  for (const row of properties || []) {
    const key = String(row?.property_key || '').trim();
    if (!key) continue;
    if (row.value != null && row.value !== '') propertiesDict[key] = row.value;
    if (row.variance_policy) variancePolicies[key] = row.variance_policy;
    const parsed = parseConstraints(row.constraints);
    if (parsed) constraints[key] = parsed;
  }

  const entry = {
    canonical_name: canonicalName,
    name: canonicalName,
    maker,
    aliases: aliasList,
    links: parseLinks(identity?.links),
    properties: propertiesDict,
  };
  if (Object.keys(variancePolicies).length > 0) entry.__variance_policies = variancePolicies;
  if (Object.keys(constraints).length > 0) entry.__constraints = constraints;
  return entry;
}

export function loadComponentDbsFromSpecDb(specDb) {
  if (!specDb || typeof specDb.getComponentTypeList !== 'function') return {};
  const types = specDb.getComponentTypeList() || [];
  const out = {};
  for (const typeRow of types) {
    const type = String(typeRow?.component_type || '').trim();
    if (!type) continue;
    const rows = specDb.getAllComponentsForType(type) || [];
    if (rows.length === 0) continue;
    const entries = {};
    for (const row of rows) {
      const canonicalName = String(row?.identity?.canonical_name || '').trim();
      if (!canonicalName) continue;
      const entry = buildEntry(row);
      entries[`${entry.canonical_name}::${entry.maker}`] = entry;
    }
    out[type] = normalizeComponentDbPayload({
      db_name: type,
      component_type: type,
      entries,
    }, type);
  }
  return out;
}
