import {
  isObject,
  toArray,
  normalizeText,
  normalizeToken,
  normalizeFieldKey
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
  for (const [rawField, row] of Object.entries(enums)) {
    const field = normalizeFieldKey(rawField);
    if (!field || !row) {
      continue;
    }
    const fieldMap = new Map();
    for (const entry of toArray(row.values)) {
      if (isObject(entry)) {
        const canonical = normalizeText(entry.canonical || entry.value || '');
        if (!canonical) {
          continue;
        }
        fieldMap.set(normalizeToken(canonical), canonical);
        for (const alias of toArray(entry.aliases)) {
          const token = normalizeToken(alias);
          if (token) {
            fieldMap.set(token, canonical);
          }
        }
      } else {
        const canonical = normalizeText(entry);
        if (!canonical) {
          continue;
        }
        fieldMap.set(normalizeToken(canonical), canonical);
      }
    }
    out.set(field, {
      policy: normalizeToken(row.policy || 'open') || 'open',
      index: fieldMap
    });
  }
  return out;
}

export function buildRuleEnumSpec(rule = {}) {
  const out = new Map();
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
      out.set(normalizeToken(canonical), canonical);
      for (const alias of toArray(entry.aliases)) {
        const aliasToken = normalizeToken(alias);
        if (aliasToken) {
          out.set(aliasToken, canonical);
        }
      }
      continue;
    }
    const canonical = normalizeText(entry);
    if (!canonical) {
      continue;
    }
    out.set(normalizeToken(canonical), canonical);
  }

  const aliasCandidates = [rule?.aliases, rule?.enum?.aliases, rule?.contract?.aliases];
  for (const aliasMap of aliasCandidates) {
    if (!isObject(aliasMap)) {
      continue;
    }
    for (const [alias, canonicalRaw] of Object.entries(aliasMap)) {
      const aliasToken = normalizeToken(alias);
      const canonical = normalizeText(canonicalRaw);
      if (!aliasToken || !canonical) {
        continue;
      }
      out.set(aliasToken, canonical);
    }
  }

  return {
    policy: normalizeToken(rule.enum_policy || rule?.enum?.policy || 'open') || 'open',
    index: out
  };
}
