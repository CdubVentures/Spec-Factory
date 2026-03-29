import fs from 'node:fs/promises';
import path from 'node:path';
import { nowIso } from '../shared/primitives.js';
import {
  toArray,
  isObject,
  normalizeText,
  normalizeFieldKey,
  titleFromKey,
  stableSortStrings,
  orderedUniqueStrings,
  stableStringify,
  hashBuffer,
  hashJson
} from './compileUtils.js';
import {
  normalizeFieldStudioMap
} from './compileMapNormalization.js';

export async function writeJsonStable(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${stableStringify(value)}\n`, 'utf8');
}

export async function writeCanonicalFieldRulesPair({
  generatedRoot,
  runtimePayload
}) {
  const canonical = JSON.stringify(runtimePayload, null, 2) + '\n';
  const canonicalBuffer = Buffer.from(canonical, 'utf8');
  const canonicalHash = hashBuffer(canonicalBuffer);
  const canonicalBytes = canonicalBuffer.length;
  const fieldRulesPath = path.join(generatedRoot, 'field_rules.json');

  await fs.mkdir(generatedRoot, { recursive: true });
  await fs.writeFile(fieldRulesPath, canonicalBuffer);

  const fieldRulesWritten = await fs.readFile(fieldRulesPath);
  const fieldRulesHash = hashBuffer(fieldRulesWritten);
  const identical = fieldRulesHash === canonicalHash;

  return {
    field_rules_path: fieldRulesPath,
    field_rules_hash: fieldRulesHash,
    expected_hash: canonicalHash,
    bytes: canonicalBytes,
    identical
  };
}

export function snapshotVersionId() {
  return nowIso()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

export function diffFieldRuleSets(previousRules = {}, currentRules = {}) {
  const previousFields = isObject(previousRules?.fields) ? previousRules.fields : {};
  const currentFields = isObject(currentRules?.fields) ? currentRules.fields : {};
  const previousKeys = stableSortStrings(Object.keys(previousFields));
  const currentKeys = stableSortStrings(Object.keys(currentFields));
  const previousSet = new Set(previousKeys);
  const currentSet = new Set(currentKeys);
  const addedKeys = currentKeys.filter((key) => !previousSet.has(key));
  const removedKeys = previousKeys.filter((key) => !currentSet.has(key));
  const changedKeys = currentKeys.filter((key) => {
    if (!previousSet.has(key)) {
      return false;
    }
    return stableStringify(previousFields[key]) !== stableStringify(currentFields[key]);
  });
  return {
    added_count: addedKeys.length,
    removed_count: removedKeys.length,
    changed_count: changedKeys.length,
    added_keys: addedKeys,
    removed_keys: removedKeys,
    changed_keys: changedKeys
  };
}

// WHY: _versions/ snapshots removed — no rollback mechanism existed, just unbounded disk growth.
// Callers still expect { version_id, path } return shape.
export async function writeControlPlaneSnapshot() {
  return { version_id: null, path: null };
}

export async function readJsonIfExists(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export const FIELD_STUDIO_MAP_FILE_NAME = 'field_studio_map.json';

export function resolveControlPlaneMapPaths(controlPlaneRoot) {
  return {
    fieldStudioPath: path.join(controlPlaneRoot, FIELD_STUDIO_MAP_FILE_NAME),
  };
}

export async function loadFieldStudioMap({
  category,
  config = {},
  mapPath = null
}) {
  const helperRoot = path.resolve(config.categoryAuthorityRoot || 'category_authority');
  const categoryRoot = path.join(helperRoot, category);
  const controlPlaneRoot = path.join(categoryRoot, '_control_plane');
  const mapPaths = mapPath
    ? [path.resolve(mapPath)]
    : (() => {
      const { fieldStudioPath } = resolveControlPlaneMapPaths(controlPlaneRoot);
      return [fieldStudioPath];
    })();

  for (const filePath of mapPaths) {
    const loaded = await readJsonIfExists(filePath);
    if (!loaded) continue;
    return {
      file_path: filePath,
      map: normalizeFieldStudioMap(loaded)
    };
  }
  return null;
}

export async function saveFieldStudioMap({
  category,
  fieldStudioMap = null,
  workbookMap = null,
  config = {},
  mapPath = null
} = {}) {
  const helperRoot = path.resolve(config.categoryAuthorityRoot || 'category_authority');
  const categoryRoot = path.join(helperRoot, category);
  const controlPlaneRoot = path.join(categoryRoot, '_control_plane');
  const { fieldStudioPath } = resolveControlPlaneMapPaths(controlPlaneRoot);
  const filePath = mapPath ? path.resolve(mapPath) : fieldStudioPath;
  const incomingMap = isObject(fieldStudioMap)
    ? fieldStudioMap
    : (isObject(workbookMap) ? workbookMap : {});
  const normalized = normalizeFieldStudioMap(incomingMap);
  await writeJsonStable(filePath, normalized);
  if (!mapPath && filePath !== fieldStudioPath) {
    await writeJsonStable(fieldStudioPath, normalized);
  }
  const snapshot = await writeControlPlaneSnapshot({
    controlPlaneRoot,
    fieldStudioMap: normalized,
    note: 'save-field-studio-map'
  });
  return {
    file_path: filePath,
    map_hash: hashJson(normalized),
    field_studio_map: normalized,
    version_snapshot: snapshot
  };
}

export function normalizeKnownValuesFieldsDoc(knownValuesDoc = {}) {
  if (!isObject(knownValuesDoc)) {
    return {};
  }
  if (isObject(knownValuesDoc.fields)) {
    const out = {};
    for (const [fieldKeyRaw, valuesRaw] of Object.entries(knownValuesDoc.fields)) {
      const fieldKey = normalizeFieldKey(fieldKeyRaw);
      if (!fieldKey) continue;
      out[fieldKey] = orderedUniqueStrings(
        toArray(valuesRaw).map((value) => normalizeText(value)).filter(Boolean)
      );
    }
    return out;
  }
  if (isObject(knownValuesDoc.enums)) {
    const out = {};
    for (const [fieldKeyRaw, enumBlock] of Object.entries(knownValuesDoc.enums)) {
      const fieldKey = normalizeFieldKey(fieldKeyRaw);
      if (!fieldKey) continue;
      const values = toArray(enumBlock?.values)
        .map((value) => (isObject(value) ? normalizeText(value.value || value.canonical || '') : normalizeText(value)))
        .filter(Boolean);
      out[fieldKey] = orderedUniqueStrings(values);
    }
    return out;
  }
  return {};
}

export async function loadGeneratedComponentDbForCompile(generatedRoot) {
  const componentRoot = path.join(generatedRoot, 'component_db');
  let entries = [];
  try {
    entries = await fs.readdir(componentRoot, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return {};
    }
    throw error;
  }

  const out = {};
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.json')) {
      continue;
    }
    const payload = await readJsonIfExists(path.join(componentRoot, entry.name));
    if (!isObject(payload)) {
      continue;
    }
    const componentType = normalizeFieldKey(payload.component_type || path.basename(entry.name, '.json'));
    if (!componentType) {
      continue;
    }
    const rows = toArray(payload.items)
      .map((row) => {
        if (!isObject(row)) return null;
        const name = normalizeText(row.name || row.canonical_name || '');
        if (!name) return null;
        const normalized = {
          ...row,
          name,
        };
        if (normalizeText(row?.maker || '')) {
          normalized.maker = normalizeText(row.maker);
        }
        if (Array.isArray(row?.aliases)) {
          normalized.aliases = orderedUniqueStrings(row.aliases.map((value) => normalizeText(value)).filter(Boolean));
        }
        if (Array.isArray(row?.links)) {
          normalized.links = orderedUniqueStrings(row.links.map((value) => normalizeText(value)).filter(Boolean));
        }
        if (!isObject(row?.properties)) {
          normalized.properties = {};
        }
        return normalized;
      })
      .filter(Boolean);
    out[componentType] = rows;
  }
  return out;
}

export function buildFallbackKeyRows({
  map = {},
  baselineFieldRules = null,
  baselineUiFieldCatalog = null
} = {}) {
  const labelByKey = {};
  const orderedBaselineKeys = [];
  const seenBaseline = new Set();

  for (const row of toArray(baselineUiFieldCatalog?.fields)) {
    if (!isObject(row)) continue;
    const key = normalizeFieldKey(row.key || row.canonical_key || '');
    if (!key || seenBaseline.has(key)) continue;
    seenBaseline.add(key);
    orderedBaselineKeys.push(key);
    const label = normalizeText(row.label || row.display_name || '');
    if (label) {
      labelByKey[key] = label;
    }
  }

  const baselineFields = isObject(baselineFieldRules?.fields) ? baselineFieldRules.fields : {};
  for (const [fieldKeyRaw, rule] of Object.entries(baselineFields)) {
    const key = normalizeFieldKey(fieldKeyRaw);
    if (!key) continue;
    if (!seenBaseline.has(key)) {
      seenBaseline.add(key);
      orderedBaselineKeys.push(key);
    }
    if (!labelByKey[key]) {
      labelByKey[key] = normalizeText(rule?.ui?.label || rule?.label || '') || titleFromKey(key);
    }
  }

  const selectedKeys = toArray(map?.selected_keys).map((key) => normalizeFieldKey(key)).filter(Boolean);
  const mapOverrideKeys = Object.keys(isObject(map?.field_overrides) ? map.field_overrides : {})
    .map((key) => normalizeFieldKey(key))
    .filter(Boolean);
  for (const [fieldKeyRaw, rule] of Object.entries(isObject(map?.field_overrides) ? map.field_overrides : {})) {
    const key = normalizeFieldKey(fieldKeyRaw);
    if (!key || labelByKey[key]) continue;
    labelByKey[key] = normalizeText(rule?.ui?.label || rule?.label || '') || titleFromKey(key);
  }

  const orderedKeys = [];
  const seen = new Set();
  const pushKey = (rawKey) => {
    const key = normalizeFieldKey(rawKey);
    if (!key || seen.has(key)) return;
    seen.add(key);
    orderedKeys.push(key);
  };

  if (selectedKeys.length > 0) {
    for (const key of selectedKeys) pushKey(key);
  } else {
    for (const key of orderedBaselineKeys) pushKey(key);
    for (const key of mapOverrideKeys) pushKey(key);
  }

  return orderedKeys.map((key) => ({
    row: 0,
    key,
    label: labelByKey[key] || titleFromKey(key),
  }));
}
