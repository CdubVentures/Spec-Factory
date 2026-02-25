import path from 'node:path';

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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

function buildGroupedFieldOrder(fieldOrder = [], mergedFields = {}) {
  const grouped = [];
  let currentGroup = '';
  for (const field of fieldOrder) {
    const rule = isObject(mergedFields[field]) ? mergedFields[field] : {};
    const ui = isObject(rule.ui) ? rule.ui : {};
    const group = String(ui.group || rule.group || 'ungrouped').trim() || 'ungrouped';
    if (group !== currentGroup) {
      grouped.push(`__grp::${group}`);
      currentGroup = group;
    }
    grouped.push(field);
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
  readJsonIfExists,
  writeFile,
  mkdir,
  statFile,
  helperRoot
}) {
  const cache = new Map();

  function fieldStudioMapPath(category) {
    return path.join(helperRoot, category, '_control_plane', 'field_studio_map.json');
  }

  function manifestPath(category) {
    return path.join(helperRoot, category, '_generated', 'manifest.json');
  }

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

    const studioMapSnapshot = await readStudioMapSnapshot(category);
    const savedMap = isObject(studioMapSnapshot.map) ? studioMapSnapshot.map : {};
    const mapFieldOverrides = isObject(savedMap.field_overrides) ? savedMap.field_overrides : {};
    const mergedFields = mergeFieldOverrides(compiledFields, mapFieldOverrides);

    const selectedKeys = normalizeFieldOrder(
      Array.isArray(savedMap.selected_keys) ? savedMap.selected_keys : [],
      mergedFields
    );

    const baseFieldOrder = selectedKeys.length > 0
      ? selectedKeys
      : normalizeFieldOrder(compiledOrder, mergedFields);

    const mergedFieldOrder = buildGroupedFieldOrder(baseFieldOrder, mergedFields);
    const cleanFieldOrder = mergedFieldOrder.filter((key) => !String(key).startsWith('__grp::'));
    const labels = buildLabelsFromFields(mergedFields, cleanFieldOrder);

    const mapSavedAt = studioMapSnapshot.savedAt;
    const compileStale = Boolean(mapSavedAt && (!compiledAt || new Date(mapSavedAt) > new Date(compiledAt)));

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

  async function updateSessionRules(category, { fields, fieldOrder }) {
    const snapshot = await readStudioMapSnapshot(category);
    const existingMap = isObject(snapshot.map) ? snapshot.map : {};
    const selectedKeys = Array.isArray(fieldOrder)
      ? fieldOrder
        .map((key) => String(key || '').trim())
        .filter((key) => key && !key.startsWith('__grp::'))
      : Array.isArray(existingMap.selected_keys)
        ? existingMap.selected_keys
        : [];
    const nextMap = {
      ...existingMap,
      ...(isObject(fields)
        ? {
          field_overrides: {
            ...(isObject(existingMap.field_overrides) ? existingMap.field_overrides : {}),
            ...fields,
          },
        }
        : {}),
      selected_keys: selectedKeys,
    };

    const controlPlane = path.join(helperRoot, category, '_control_plane');
    const nextFieldStudioPath = fieldStudioMapPath(category);
    await mkdir(controlPlane, { recursive: true });
    await writeFile(nextFieldStudioPath, JSON.stringify(nextMap, null, 2));

    cache.delete(category);
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

  return { getSessionRules, updateSessionRules, invalidateSessionCache };
}
