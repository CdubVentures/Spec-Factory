import {
  isObject,
  toArray,
  normalizeText,
  normalizeToken,
  normalizeFieldKey,
  normalizeKnownValueMatchKey
} from './engineTextHelpers.js';

export function groupKey(rule = {}) {
  return normalizeFieldKey(rule.group || rule?.ui?.group || 'general') || 'general';
}

export function buildUiGroupIndex(uiFieldCatalog = {}) {
  const out = new Map();
  const rows = Array.isArray(uiFieldCatalog?.fields) ? uiFieldCatalog.fields : [];
  for (const row of rows) {
    if (!isObject(row)) {
      continue;
    }
    const key = normalizeFieldKey(row.key || row.field_key || '');
    const group = normalizeFieldKey(row.group || row.group_key || '');
    if (!key || !group) {
      continue;
    }
    out.set(key, group);
  }
  return out;
}

export function buildEnumIndex(knownValues = {}) {
  const out = new Map();
  const enums = isObject(knownValues.enums) ? knownValues.enums : {};
  const addKnownValue = (fieldMap, ambiguous, token, canonical) => {
    if (!token || !canonical || ambiguous.has(token)) {
      return;
    }
    const existing = fieldMap.get(token);
    if (!existing) {
      fieldMap.set(token, canonical);
      return;
    }
    if (existing === canonical) {
      return;
    }
    fieldMap.delete(token);
    ambiguous.add(token);
  };
  for (const [rawField, row] of Object.entries(enums)) {
    const field = normalizeFieldKey(rawField);
    if (!field || !row) {
      continue;
    }
    const fieldMap = new Map();
    const ambiguous = new Set();
    for (const entry of toArray(row.values)) {
      if (isObject(entry)) {
        const canonical = normalizeText(entry.canonical || entry.value || '');
        if (!canonical) {
          continue;
        }
        addKnownValue(fieldMap, ambiguous, normalizeKnownValueMatchKey(canonical), canonical);
        for (const alias of toArray(entry.aliases)) {
          const token = normalizeKnownValueMatchKey(alias);
          if (token) {
            addKnownValue(fieldMap, ambiguous, token, canonical);
          }
        }
      } else {
        const canonical = normalizeText(entry);
        if (!canonical) {
          continue;
        }
        addKnownValue(fieldMap, ambiguous, normalizeKnownValueMatchKey(canonical), canonical);
      }
    }
    out.set(field, {
      policy: normalizeToken(row.policy || 'open') || 'open',
      index: fieldMap,
      ambiguous
    });
  }
  return out;
}

export function buildRuleEnumSpec(rule = {}) {
  const out = new Map();
  const ambiguous = new Set();
  const addKnownValue = (token, canonical) => {
    if (!token || !canonical || ambiguous.has(token)) {
      return;
    }
    const existing = out.get(token);
    if (!existing) {
      out.set(token, canonical);
      return;
    }
    if (existing === canonical) {
      return;
    }
    out.delete(token);
    ambiguous.add(token);
  };
  const enumCandidates = [
    ...toArray(rule?.enum),
    ...toArray(rule?.contract?.enum),
    ...toArray(rule?.validate?.enum)
  ];

  for (const entry of enumCandidates) {
    if (isObject(entry)) {
      const canonical = normalizeText(entry.canonical || entry.value || '');
      if (!canonical) {
        continue;
      }
      addKnownValue(normalizeKnownValueMatchKey(canonical), canonical);
      for (const alias of toArray(entry.aliases)) {
        const aliasToken = normalizeKnownValueMatchKey(alias);
        if (aliasToken) {
          addKnownValue(aliasToken, canonical);
        }
      }
      continue;
    }
    const canonical = normalizeText(entry);
    if (!canonical) {
      continue;
    }
    addKnownValue(normalizeKnownValueMatchKey(canonical), canonical);
  }

  const aliasCandidates = [rule?.aliases, rule?.enum?.aliases, rule?.contract?.aliases];
  for (const aliasMap of aliasCandidates) {
    if (!isObject(aliasMap)) {
      continue;
    }
    for (const [alias, canonicalRaw] of Object.entries(aliasMap)) {
      const aliasToken = normalizeKnownValueMatchKey(alias);
      const canonical = normalizeText(canonicalRaw);
      if (!aliasToken || !canonical) {
        continue;
      }
      addKnownValue(aliasToken, canonical);
    }
  }

  return {
    policy: normalizeToken(rule.enum_policy || rule?.enum?.policy || 'open') || 'open',
    index: out,
    ambiguous
  };
}
