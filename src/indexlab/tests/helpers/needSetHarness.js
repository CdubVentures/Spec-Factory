import {
  computeNeedSet,
  normalizeFieldKey,
  buildAllAliases,
  shardAliases,
  availabilityRank,
  difficultyRank,
  requiredLevelRank,
  deriveQueryFamilies,
} from '../../../features/indexing/pipeline/needSet/needsetEngine.js';

export {
  computeNeedSet,
  normalizeFieldKey,
  buildAllAliases,
  shardAliases,
  availabilityRank,
  difficultyRank,
  requiredLevelRank,
  deriveQueryFamilies,
};

export function makeIdentityLocked() {
  return {
    status: 'locked',
    confidence: 0.99,
    identity_gate_validated: true,
    extraction_gate_open: true,
    publishable: true,
    family_model_count: 1,
    ambiguity_level: 'easy',
    publish_blockers: [],
    reason_codes: [],
    page_count: 3,
    max_match_score: 0.99,
  };
}

export function makeIdentityUnlocked() {
  return {
    status: 'unlocked',
    confidence: 0.3,
    identity_gate_validated: false,
    extraction_gate_open: false,
    publishable: false,
    family_model_count: 5,
    ambiguity_level: 'hard',
    publish_blockers: ['identity_not_validated'],
    reason_codes: [],
    page_count: 0,
    max_match_score: 0.3,
  };
}

export function makeIdentityConflict() {
  return {
    status: 'conflict',
    confidence: 0.32,
    identity_gate_validated: false,
    extraction_gate_open: false,
    publishable: false,
    family_model_count: 5,
    ambiguity_level: 'hard',
    publish_blockers: ['identity_conflict'],
    reason_codes: ['identity_conflict'],
    page_count: 0,
    max_match_score: 0.32,
  };
}

export function makeBaseRules() {
  return {
    weight: {
      required_level: 'required',
      evidence: { min_evidence_refs: 2, tier_preference: [1, 2] },
      search_hints: {
        query_terms: ['weight', 'grams'],
        content_types: ['spec_sheet', 'product_page'],
        domain_hints: ['rtings.com'],
      },
    },
    sensor: {
      required_level: 'critical',
      evidence: { min_evidence_refs: 2, tier_preference: [1] },
      search_hints: {
        query_terms: ['sensor', 'optical sensor'],
        content_types: ['spec_sheet', 'review'],
        domain_hints: ['sensor.fyi', 'techpowerup.com'],
      },
    },
    dpi_max: {
      required_level: 'required',
      evidence: { min_evidence_refs: 1, tier_preference: [1, 2] },
      search_hints: {
        query_terms: ['dpi', 'max dpi', 'cpi'],
        content_types: ['spec_sheet'],
        domain_hints: [],
      },
    },
    rgb: {
      required_level: 'optional',
      evidence: { min_evidence_refs: 1 },
      search_hints: {
        query_terms: ['rgb', 'lighting'],
        content_types: ['product_page'],
        domain_hints: [],
      },
    },
    brand: {
      required_level: 'identity',
      evidence: { min_evidence_refs: 1, tier_preference: [1] },
      search_hints: {
        query_terms: ['brand', 'manufacturer'],
        content_types: ['product_page'],
        domain_hints: [],
      },
    },
  };
}

export function makeBaseInput(overrides = {}) {
  return {
    runId: 'r_test',
    category: 'mouse',
    productId: 'test-mouse',
    fieldOrder: ['weight', 'sensor', 'dpi_max', 'rgb', 'brand'],
    provenance: {},
    fieldRules: makeBaseRules(),
    fieldReasoning: {},
    constraintAnalysis: {},
    identityContext: makeIdentityLocked(),
    now: '2026-02-20T00:00:00Z',
    ...overrides,
  };
}
