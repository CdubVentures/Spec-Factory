import { isConsumerEnabled } from '../../../field-rules/consumerGate.js';

export function normalizeEnumToken(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function hasMeaningfulEnumValue(value) {
  const token = normalizeEnumToken(value);
  return token !== '' && token !== 'unk' && token !== 'unknown' && token !== 'n/a' && token !== 'null';
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

export function readEnumConsistencyFormatHint(rule = {}) {
  const enumBlock = rule?.enum && typeof rule.enum === 'object' ? rule.enum : {};
  const enumMatch = enumBlock?.match && typeof enumBlock.match === 'object' ? enumBlock.match : {};
  return String(enumMatch?.format_hint || rule?.enum_match_format_hint || '').trim();
}

export function isEnumConsistencyReviewEnabled(rule = {}) {
  return isConsumerEnabled(rule, 'enum.match.strategy', 'review')
    && isConsumerEnabled(rule, 'enum.match.format_hint', 'review');
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
      normalize: 'lower_trim',
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

export function summarizeStudioMapValidation(payload, validateMap) {
  if (typeof validateMap !== 'function') {
    return null;
  }
  try {
    const result = validateMap(payload?.map || {});
    const errors = Array.isArray(result?.errors) ? result.errors.length : 0;
    return {
      valid: Boolean(result?.valid),
      error_count: errors,
    };
  } catch {
    return {
      valid: false,
      error_count: Number.POSITIVE_INFINITY,
    };
  }
}

export function choosePreferredStudioMap(settingsMap, controlPlaneMap, { validateMap = null } = {}) {
  const settingsPayload = settingsMap && typeof settingsMap === 'object' && settingsMap.map && typeof settingsMap.map === 'object'
    ? settingsMap
    : null;
  const controlPayload = controlPlaneMap && typeof controlPlaneMap === 'object' && controlPlaneMap.map && typeof controlPlaneMap.map === 'object'
    ? controlPlaneMap
    : null;
  if (!settingsPayload && !controlPayload) return null;
  if (!settingsPayload) return controlPayload;
  if (!controlPayload) return settingsPayload;

  const settingsValidation = summarizeStudioMapValidation(settingsPayload, validateMap);
  const controlValidation = summarizeStudioMapValidation(controlPayload, validateMap);
  if (settingsValidation && controlValidation) {
    if (controlValidation.valid && !settingsValidation.valid) {
      return controlPayload;
    }
    if (settingsValidation.valid && !controlValidation.valid) {
      return settingsPayload;
    }
    if (!settingsValidation.valid && !controlValidation.valid && settingsValidation.error_count !== controlValidation.error_count) {
      return controlValidation.error_count < settingsValidation.error_count ? controlPayload : settingsPayload;
    }
  }

  const settingsSummary = summarizeStudioMapPayload(settingsPayload.map);
  const controlSummary = summarizeStudioMapPayload(controlPayload.map);

  if (controlSummary.has_mapping_payload && !settingsSummary.has_mapping_payload) {
    return controlPayload;
  }
  if (settingsSummary.has_mapping_payload && !controlSummary.has_mapping_payload) {
    return settingsPayload;
  }
  if (controlSummary.has_mapping_payload && settingsSummary.has_mapping_payload) {
    const settingsScore = (settingsSummary.component_sources * 1000) + (settingsSummary.data_lists * 10) + settingsSummary.enum_lists;
    const controlScore = (controlSummary.component_sources * 1000) + (controlSummary.data_lists * 10) + controlSummary.enum_lists;
    return controlScore >= settingsScore ? controlPayload : settingsPayload;
  }

  const controlKeyCount = Object.keys(controlPayload.map || {}).length;
  const settingsKeyCount = Object.keys(settingsPayload.map || {}).length;
  return controlKeyCount >= settingsKeyCount ? controlPayload : settingsPayload;
}

export async function applyEnumConsistencyToSuggestions({
  fs,
  path,
  helperRoot,
  category,
  field,
  decisions = [],
}) {
  const suggestionsPath = path.join(helperRoot, category, '_suggestions', 'enums.json');
  const currentDoc = await (async () => {
    try {
      return JSON.parse(await fs.readFile(suggestionsPath, 'utf8'));
    } catch {
      return {};
    }
  })();
  const doc = currentDoc && typeof currentDoc === 'object' ? { ...currentDoc } : {};
  const decisionByToken = new Map(
    (Array.isArray(decisions) ? decisions : [])
      .map((row) => {
        const value = String(row?.value || '').trim();
        return [normalizeEnumToken(value), row];
      })
      .filter(([token]) => Boolean(token))
  );

  let mapped = 0;
  let kept = 0;
  let uncertain = 0;
  let changed = 0;

  if (Array.isArray(doc.suggestions)) {
    doc.suggestions = doc.suggestions.map((row) => {
      if (String(row?.field_key || '').trim() !== field) return row;
      const token = normalizeEnumToken(row?.value);
      const decision = decisionByToken.get(token);
      if (!decision) return row;
      const action = String(decision?.decision || '').trim().toLowerCase();
      if (action === 'map_to_existing') {
        mapped += 1;
        changed += 1;
        return {
          ...row,
          status: 'accepted',
          canonical: String(decision?.target_value || '').trim() || row?.canonical || null,
          updated_at: new Date().toISOString(),
          reviewer: 'llm_enum_consistency',
        };
      }
      if (action === 'keep_new') {
        kept += 1;
        changed += 1;
        return {
          ...row,
          status: 'accepted',
          updated_at: new Date().toISOString(),
          reviewer: 'llm_enum_consistency',
        };
      }
      uncertain += 1;
      return row;
    });
  }

  if (doc.fields && typeof doc.fields === 'object') {
    const existing = Array.isArray(doc.fields[field]) ? doc.fields[field].map(String) : [];
    const filtered = existing.filter((value) => {
      const decision = decisionByToken.get(normalizeEnumToken(value));
      if (!decision) return true;
      const action = String(decision?.decision || '').trim().toLowerCase();
      if (action === 'map_to_existing') {
        mapped += 1;
        changed += 1;
        return false;
      }
      if (action === 'keep_new') {
        kept += 1;
        changed += 1;
        return false;
      }
      uncertain += 1;
      return true;
    });
    doc.fields = { ...doc.fields, [field]: filtered };
  }

  doc.updated_at = new Date().toISOString();
  await fs.mkdir(path.dirname(suggestionsPath), { recursive: true });
  await fs.writeFile(suggestionsPath, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  return { mapped, kept, uncertain, changed };
}
