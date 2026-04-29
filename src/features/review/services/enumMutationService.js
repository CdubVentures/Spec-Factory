import fs from 'node:fs';
import path from 'node:path';
import { normalizeKnownValueMatchKey } from '../../../shared/primitives.js';

export function normalizeEnumToken(value) {
  return normalizeKnownValueMatchKey(value);
}

export function hasMeaningfulEnumValue(value) {
  const token = normalizeEnumToken(value);
  if (value == null) return false;
  return token !== '' && token !== 'unknown' && token !== 'n/a' && token !== 'null';
}

export function dedupeEnumValues(values = []) {
  const seen = new Set();
  const output = [];
  for (const rawValue of values) {
    const text = String(rawValue ?? '').trim();
    if (!hasMeaningfulEnumValue(text)) continue;
    const token = normalizeEnumToken(text);
    if (seen.has(token)) continue;
    seen.add(token);
    output.push(text);
  }
  return output;
}

export function validateEnumCandidate({
  candidateRow,
  candidateId,
  field,
  resolvedValue,
  isMeaningfulValue,
  normalizeLower,
  valueMismatchMessage,
  allowValueMismatch = false,
}) {
  if (String(candidateRow?.field_key || '').trim() !== String(field || '').trim()) {
    return {
      error: 'candidate_context_mismatch',
      message: `candidate_id '${candidateId}' does not belong to enum field '${field}'.`,
    };
  }
  const candidateValueToken = String(candidateRow?.value ?? '').trim();
  if (
    !allowValueMismatch
    && (
    isMeaningfulValue(candidateValueToken)
    && normalizeEnumToken(candidateValueToken) !== normalizeEnumToken(resolvedValue)
    )
  ) {
    return {
      error: 'candidate_value_mismatch',
      message: valueMismatchMessage,
    };
  }
  return null;
}

export function upsertEnumListValueAndFetch({
  runtimeSpecDb,
  field,
  value,
  normalizedValue,
  upsertValues,
}) {
  runtimeSpecDb.upsertListValue({
    fieldKey: field,
    value,
    normalizedValue,
    ...(upsertValues || {}),
  });
  return runtimeSpecDb.getListValueByFieldAndValue(field, value);
}

export function resolveEnumPreAffectedProductIds(runtimeSpecDb, listValueId) {
  try {
    const preRows = runtimeSpecDb.getProductsByListValueId(listValueId) || [];
    return [...new Set(preRows.map((row) => row?.product_id).filter(Boolean))];
  } catch {
    return [];
  }
}

export function resolveEnumRequiredCandidate({
  action,
  requestedCandidateId,
}) {
  const needsCandidateAction = action === 'accept' || action === 'confirm';
  if (!needsCandidateAction) return null;
  if (!requestedCandidateId) {
    return {
      status: 400,
      payload: {
        error: 'candidate_id_required',
        message: `candidateId is required for enum ${action}.`,
      },
    };
  }
  return null;
}

function readJsonIfExists(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

function writeJson(filePath, doc) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(doc, null, 2));
}

function categoryAuthorityRoot(config = {}) {
  return path.resolve(config?.categoryAuthorityRoot || 'category_authority');
}

function outputRoot(config = {}) {
  return config?.localOutputRoot || path.resolve('.workspace', 'output');
}

function fieldStudioMapPath({ category, config }) {
  return path.join(categoryAuthorityRoot(config), category, '_control_plane', 'field_studio_map.json');
}

function discoveredEnumsPath({ category, config }) {
  return path.join(outputRoot(config), category, 'discovered_enums.json');
}

function enumSuggestionsPath({ category, config }) {
  return path.join(categoryAuthorityRoot(config), category, '_suggestions', 'enums.json');
}

function valuesKeyForDataList(entry) {
  if (Array.isArray(entry?.manual_values)) return 'manual_values';
  if (Array.isArray(entry?.values)) return 'values';
  return '';
}

function rewriteValues(values, value, replacement = null) {
  const target = normalizeEnumToken(value);
  const next = [];
  const seen = new Set();
  let changed = false;
  for (const rawValue of values || []) {
    const token = normalizeEnumToken(rawValue);
    if (token !== target) {
      if (!seen.has(token)) {
        next.push(rawValue);
        seen.add(token);
      }
      continue;
    }
    changed = true;
    if (replacement == null) continue;
    const replacementText = String(replacement || '').trim();
    const replacementToken = normalizeEnumToken(replacementText);
    if (!replacementToken || seen.has(replacementToken)) continue;
    next.push(replacementText);
    seen.add(replacementToken);
  }
  return { values: next, changed };
}

function mutateFieldStudioMap({ category, field, value, replacement, config }) {
  const filePath = fieldStudioMapPath({ category, config });
  const doc = readJsonIfExists(filePath);
  if (!doc || typeof doc !== 'object') return false;
  let changed = false;
  for (const collectionKey of ['data_lists', 'enum_lists']) {
    if (!Array.isArray(doc[collectionKey])) continue;
    doc[collectionKey] = doc[collectionKey].map((entry) => {
      if (String(entry?.field || '').trim() !== field) return entry;
      const key = valuesKeyForDataList(entry);
      if (!key) return entry;
      const rewritten = rewriteValues(entry[key], value, replacement);
      if (!rewritten.changed) return entry;
      changed = true;
      return { ...entry, [key]: rewritten.values };
    });
  }
  if (!changed) return false;
  writeJson(filePath, doc);
  return true;
}

function rewriteDiscoveredEntries(entries, value, replacement = null) {
  const target = normalizeEnumToken(value);
  const next = [];
  const seen = new Set();
  let changed = false;
  for (const entry of entries || []) {
    const token = normalizeEnumToken(entry?.value);
    if (token !== target) {
      if (!seen.has(token)) {
        next.push(entry);
        seen.add(token);
      }
      continue;
    }
    changed = true;
    if (replacement == null) continue;
    const replacementText = String(replacement || '').trim();
    const replacementToken = normalizeEnumToken(replacementText);
    if (!replacementToken || seen.has(replacementToken)) continue;
    next.push({ ...entry, value: replacementText });
    seen.add(replacementToken);
  }
  return { entries: next, changed };
}

function mutateDiscoveredEnums({ category, field, value, replacement, config }) {
  const filePath = discoveredEnumsPath({ category, config });
  const doc = readJsonIfExists(filePath);
  if (!doc?.values || typeof doc.values !== 'object' || !Array.isArray(doc.values[field])) return false;
  const rewritten = rewriteDiscoveredEntries(doc.values[field], value, replacement);
  if (!rewritten.changed) return false;
  doc.values[field] = rewritten.entries;
  doc.updated_at = new Date().toISOString();
  writeJson(filePath, doc);
  return true;
}

function mutateSuggestions({ category, field, value, replacement, config }) {
  const filePath = enumSuggestionsPath({ category, config });
  const doc = readJsonIfExists(filePath);
  if (!Array.isArray(doc?.suggestions)) return false;
  const target = normalizeEnumToken(value);
  let changed = false;
  doc.suggestions = doc.suggestions.map((entry) => {
    const entryField = String(entry?.field_key || '').trim();
    const entryValue = normalizeEnumToken(entry?.value);
    const status = String(entry?.status || 'pending').trim().toLowerCase();
    if (entryField !== field || entryValue !== target || status !== 'pending') return entry;
    changed = true;
    if (replacement == null) {
      return { ...entry, status: 'deleted', deleted_at: new Date().toISOString() };
    }
    return { ...entry, value: String(replacement || '').trim(), updated_at: new Date().toISOString() };
  });
  if (!changed) return false;
  writeJson(filePath, doc);
  return true;
}

function mutateDurableEnumSources({ category, field, value, replacement = null, config = {} }) {
  const cat = String(category || '').trim();
  const fieldKey = String(field || '').trim();
  const enumValue = String(value || '').trim();
  if (!cat || !fieldKey || !enumValue) {
    return { changed: false, sources: [] };
  }
  const sources = [];
  if (mutateFieldStudioMap({ category: cat, field: fieldKey, value: enumValue, replacement, config })) {
    sources.push('field_studio_map');
  }
  if (mutateDiscoveredEnums({ category: cat, field: fieldKey, value: enumValue, replacement, config })) {
    sources.push('discovered_enums');
  }
  if (mutateSuggestions({ category: cat, field: fieldKey, value: enumValue, replacement, config })) {
    sources.push('suggestions');
  }
  return { changed: sources.length > 0, sources };
}

export function removeEnumValueFromDurableSources({ category, field, value, config = {} }) {
  return mutateDurableEnumSources({ category, field, value, config });
}

export function renameEnumValueInDurableSources({ category, field, oldValue, newValue, config = {} }) {
  const replacement = String(newValue || '').trim();
  if (!replacement) return { changed: false, sources: [] };
  return mutateDurableEnumSources({
    category,
    field,
    value: oldValue,
    replacement,
    config,
  });
}

