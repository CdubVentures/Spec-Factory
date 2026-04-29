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
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (!hasMeaningfulEnumValue(text)) continue;
    const token = normalizeEnumToken(text);
    if (seen.has(token)) continue;
    seen.add(token);
    output.push(text);
  }
  return output;
}

export function buildPendingEnumValuesFromSuggestions(suggestionsDoc = {}, fieldKey = '') {
  const field = String(fieldKey || '').trim();
  if (!field) return [];
  const pending = [];
  if (suggestionsDoc && typeof suggestionsDoc === 'object') {
    if (Array.isArray(suggestionsDoc?.suggestions)) {
      for (const row of suggestionsDoc.suggestions) {
        if (String(row?.field_key || '').trim() !== field) continue;
        const status = String(row?.status || 'pending').trim().toLowerCase();
        if (status && status !== 'pending') continue;
        pending.push(String(row?.value || '').trim());
      }
    }
    if (suggestionsDoc.fields && typeof suggestionsDoc.fields === 'object') {
      const rows = Array.isArray(suggestionsDoc.fields[field]) ? suggestionsDoc.fields[field] : [];
      for (const row of rows) {
        pending.push(String(row || '').trim());
      }
    }
  }
  return dedupeEnumValues(pending);
}

export function normalizeComponentAliasList(aliasRows = []) {
  const seen = new Set();
  const aliases = [];
  for (const aliasRow of aliasRows) {
    const alias = String(aliasRow?.alias ?? aliasRow ?? '').trim();
    if (!alias) continue;
    const token = alias.toLowerCase();
    if (seen.has(token)) continue;
    seen.add(token);
    aliases.push(alias);
  }
  return aliases;
}

export function buildStudioKnownValuesPayload({
  category = '',
  fields = {},
  source = '',
}) {
  const normalizedFields = {};
  for (const [rawFieldKey, rawValues] of Object.entries(fields || {})) {
    const fieldKey = String(rawFieldKey || '').trim();
    if (!fieldKey) continue;
    const values = dedupeEnumValues(Array.isArray(rawValues) ? rawValues : [rawValues])
      .sort((a, b) => a.localeCompare(b));
    normalizedFields[fieldKey] = values;
  }
  const enumLists = Object.entries(normalizedFields)
    .map(([field, values]) => ({
      field,
      values,
    }))
    .sort((a, b) => a.field.localeCompare(b.field));
  return {
    category: String(category || '').trim(),
    source: String(source || '').trim() || null,
    fields: normalizedFields,
    enum_lists: enumLists,
  };
}

export function buildStudioKnownValuesFromSpecDb(runtimeSpecDb, category) {
  if (!runtimeSpecDb) return null;
  if (typeof runtimeSpecDb.getAllEnumFields !== 'function') return null;
  if (typeof runtimeSpecDb.getListValues !== 'function') return null;
  const fields = {};
  const fieldKeys = runtimeSpecDb.getAllEnumFields();
  for (const rawFieldKey of fieldKeys) {
    const fieldKey = String(rawFieldKey || '').trim();
    if (!fieldKey) continue;
    const listRows = runtimeSpecDb.getListValues(fieldKey) || [];
    fields[fieldKey] = listRows.map((row) => row?.value);
  }
  return buildStudioKnownValuesPayload({
    category,
    fields,
    source: 'specdb',
  });
}

export function buildStudioComponentDbFromSpecDb(runtimeSpecDb) {
  if (!runtimeSpecDb) return null;
  if (typeof runtimeSpecDb.getComponentTypeList !== 'function') return null;
  if (typeof runtimeSpecDb.getAllComponentsForType !== 'function') return null;

  const componentTypes = runtimeSpecDb.getComponentTypeList();
  const result = {};
  for (const typeRow of componentTypes) {
    const componentType = String(typeRow?.component_type || '').trim();
    if (!componentType) continue;
    const componentRows = runtimeSpecDb.getAllComponentsForType(componentType);
    const items = [];
    for (const row of componentRows) {
      const name = String(row?.identity?.canonical_name || '').trim();
      if (!name) continue;
      items.push({
        name,
        maker: String(row?.identity?.maker || '').trim(),
        aliases: normalizeComponentAliasList(row?.aliases),
      });
    }
    result[componentType] = items;
  }
  return result;
}

export function summarizeStudioMapPayload(map) {
  const payload = map && typeof map === 'object' && !Array.isArray(map) ? map : {};
  const componentSources = Array.isArray(payload.component_sources) ? payload.component_sources.length : 0;
  const dataLists = Array.isArray(payload.data_lists) ? payload.data_lists.length : 0;
  const enumLists = Array.isArray(payload.enum_lists) ? payload.enum_lists.length : 0;
  return {
    component_sources: componentSources,
    data_lists: dataLists,
    enum_lists: enumLists,
    has_mapping_payload: componentSources > 0 || dataLists > 0 || enumLists > 0,
  };
}
