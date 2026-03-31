// Shared factories and fetch wiring for searchPlanBuilder test slices.
import assert from 'node:assert/strict';

export function makeIdentity(overrides = {}) {
  return {
    state: 'locked',
    source_label_state: 'matched',
    manufacturer: 'Razer',
    model: 'Viper V3 Pro',
    confidence: 0.99,
    official_domain: 'razer.com',
    support_domain: 'support.razer.com',
    ...overrides
  };
}

export function makeFocusGroup(overrides = {}) {
  return {
    key: 'sensor_performance',
    label: 'Sensor & Performance',
    desc: 'Sensor and performance metrics',
    source_target: 'spec_sheet',
    content_target: 'technical_specs',
    search_intent: 'exact_match',
    host_class: 'lab_review',
    field_keys: ['sensor', 'dpi'],
    satisfied_field_keys: [],
    unresolved_field_keys: ['sensor', 'dpi'],
    weak_field_keys: [],
    conflict_field_keys: [],
    search_exhausted_field_keys: [],
    search_exhausted_count: 0,
    core_unresolved_count: 2,
    secondary_unresolved_count: 0,
    optional_unresolved_count: 0,
    exact_match_count: 0,
    no_value_attempts: 0,
    duplicate_attempts_suppressed: 0,
    urls_examined_count: 0,
    query_count: 0,
    query_terms_union: ['sensor', 'dpi', 'cpi'],
    domain_hints_union: ['razer.com', 'techpowerup.com'],
    preferred_content_types_union: ['spec_sheet'],
    existing_queries_union: [],
    domains_tried_union: [],
    host_classes_tried_union: [],
    evidence_classes_tried_union: [],
    aliases_union: [],
    priority: 'core',
    phase: 'now',
    ...overrides
  };
}

export function makePlannerLimits(overrides = {}) {
  return {
    discoveryEnabled: true,
    searchProfileQueryCap: 6,
    maxUrlsPerProduct: 20,
    maxCandidateUrls: 50,
    llmModelPlan: 'gemini-2.5-flash-lite',
    llmMaxOutputTokensPlan: 2048,
    searchProfileCapMap: null,
    searchEngines: 'bing,google',
    ...overrides
  };
}

export function makeGroupCatalog() {
  return {
    sensor_performance: {
      label: 'Sensor & Performance',
      desc: 'Sensor and performance metrics',
      source_target: 'spec_sheet',
      content_target: 'technical_specs',
      search_intent: 'exact_match',
      host_class: 'lab_review'
    },
    connectivity: {
      label: 'Connectivity',
      desc: 'Connection and wireless specs',
      source_target: 'product_page',
      content_target: 'technical_specs',
      search_intent: 'exact_match',
      host_class: 'manufacturer'
    }
  };
}

export function makeSearchPlanningContext(overrides = {}) {
  return {
    schema_version: 'search_planning_context.v2',
    run: {
      run_id: 'run_001',
      category: 'mouse',
      product_id: 'prod_001',
      brand: 'Razer',
      model: 'Viper V3 Pro',
      round: 0,
    },
    identity: makeIdentity(),
    needset: {
      summary: { total: 10, resolved: 2, core_total: 5, core_unresolved: 3, secondary_total: 3, secondary_unresolved: 1, optional_total: 2, optional_unresolved: 0, conflicts: 0, bundles_planned: 2 },
      blockers: { missing: 3, weak: 1, conflict: 0, needs_exact_match: 1, search_exhausted: 0 },
      missing_critical_fields: ['sensor', 'dpi'],
      unresolved_fields: ['sensor', 'dpi', 'weight'],
      fields: [],
      existing_queries: ['razer viper v3 pro specs'],
    },
    planner_limits: makePlannerLimits(),
    group_catalog: makeGroupCatalog(),
    focus_groups: [
      makeFocusGroup(),
      makeFocusGroup({ key: 'connectivity', label: 'Connectivity', desc: 'Connection and wireless specs', source_target: 'product_page', host_class: 'manufacturer', field_keys: ['connection'], unresolved_field_keys: ['connection'], core_unresolved_count: 0, secondary_unresolved_count: 1, priority: 'secondary', phase: 'next' }),
    ],
    field_priority_map: { sensor: 'critical', dpi: 'required', connection: 'expected' },
    learning: { query_index_hits: {}, dead_domains: ['spam.com'], dead_query_hashes: ['abc123'] },
    previous_round_fields: null,
    ...overrides
  };
}

export function makeConfig(overrides = {}) {
  return {
    llmModelPlan: 'gemini-2.5-flash-lite',
    geminiApiKey: 'test-api-key-123',
    llmTimeoutMs: 30000,
    searchProfileQueryCap: 6,
    ...overrides
  };
}

export function makeLlmResponse(overrides = {}) {
  return {
    planner_confidence: 0.85,
    groups: [
      {
        key: 'sensor_performance',
        phase: 'now',
        reason_active: 'Core fields missing',
        query_family_mix: 'spec_sheet+review',
        queries: [
          { family: 'spec_sheet', q: 'razer viper v3 pro sensor specs', target_fields: ['sensor', 'dpi'], preferred_domains: ['razer.com'], exact_match_required: false },
          { family: 'review', q: 'razer viper v3 pro dpi test review', target_fields: ['dpi'], preferred_domains: ['techpowerup.com'], exact_match_required: false },
        ]
      },
      {
        key: 'connectivity',
        phase: 'next',
        reason_active: 'Secondary fields remaining',
        query_family_mix: 'product_page',
        queries: [
          { family: 'product_page', q: 'razer viper v3 pro wireless connectivity', target_fields: ['connection'], preferred_domains: [], exact_match_required: false },
        ]
      }
    ],
    duplicates_suppressed: 0,
    targeted_exceptions: 0,
    ...overrides
  };
}

// Deterministic query hash (mirrors searchPlanBuilder.js implementation)
function stableHash(value) {
  const text = String(value || '');
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}
export function defaultQueryHash(query) {
  return stableHash(String(query || '').trim().toLowerCase().replace(/\s+/g, ' '));
}

// --- Payload extraction (handles both OpenAI and Gemini message formats) ---

export function extractLlmPayload(fetchCalls) {
  const body = JSON.parse(fetchCalls[0].opts.body);
  const userMsg = body.messages.find(m => m.role === 'user');
  assert.ok(userMsg, 'user message present');
  const content = userMsg.content;
  // Gemini merges system+user into one message; JSON starts at first '{'
  const jsonStart = content.indexOf('{');
  assert.ok(jsonStart >= 0, 'JSON payload found in user message');
  return JSON.parse(content.slice(jsonStart));
}

// --- Mock fetch wiring ---

export function installFetchMock(responseBody, statusCode = 200) {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, opts });
    return {
      ok: statusCode >= 200 && statusCode < 300,
      status: statusCode,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({
        id: 'chatcmpl-test',
        object: 'chat.completion',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: JSON.stringify(responseBody),
          },
          finish_reason: 'stop'
        }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }
      }),
      text: async () => JSON.stringify({
        id: 'chatcmpl-test',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: JSON.stringify(responseBody) },
          finish_reason: 'stop'
        }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }
      })
    };
  };
  return { calls, restore: () => { globalThis.fetch = originalFetch; } };
}

export function installFetchThrow(error) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw error; };
  return { restore: () => { globalThis.fetch = originalFetch; } };
}

export async function loadBuildSearchPlan() {
  const mod = await import('../../../features/indexing/pipeline/needSet/searchPlanBuilder.js');
  return mod.buildSearchPlan;
}
