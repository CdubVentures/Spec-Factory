import { buildTierAwareFieldRetrieval } from '../../tierAwareRetriever.js';

export function makeEvidenceHit({
  fieldKey = 'weight',
  host = 'source-0.com',
  path = 'page',
  tier = 2,
  method = 'table',
  quote,
  snippetId = 'sn_0',
  identityMatch = true,
  identityScore = identityMatch ? 0.9 : 0.1,
  ...overrides
} = {}) {
  return {
    origin_field: fieldKey,
    url: `https://${host}/${path}`,
    host,
    tier,
    method,
    quote: quote || `${fieldKey}: value`,
    snippet_id: snippetId,
    source_identity_match: identityMatch,
    source_identity_score: identityScore,
    ...overrides,
  };
}

export function makeEvidencePool({ fieldKey = 'weight', count = 5, identityMatch = true } = {}) {
  return Array.from({ length: count }, (_, index) =>
    makeEvidenceHit({
      fieldKey,
      host: `source-${index}.com`,
      path: 'page',
      tier: (index % 3) + 1,
      quote: `${fieldKey}: value ${index}`,
      snippetId: `sn_${index}`,
      identityMatch,
    })
  );
}

export function runRetrieval({
  fieldKey = 'weight',
  needRow = {},
  fieldRule = {},
  evidencePool = [],
  identity = {},
  ...options
} = {}) {
  const defaultFieldRule =
    fieldKey === 'weight'
      ? { search_hints: { query_terms: ['weight', 'grams'] }, unit: 'g' }
      : {};

  return buildTierAwareFieldRetrieval({
    fieldKey,
    needRow: {
      field_key: fieldKey,
      need_score: 10,
      required_level: 'required',
      min_refs: 1,
      ...needRow,
    },
    fieldRule: {
      ...defaultFieldRule,
      ...fieldRule,
      search_hints: fieldRule.search_hints ?? defaultFieldRule.search_hints,
    },
    evidencePool,
    identity: {
      brand: 'Test',
      model: 'Product',
      ...identity,
    },
    ...options,
  });
}
