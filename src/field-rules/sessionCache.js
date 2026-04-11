import { isObject } from '../shared/primitives.js';

// WHY: SQLite datetime('now') returns UTC without a timezone marker
// (e.g. '2026-03-31 18:22:56'). JavaScript's new Date() parses that as
// LOCAL time, shifting it by the host's UTC offset. This makes every
// timestamp comparison wrong for anyone not running on UTC.
function parseUtcTimestamp(ts) {
  if (!ts) return null;
  const s = String(ts).trim();
  if (!s) return null;
  // Already has explicit timezone → parse directly
  if (s.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(s)) return new Date(s);
  // Bare SQLite format → treat as UTC
  return new Date(s.replace(' ', 'T') + 'Z');
}

function mergeFieldOverrides(compiledFields, fieldOverrides) {
  if (!isObject(fieldOverrides)) return compiledFields;
  const allKeys = Object.keys({ ...compiledFields, ...fieldOverrides });
  return Object.fromEntries(allKeys.map((key) => {
    const compiled = isObject(compiledFields[key]) ? compiledFields[key] : {};
    const override = isObject(fieldOverrides[key]) ? fieldOverrides[key] : {};
    const compiledUi = isObject(compiled.ui) ? compiled.ui : {};
    const overrideUi = isObject(override.ui) ? override.ui : {};
    return [key, { ...compiled, ...override, ui: { ...compiledUi, ...overrideUi } }];
  }));
}

function normalizeFieldOrder(order = [], fields = {}) {
  const seen = new Set();
  const normalized = [];
  for (const key of order) {
    const token = String(key || '').trim();
    if (!token || token.startsWith('__grp::')) continue;
    if (!Object.prototype.hasOwnProperty.call(fields, token)) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    normalized.push(token);
  }
  return normalized;
}

function normalizeKeyMap(keyMap = {}) {
  if (!isObject(keyMap)) return {};
  const out = {};
  for (const [from, to] of Object.entries(keyMap)) {
    const fromKey = String(from || '').trim().toLowerCase();
    const toKey = String(to || '').trim();
    if (!fromKey || !toKey) continue;
    out[fromKey] = toKey;
  }
  return out;
}

function remapSelectedKeys(order = [], fields = {}, keyMap = {}) {
  const mapped = [];
  for (const key of order) {
    const token = String(key || '').trim();
    if (!token || token.startsWith('__grp::')) continue;
    const candidate = keyMap[token.toLowerCase()] || token;
    if (Object.prototype.hasOwnProperty.call(fields, candidate)) {
      mapped.push(candidate);
    } else if (Object.prototype.hasOwnProperty.call(fields, token)) {
      mapped.push(token);
    }
  }
  return mapped;
}

function buildGroupedFieldOrder(fieldOrder = [], mergedFields = {}, fieldGroups = []) {
  if (!Array.isArray(fieldGroups) || fieldGroups.length === 0) {
    const grouped = [];
    const keysByGroup = new Map();
    const groupOrder = [];
    for (const field of fieldOrder) {
      const rule = isObject(mergedFields[field]) ? mergedFields[field] : {};
      const ui = isObject(rule.ui) ? rule.ui : {};
      const group = String(ui.group || rule.group || 'ungrouped').trim() || 'ungrouped';
      if (!keysByGroup.has(group)) {
        keysByGroup.set(group, []);
        groupOrder.push(group);
      }
      keysByGroup.get(group).push(field);
    }
    for (const group of groupOrder) {
      grouped.push(`__grp::${group}`);
      grouped.push(...keysByGroup.get(group));
    }
    return grouped;
  }

  const fieldGroupSet = new Set(fieldGroups);
  const defaultGroup = fieldGroups[0];
  const keysByGroup = new Map();
  for (const g of fieldGroups) keysByGroup.set(g, []);

  for (const field of fieldOrder) {
    const rule = isObject(mergedFields[field]) ? mergedFields[field] : {};
    const ui = isObject(rule.ui) ? rule.ui : {};
    const group = String(ui.group || rule.group || '').trim();
    if (fieldGroupSet.has(group)) {
      keysByGroup.get(group).push(field);
    } else {
      keysByGroup.get(defaultGroup).push(field);
    }
  }

  const grouped = [];
  for (const group of fieldGroups) {
    grouped.push(`__grp::${group}`);
    grouped.push(...keysByGroup.get(group));
  }
  return grouped;
}

function buildLabelsFromFields(mergedFields, fieldOrder) {
  const labels = {};
  for (const field of fieldOrder) {
    const rule = isObject(mergedFields[field]) ? mergedFields[field] : {};
    const ui = isObject(rule.ui) ? rule.ui : {};
    labels[field] = String(ui.label || rule.label || field);
  }
  return labels;
}

// WHY: All compiled field rules + studio overrides now come from DB (field_studio_map).
// No more JSON reads for compiled baseline, key_migrations, or manifest.
export function createSessionCache({
  getSpecDb,
}) {
  const cache = new Map();

  async function loadAndMerge(category) {
    const specDb = typeof getSpecDb === 'function' ? getSpecDb(category) : null;

    // WHY: compiled_rules is the single SSOT for compiled field rules.
    const compiledRules = specDb?.getCompiledRules?.() ?? null;
    const compiledFields = compiledRules?.fields || {};
    const compiledOrder = compiledRules?.field_order || Object.keys(compiledFields);
    const compiledAt = compiledRules?.compiled_at || null;

    // WHY: SQL is the SSOT for field_studio_map overrides.
    const sqlRow = specDb?.getFieldStudioMap?.() ?? null;
    let savedMap = {};
    let mapSavedAt = null;

    if (sqlRow) {
      try { savedMap = JSON.parse(sqlRow.map_json); } catch { savedMap = {}; }
      mapSavedAt = sqlRow.updated_at || null;
    }

    const keyMigrations = compiledRules?.key_migrations || null;
    const keyMap = normalizeKeyMap(keyMigrations?.key_map);
    const mapFieldOverrides = isObject(savedMap.field_overrides) ? savedMap.field_overrides : {};
    const mergedFields = mergeFieldOverrides(compiledFields, mapFieldOverrides);

    const remappedSelectedKeys = remapSelectedKeys(
      Array.isArray(savedMap.selected_keys) ? savedMap.selected_keys : [],
      mergedFields,
      keyMap,
    );
    const selectedKeys = normalizeFieldOrder(
      remappedSelectedKeys,
      mergedFields
    );

    const baseFieldOrder = selectedKeys.length > 0
      ? selectedKeys
      : normalizeFieldOrder(compiledOrder, mergedFields);

    const savedFieldGroups = Array.isArray(savedMap.field_groups) ? savedMap.field_groups : [];
    // WHY: field_key_order table is the fast-path for instant order persistence.
    // Reseed handles JSON→SQL on boot. Computed order is the fallback.
    const fieldKeyOrderRow = specDb?.getFieldKeyOrder?.(category) ?? null;
    const mergedFieldOrder = fieldKeyOrderRow
      ? JSON.parse(fieldKeyOrderRow.order_json)
      : buildGroupedFieldOrder(baseFieldOrder, mergedFields, savedFieldGroups);
    const cleanFieldOrder = mergedFieldOrder.filter((key) => !String(key).startsWith('__grp::'));
    const labels = buildLabelsFromFields(mergedFields, cleanFieldOrder);

    // WHY: Hash-based staleness — immune to timestamp races.
    // Timestamp comparison breaks because compileProcessCompletion (which may
    // bump updated_at) always runs AFTER the compile writes manifest.generated_at,
    // and the frontend auto-save can fire right after compile too.
    // Hash comparison: if current map_hash === the hash the compiler used
    // (source_map_hash), the compiled artifacts are up-to-date.
    const sourceMapHash = compiledRules?.source_map_hash || null;
    const currentMapHash = sqlRow?.map_hash || null;
    const compileStale = Boolean(
      currentMapHash && (!sourceMapHash || currentMapHash !== sourceMapHash)
    );

    return {
      mergedFields,
      mergedFieldOrder,
      cleanFieldOrder,
      labels,
      compiledAt,
      mapSavedAt,
      compileStale,
    };
  }

  async function getSessionRules(category) {
    if (cache.has(category)) return cache.get(category);
    const entry = await loadAndMerge(category);
    cache.set(category, entry);
    return entry;
  }

  function invalidateSessionCache(category) {
    if (category) {
      cache.delete(category);
    } else {
      cache.clear();
    }
  }

  return { getSessionRules, invalidateSessionCache };
}
