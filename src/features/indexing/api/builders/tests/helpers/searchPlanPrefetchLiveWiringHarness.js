export { buildPreFetchPhases } from '../../runtimeOpsDataBuilders.js';
export { toNeedSetSnapshot } from '../../../../../../indexlab/runtimeBridgePayloads.js';

export function makeEvent(event, payload = {}, overrides = {}) {
  return {
    run_id: 'run-searchplan-proof',
    ts: '2026-03-16T00:01:00.000Z',
    event,
    payload,
    ...overrides,
  };
}

export function makeMeta(overrides = {}) {
  return {
    run_id: 'run-searchplan-proof',
    category: 'mouse',
    product_id: 'mouse-razer-viper-v3-pro',
    started_at: '2026-03-16T00:00:00.000Z',
    status: 'running',
    ...overrides,
  };
}

// Shared search-plan panel fixture mirroring searchPlanBuilder output shape.
export function makeSearchPlanPanel() {
  return {
    round: 0,
    identity: { state: 'locked', confidence: 0.95, brand: 'Razer', model: 'Viper V3 Pro' },
    summary: {
      total: 42,
      resolved: 18,
      core_total: 15,
      core_resolved: 8,
      secondary_total: 20,
      secondary_resolved: 8,
      optional_total: 7,
      optional_resolved: 2,
    },
    blockers: { missing: 12, weak: 7, conflict: 3 },
    bundles: [
      {
        key: 'manufacturer_html',
        label: 'Manufacturer HTML',
        desc: 'Official product page specs',
        source_target: 'razer.com',
        content_target: 'product_page',
        search_intent: 'spec_lookup',
        host_class: 'manufacturer',
        phase: 'now',
        priority: 'core',
        queries: [
          { q: 'Razer Viper V3 Pro specifications', family: 'manufacturer_html' },
          { q: 'Razer Viper V3 Pro weight dimensions', family: 'manufacturer_html' },
        ],
        query_family_mix: { manufacturer_html: 2 },
        reason_active: 'missing core fields in manufacturer scope',
        fields: [
          { field_key: 'weight', state: 'missing', need_score: 0.95 },
          { field_key: 'dimensions', state: 'missing', need_score: 0.88 },
          { field_key: 'sensor', state: 'weak', need_score: 0.72 },
        ],
      },
      {
        key: 'manual_pdf',
        label: 'Manual PDF',
        desc: 'User manual specifications',
        source_target: 'support.razer.com',
        content_target: 'manual',
        search_intent: 'spec_lookup',
        host_class: 'support',
        phase: 'now',
        priority: 'secondary',
        queries: [
          { q: 'Razer Viper V3 Pro user manual PDF', family: 'manual_pdf' },
        ],
        query_family_mix: { manual_pdf: 1 },
        reason_active: 'polling rate details expected in manual',
        fields: [
          { field_key: 'polling_rate', state: 'missing', need_score: 0.65 },
        ],
      },
      {
        key: 'review_lookup',
        label: 'Lab Review',
        desc: 'Professional lab measurement data',
        source_target: 'rtings.com',
        content_target: 'review',
        search_intent: 'measurement_data',
        host_class: 'lab_review',
        phase: 'next',
        priority: 'optional',
        queries: [
          { q: 'Razer Viper V3 Pro rtings review', family: 'review_lookup' },
        ],
        query_family_mix: { review_lookup: 1 },
        reason_active: 'latency measurements available from lab',
        fields: [
          { field_key: 'click_latency', state: 'missing', need_score: 0.40 },
        ],
      },
    ],
    profile_influence: {
      manufacturer_html: 2,
      manual_pdf: 1,
      support_docs: 0,
      review_lookup: 1,
      benchmark_lookup: 0,
      fallback_web: 0,
      targeted_single: 0,
      duplicates_suppressed: 1,
      focused_bundles: 3,
      targeted_exceptions: 0,
      total_queries: 4,
      trusted_host_share: 2,
      docs_manual_share: 1,
    },
    deltas: [
      { field: 'weight', from: 'accepted', to: 'weak' },
      { field: 'sensor', from: 'missing', to: 'weak' },
      { field: 'click_latency', from: null, to: 'missing' },
    ],
  };
}

export function makeSearchPlanFields() {
  return [
    { field_key: 'weight', required_level: 'required', state: 'missing', need_score: 0.95, search_hints: { query_terms: ['weight'] } },
    { field_key: 'dimensions', required_level: 'required', state: 'missing', need_score: 0.88, search_hints: {} },
    { field_key: 'sensor', required_level: 'required', state: 'weak', need_score: 0.72, search_hints: { query_terms: ['sensor'] } },
    { field_key: 'dpi', required_level: 'required', state: 'accepted', need_score: 0, search_hints: {} },
    { field_key: 'polling_rate', required_level: 'secondary', state: 'missing', need_score: 0.65, search_hints: {} },
    { field_key: 'click_latency', required_level: 'optional', state: 'missing', need_score: 0.40, search_hints: {} },
    { field_key: 'lod', required_level: 'optional', state: 'accepted', need_score: 0, search_hints: {} },
  ];
}

export function makePlannerSeed() {
  return {
    identity: { brand: 'Razer', model: 'Viper V3 Pro', aliases: ['RZ01-0490'] },
    product_class: 'gaming_mouse',
    dominant_source_family: 'manufacturer_html',
  };
}

export function makeSearchPlanNeedsetComputedPayload() {
  const panel = makeSearchPlanPanel();
  return {
    ...panel,
    schema_version: 'needset_planner_output.v2',
    scope: 'search_plan',
    fields: makeSearchPlanFields(),
    planner_seed: makePlannerSeed(),
  };
}
