import path from 'node:path';
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
    // WHY: Legacy path — derive group order from first occurrence in fieldOrder.
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

  // WHY: field_groups-driven path — use explicit group list for order and empty group preservation.
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

export function createSessionCache({
  loadCategoryConfig,
  getSpecDb,
  readJsonIfExists,
  statFile,
  helperRoot
}) {
  const cache = new Map();

  function fieldStudioMapPath(category) {
    return path.join(helperRoot, category, '_control_plane', 'field_studio_map.json');
  }

  function fieldKeyOrderPath(category) {
    return path.join(helperRoot, category, '_control_plane', 'field_key_order.json');
  }

  function manifestPath(category) {
    return path.join(helperRoot, category, '_generated', 'manifest.json');
  }

  function keyMigrationsPath(category) {
    return path.join(helperRoot, category, '_generated', 'key_migrations.json');
  }

  // WHY: JSON fallback for seed migration — reads from file when SQL is empty.
  async function readStudioMapSnapshot(category) {
    const candidate = fieldStudioMapPath(category);
    const map = await readJsonIfExists(candidate);
    if (isObject(map)) {
      let savedAt = null;
      if (typeof statFile === 'function') {
        try {
          const stat = await statFile(candidate);
          savedAt = stat?.mtime ? new Date(stat.mtime).toISOString() : null;
        } catch {
          savedAt = null;
        }
      }
      return { path: candidate, map, savedAt };
    }
    return { path: fieldStudioMapPath(category), map: {}, savedAt: null };
  }

  async function loadAndMerge(category) {
    const catConfig = await loadCategoryConfig(category).catch(() => ({}));
    const compiledFields = catConfig?.fieldRules?.fields || {};
    const compiledOrder = catConfig?.fieldOrder || Object.keys(compiledFields);
    const manifest = await readJsonIfExists(manifestPath(category));
    const compiledAt = manifest?.generated_at || null;

    // WHY: SQL is the primary source for field_studio_map.
    // Falls back to JSON file for seed migration (one-time per category).
    const specDb = typeof getSpecDb === 'function' ? getSpecDb(category) : null;
    const sqlRow = specDb?.getFieldStudioMap?.() ?? null;
    let savedMap = {};
    let mapSavedAt = null;

    if (sqlRow) {
      try { savedMap = JSON.parse(sqlRow.map_json); } catch { savedMap = {}; }
      mapSavedAt = sqlRow.updated_at || null;
    } else {
      // Seed from JSON file (one-time migration)
      const studioMapSnapshot = await readStudioMapSnapshot(category);
      savedMap = isObject(studioMapSnapshot.map) ? studioMapSnapshot.map : {};
      mapSavedAt = studioMapSnapshot.savedAt;
      // Persist to SQL for future reads
      if (specDb && Object.keys(savedMap).length > 0) {
        try {
          const { hashJson } = await import('../ingest/compileUtils.js');
          specDb.upsertFieldStudioMap(JSON.stringify(savedMap), hashJson(savedMap));
        } catch { /* seed best-effort */ }
      }
    }

    const keyMigrations = await readJsonIfExists(keyMigrationsPath(category));
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
    // When populated, it IS the full mergedFieldOrder (already has __grp:: markers).
    // Fallback chain: SQL → JSON file → computed from field_groups/compiled order.
    const fieldKeyOrderRow = specDb?.getFieldKeyOrder?.(category) ?? null;
    let mergedFieldOrder;
    if (fieldKeyOrderRow) {
      mergedFieldOrder = JSON.parse(fieldKeyOrderRow.order_json);
    } else {
      // WHY: JSON fallback for post-rebuild — reads exported order from _control_plane/
      const fieldKeyOrderJson = await readJsonIfExists(fieldKeyOrderPath(category));
      if (fieldKeyOrderJson && Array.isArray(fieldKeyOrderJson.order) && fieldKeyOrderJson.order.length > 0) {
        mergedFieldOrder = fieldKeyOrderJson.order;
        // WHY: Re-populate SQL from JSON so subsequent reads are fast-path
        if (specDb?.setFieldKeyOrder) {
          try { specDb.setFieldKeyOrder(category, JSON.stringify(fieldKeyOrderJson.order)); } catch { /* best-effort */ }
        }
      } else {
        mergedFieldOrder = buildGroupedFieldOrder(baseFieldOrder, mergedFields, savedFieldGroups);
      }
    }
    const cleanFieldOrder = mergedFieldOrder.filter((key) => !String(key).startsWith('__grp::'));
    const labels = buildLabelsFromFields(mergedFields, cleanFieldOrder);

    // WHY: both timestamps live in DB. map updated_at changes only when
    // auto-save detects a real content change (fingerprint dedup).
    // If map was saved after compile → stale. Simple.
    // parseUtcTimestamp normalises SQLite's bare datetime('now') format
    // so the comparison isn't poisoned by the host's timezone offset.
    const mapTs = parseUtcTimestamp(mapSavedAt);
    const compileTs = parseUtcTimestamp(compiledAt);
    const compileStale = Boolean(
      mapTs && (!compileTs || mapTs > compileTs)
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
