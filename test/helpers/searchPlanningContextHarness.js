import {
  buildSearchPlanningContext,
  buildGroupDescriptionShort,
  buildGroupDescriptionLong,
  buildGroupFingerprintFine,
  computeGroupQueryCount,
  isGroupSearchWorthy,
  buildNormalizedKeyQueue,
  deriveSeedStatus,
  computeTierAllocation,
} from '../../src/indexlab/searchPlanningContext.js';

export {
  buildSearchPlanningContext,
  buildGroupDescriptionShort,
  buildGroupDescriptionLong,
  buildGroupFingerprintFine,
  computeGroupQueryCount,
  isGroupSearchWorthy,
  buildNormalizedKeyQueue,
  deriveSeedStatus,
  computeTierAllocation,
};

export function makeField(overrides = {}) {
  return {
    field_key: 'test_field',
    label: 'Test Field',
    group_key: null,
    required_level: 'optional',
    idx: {
      min_evidence_refs: 0,
      query_terms: [],
      domain_hints: [],
      preferred_content_types: [],
      tooltip_md: null,
      aliases: [],
    },
    state: 'unknown',
    value: 'unk',
    confidence: 0,
    effective_confidence: 0,
    refs_found: 0,
    min_refs: 0,
    best_tier_seen: null,
    pass_target: 0.8,
    meets_pass_target: false,
    exact_match_required: false,
    need_score: 10,
    reasons: ['missing'],
    history: {
      existing_queries: [],
      domains_tried: [],
      host_classes_tried: [],
      evidence_classes_tried: [],
      query_count: 0,
      urls_examined_count: 0,
      refs_found: 0,
      no_value_attempts: 0,
      duplicate_attempts_suppressed: 0,
    },
    ...overrides,
  };
}

export function makeNeedSetOutput(overrides = {}) {
  return {
    schema_version: 'needset_output.v2',
    round: 0,
    identity: {
      state: 'unknown',
      source_label_state: 'unknown',
      manufacturer: null,
      model: null,
      confidence: 0,
      official_domain: null,
      support_domain: null,
    },
    fields: [],
    planner_seed: {
      missing_critical_fields: [],
      unresolved_fields: [],
      existing_queries: [],
      current_product_identity: { category: 'mouse', brand: '', model: '' },
    },
    run_id: 'run_001',
    category: 'mouse',
    product_id: 'prod_001',
    generated_at: '2026-03-12T00:00:00.000Z',
    total_fields: 0,
    summary: {
      total: 0,
      resolved: 0,
      core_total: 0,
      core_unresolved: 0,
      secondary_total: 0,
      secondary_unresolved: 0,
      optional_total: 0,
      optional_unresolved: 0,
      conflicts: 0,
      bundles_planned: 0,
    },
    blockers: { missing: 0, weak: 0, conflict: 0, needs_exact_match: 0, search_exhausted: 0 },
    focus_fields: [],
    bundles: [],
    profile_mix: {},
    rows: [],
    deltas: [],
    debug: {},
    ...overrides,
  };
}

export function makeFieldGroupsData(overrides = {}) {
  return {
    category: 'mouse',
    groups: [],
    group_index: {},
    version: 1,
    ...overrides,
  };
}

export function makeRunContext(overrides = {}) {
  return {
    run_id: 'run_001',
    category: 'mouse',
    product_id: 'prod_001',
    brand: 'TestBrand',
    model: 'TestModel',
    round: 0,
    ...overrides,
  };
}

export function makeSeedStatus(overrides = {}) {
  return {
    brand_seed: { is_needed: false, brand_name: '' },
    specs_seed: { is_needed: true, last_status: 'never_run' },
    source_seeds: {},
    query_completion_summary: { total_queries: 0, complete: 0, incomplete: 0, pending_scrapes: 0 },
    ...overrides,
  };
}

export function makeFocusGroup(key, overrides = {}) {
  return {
    key,
    phase: 'now',
    group_search_worthy: true,
    productivity_score: 50,
    normalized_key_queue: [],
    ...overrides,
  };
}
