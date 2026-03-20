import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

// --- Factories ---

function makeIdentity(overrides = {}) {
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

function makeFocusGroup(overrides = {}) {
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

function makePlannerLimits(overrides = {}) {
  return {
    discoveryEnabled: true,
    searchProfileQueryCap: 6,
    searchPlannerQueryCap: 80,
    maxUrlsPerProduct: 20,
    maxCandidateUrls: 50,
    maxPagesPerDomain: 2,
    maxRunSeconds: 300,
    llmModelPlan: 'gemini-2.5-flash-lite',
    llmMaxOutputTokensPlan: 2048,
    searchProfileCapMap: null,
    searchEngines: 'bing,google',
    ...overrides
  };
}

function makeGroupCatalog() {
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

function makeSearchPlanningContext(overrides = {}) {
  return {
    schema_version: 'search_planning_context.v2',
    run: {
      run_id: 'run_001',
      category: 'mouse',
      product_id: 'prod_001',
      brand: 'Razer',
      model: 'Viper V3 Pro',
      round: 0,
      round_mode: 'seed',
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

function makeConfig(overrides = {}) {
  return {
    llmModelPlan: 'gemini-2.5-flash-lite',
    geminiApiKey: 'test-api-key-123',
    llmTimeoutMs: 30000,
    searchProfileQueryCap: 6,
    ...overrides
  };
}

function makeLlmResponse(overrides = {}) {
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
function defaultQueryHash(query) {
  return stableHash(String(query || '').trim().toLowerCase().replace(/\s+/g, ' '));
}

// --- Mock fetch wiring ---

function installFetchMock(responseBody, statusCode = 200) {
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

function installFetchThrow(error) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw error; };
  return { restore: () => { globalThis.fetch = originalFetch; } };
}

// --- Tests ---

describe('buildSearchPlan', () => {
  let buildSearchPlan;
  let fetchMock;

  beforeEach(async () => {
    const mod = await import('../src/indexlab/searchPlanBuilder.js');
    buildSearchPlan = mod.buildSearchPlan;
  });

  afterEach(() => {
    if (fetchMock) {
      fetchMock.restore();
      fetchMock = null;
    }
  });

  // ===== Disabled =====

  describe('disabled', () => {
    it('no API key → mode=disabled, empty queries', async () => {
      const result = await buildSearchPlan({
        searchPlanningContext: makeSearchPlanningContext(),
        config: makeConfig({ geminiApiKey: '' }),
      });

      assert.equal(result.planner.mode, 'disabled');
      assert.equal(result.search_plan_handoff.queries.length, 0);
      assert.equal(result.planner.planner_complete, true);
    });

  });

  // ===== LLM request projection =====

  describe('LLM request projection', () => {
    it('sends identity, round, limits, active focus_groups', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      await buildSearchPlan({
        searchPlanningContext: makeSearchPlanningContext(),
        config: makeConfig(),
      });

      assert.ok(fetchMock.calls.length >= 1);
      const body = JSON.parse(fetchMock.calls[0].opts.body);
      const userContent = body.messages.find(m => m.role === 'user')?.content;
      assert.ok(userContent, 'user message present');
      const payload = JSON.parse(userContent);
      assert.ok(payload.identity, 'identity in payload');
      assert.ok(payload.focus_groups, 'focus_groups in payload');
      assert.ok(payload.limits, 'limits in payload');
    });

    it('excludes hold groups from LLM payload', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const ctx = makeSearchPlanningContext({
        focus_groups: [
          makeFocusGroup({ key: 'active', phase: 'now' }),
          makeFocusGroup({ key: 'held', phase: 'hold', unresolved_field_keys: [] }),
        ],
      });
      await buildSearchPlan({
        searchPlanningContext: ctx,
        config: makeConfig(),
      });

      const body = JSON.parse(fetchMock.calls[0].opts.body);
      const userContent = body.messages.find(m => m.role === 'user')?.content;
      const payload = JSON.parse(userContent);
      const groupKeys = payload.focus_groups.map(g => g.key);
      assert.ok(groupKeys.includes('active'));
      assert.ok(!groupKeys.includes('held'));
    });

    it('excludes dead_domains from domain hints', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const ctx = makeSearchPlanningContext({
        focus_groups: [
          makeFocusGroup({ domain_hints_union: ['razer.com', 'spam.com', 'good.com'] }),
        ],
        learning: { dead_domains: ['spam.com'], dead_query_hashes: [] },
      });
      await buildSearchPlan({
        searchPlanningContext: ctx,
        config: makeConfig(),
      });

      const body = JSON.parse(fetchMock.calls[0].opts.body);
      const userContent = body.messages.find(m => m.role === 'user')?.content;
      const payload = JSON.parse(userContent);
      const hints = payload.focus_groups[0].domain_hints_union;
      assert.ok(!hints.includes('spam.com'));
      assert.ok(hints.includes('razer.com'));
      assert.ok(hints.includes('good.com'));
    });
  });

  // ===== LLM response parsing =====

  describe('LLM response parsing', () => {
    it('valid response → no queries extracted (NeedSet does not author queries)', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const result = await buildSearchPlan({
        searchPlanningContext: makeSearchPlanningContext(),
        config: makeConfig(),
      });

      assert.equal(result.planner.mode, 'llm');
      assert.equal(result.search_plan_handoff.queries.length, 0, 'NeedSet LLM does not generate queries');
    });

    it('empty groups array → empty queries', async () => {
      fetchMock = installFetchMock({ groups: [], planner_confidence: 0.5 });
      const result = await buildSearchPlan({
        searchPlanningContext: makeSearchPlanningContext(),
        config: makeConfig(),
      });

      assert.equal(result.search_plan_handoff.queries.length, 0);
    });
  });

  // ===== NeedSet no longer generates queries =====

  describe('NeedSet query removal', () => {
    it('LLM response with queries → handoff still empty (queries ignored)', async () => {
      const dupeResponse = makeLlmResponse({
        groups: [{
          key: 'sensor_performance',
          queries: [
            { family: 'spec_sheet', q: 'razer viper specs' },
            { family: 'review', q: 'razer viper review' },
          ]
        }]
      });
      fetchMock = installFetchMock(dupeResponse);
      const result = await buildSearchPlan({
        searchPlanningContext: makeSearchPlanningContext(),
        config: makeConfig(),
      });

      assert.equal(result.search_plan_handoff.queries.length, 0, 'queries not extracted from LLM');
    });
  });

  // ===== Schema 4 structure =====

  describe('Schema 4 structure', () => {
    it('schema_version = needset_planner_output.v2', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const result = await buildSearchPlan({
        searchPlanningContext: makeSearchPlanningContext(),
        config: makeConfig(),
      });
      assert.equal(result.schema_version, 'needset_planner_output.v2');
    });

    it('search_plan_handoff.queries is empty array (no query generation)', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const result = await buildSearchPlan({
        searchPlanningContext: makeSearchPlanningContext(),
        config: makeConfig(),
      });

      assert.ok(Array.isArray(result.search_plan_handoff.queries));
      assert.equal(result.search_plan_handoff.queries.length, 0);
    });

    it('search_plan_handoff.query_hashes matches generated queries', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const result = await buildSearchPlan({
        searchPlanningContext: makeSearchPlanningContext(),
        config: makeConfig(),
      });

      const expectedHashes = result.search_plan_handoff.queries.map(q => q.query_hash);
      assert.deepStrictEqual(result.search_plan_handoff.query_hashes, expectedHashes);
    });

    it('panel.round and panel.round_mode from ctx.run', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const result = await buildSearchPlan({
        searchPlanningContext: makeSearchPlanningContext(),
        config: makeConfig(),
      });
      assert.equal(result.panel.round, 0);
      assert.equal(result.panel.round_mode, 'seed');
    });

    it('panel.bundles uses key not group_key', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const result = await buildSearchPlan({
        searchPlanningContext: makeSearchPlanningContext(),
        config: makeConfig(),
      });

      assert.ok(Array.isArray(result.panel.bundles));
      const sensorBundle = result.panel.bundles.find(b => b.key === 'sensor_performance');
      assert.ok(sensorBundle, 'sensor_performance bundle exists');
      assert.equal(sensorBundle.group_key, undefined, 'group_key should not be emitted');
      assert.equal(sensorBundle.queries, undefined, 'panel bundles do not carry queries');
    });

    it('panel.bundles carry display fields from focus_groups', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const result = await buildSearchPlan({
        searchPlanningContext: makeSearchPlanningContext(),
        config: makeConfig(),
      });

      const bundle = result.panel.bundles.find(b => b.key === 'sensor_performance');
      assert.equal(bundle.label, 'Sensor & Performance');
      assert.equal(bundle.desc, 'Sensor and performance metrics');
      assert.equal(bundle.source_target, 'spec_sheet');
      assert.equal(bundle.content_target, 'technical_specs');
      assert.equal(bundle.search_intent, 'exact_match');
      assert.equal(bundle.host_class, 'lab_review');
    });

    it('panel.profile_influence has tier-aware shape', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const result = await buildSearchPlan({
        searchPlanningContext: makeSearchPlanningContext(),
        config: makeConfig(),
      });

      const pi = result.panel.profile_influence;
      assert.ok(pi);
      assert.equal(typeof pi.tier1_seed_active, 'boolean');
      assert.equal(typeof pi.tier2_group_count, 'number');
      assert.equal(typeof pi.tier3_key_count, 'number');
      assert.equal(typeof pi.groups_now, 'number');
      assert.equal(typeof pi.groups_next, 'number');
      assert.equal(typeof pi.groups_hold, 'number');
      assert.equal(typeof pi.total_unresolved_keys, 'number');
      assert.equal(typeof pi.planner_confidence, 'number');
    });

    it('panel.identity/summary/blockers passthrough', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const ctx = makeSearchPlanningContext();
      const result = await buildSearchPlan({
        searchPlanningContext: ctx,
        config: makeConfig(),
      });

      assert.deepStrictEqual(result.panel.identity, ctx.identity);
      assert.deepStrictEqual(result.panel.summary, ctx.needset.summary);
      assert.deepStrictEqual(result.panel.blockers, ctx.needset.blockers);
    });

    it('learning_writeback has spec key names (all empty without query generation)', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const result = await buildSearchPlan({
        searchPlanningContext: makeSearchPlanningContext(),
        config: makeConfig(),
      });

      assert.ok(result.learning_writeback);
      assert.ok(Array.isArray(result.learning_writeback.query_hashes_generated));
      assert.ok(Array.isArray(result.learning_writeback.queries_generated));
      assert.ok(Array.isArray(result.learning_writeback.families_used));
      assert.ok(Array.isArray(result.learning_writeback.domains_targeted));
      assert.ok(Array.isArray(result.learning_writeback.groups_activated));
      assert.equal(typeof result.learning_writeback.duplicates_suppressed, 'number');
    });
  });

  // ===== Error handling =====

  describe('error handling', () => {
    it('LLM throws → mode=error, empty queries, planner_complete=false', async () => {
      fetchMock = installFetchThrow(new Error('LLM network error'));
      const result = await buildSearchPlan({
        searchPlanningContext: makeSearchPlanningContext(),
        config: makeConfig(),
      });

      assert.equal(result.planner.mode, 'error');
      assert.equal(result.search_plan_handoff.queries.length, 0);
      assert.equal(result.planner.planner_complete, false);
      assert.ok(result.planner.error);
    });
  });

  // ===== Determinism =====

  describe('determinism', () => {
    it('same mock response → identical output', async () => {
      const response = makeLlmResponse();
      const ctx = makeSearchPlanningContext();
      const config = makeConfig();

      fetchMock = installFetchMock(response);
      const r1 = await buildSearchPlan({ searchPlanningContext: ctx, config });
      fetchMock.restore();

      fetchMock = installFetchMock(response);
      const r2 = await buildSearchPlan({ searchPlanningContext: ctx, config });
      fetchMock.restore();
      fetchMock = null;

      assert.deepStrictEqual(r1.search_plan_handoff, r2.search_plan_handoff);
      assert.deepStrictEqual(r1.panel, r2.panel);
      assert.deepStrictEqual(r1.learning_writeback, r2.learning_writeback);
    });
  });

  // ===== Planner metadata =====

  describe('planner metadata', () => {
    it('planner.mode=llm, planner.model matches config', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const result = await buildSearchPlan({
        searchPlanningContext: makeSearchPlanningContext(),
        config: makeConfig({ llmModelPlan: 'gpt-4o', openaiApiKey: 'test-api-key-123' }),
      });

      assert.equal(result.planner.mode, 'llm');
      assert.equal(result.planner.model, 'gpt-4o');
    });

    it('planner.planner_confidence from LLM response', async () => {
      fetchMock = installFetchMock(makeLlmResponse({ planner_confidence: 0.85 }));
      const result = await buildSearchPlan({
        searchPlanningContext: makeSearchPlanningContext(),
        config: makeConfig(),
      });
      assert.equal(result.planner.planner_confidence, 0.85);
    });

    it('planner.planner_confidence === 0 when disabled', async () => {
      const result = await buildSearchPlan({
        searchPlanningContext: makeSearchPlanningContext(),
        config: makeConfig({ geminiApiKey: '' }),
      });
      assert.equal(result.planner.planner_confidence, 0);
    });

    it('planner.duplicates_suppressed is 0 (no query extraction)', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const result = await buildSearchPlan({
        searchPlanningContext: makeSearchPlanningContext(),
        config: makeConfig(),
      });
      assert.equal(result.planner.duplicates_suppressed, 0);
    });

    it('planner.targeted_exceptions from LLM response', async () => {
      fetchMock = installFetchMock(makeLlmResponse({ targeted_exceptions: 2 }));
      const result = await buildSearchPlan({
        searchPlanningContext: makeSearchPlanningContext(),
        config: makeConfig(),
      });
      assert.equal(result.planner.targeted_exceptions, 2);
    });

    it('planner.targeted_exceptions defaults to 0 when LLM omits it', async () => {
      const resp = makeLlmResponse();
      delete resp.targeted_exceptions;
      fetchMock = installFetchMock(resp);
      const result = await buildSearchPlan({
        searchPlanningContext: makeSearchPlanningContext(),
        config: makeConfig(),
      });
      assert.equal(result.planner.targeted_exceptions, 0);
    });
  });

  // ===== GAP-2: Anti-garbage signals sent to LLM =====

  describe('GAP-2: anti-garbage signals in LLM payload', () => {
    it('sends preferred_content_types_union to LLM', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const ctx = makeSearchPlanningContext({
        focus_groups: [
          makeFocusGroup({ preferred_content_types_union: ['spec_sheet', 'review'] }),
        ],
      });
      await buildSearchPlan({ searchPlanningContext: ctx, config: makeConfig() });

      const body = JSON.parse(fetchMock.calls[0].opts.body);
      const payload = JSON.parse(body.messages.find(m => m.role === 'user')?.content);
      assert.deepStrictEqual(payload.focus_groups[0].preferred_content_types_union, ['spec_sheet', 'review']);
    });

    it('sends domains_tried_union to LLM', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const ctx = makeSearchPlanningContext({
        focus_groups: [
          makeFocusGroup({ domains_tried_union: ['razer.com', 'rtings.com'] }),
        ],
      });
      await buildSearchPlan({ searchPlanningContext: ctx, config: makeConfig() });

      const body = JSON.parse(fetchMock.calls[0].opts.body);
      const payload = JSON.parse(body.messages.find(m => m.role === 'user')?.content);
      assert.deepStrictEqual(payload.focus_groups[0].domains_tried_union, ['razer.com', 'rtings.com']);
    });

    it('sends host_classes_tried_union to LLM', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const ctx = makeSearchPlanningContext({
        focus_groups: [
          makeFocusGroup({ host_classes_tried_union: ['manufacturer', 'review'] }),
        ],
      });
      await buildSearchPlan({ searchPlanningContext: ctx, config: makeConfig() });

      const body = JSON.parse(fetchMock.calls[0].opts.body);
      const payload = JSON.parse(body.messages.find(m => m.role === 'user')?.content);
      assert.deepStrictEqual(payload.focus_groups[0].host_classes_tried_union, ['manufacturer', 'review']);
    });

    it('sends evidence_classes_tried_union to LLM', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const ctx = makeSearchPlanningContext({
        focus_groups: [
          makeFocusGroup({ evidence_classes_tried_union: ['html', 'pdf'] }),
        ],
      });
      await buildSearchPlan({ searchPlanningContext: ctx, config: makeConfig() });

      const body = JSON.parse(fetchMock.calls[0].opts.body);
      const payload = JSON.parse(body.messages.find(m => m.role === 'user')?.content);
      assert.deepStrictEqual(payload.focus_groups[0].evidence_classes_tried_union, ['html', 'pdf']);
    });

    it('sends no_value_attempts to LLM', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const ctx = makeSearchPlanningContext({
        focus_groups: [
          makeFocusGroup({ no_value_attempts: 7 }),
        ],
      });
      await buildSearchPlan({ searchPlanningContext: ctx, config: makeConfig() });

      const body = JSON.parse(fetchMock.calls[0].opts.body);
      const payload = JSON.parse(body.messages.find(m => m.role === 'user')?.content);
      assert.equal(payload.focus_groups[0].no_value_attempts, 7);
    });

    it('sends catalog metadata (source_target, search_intent, host_class) to LLM', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const ctx = makeSearchPlanningContext({
        focus_groups: [
          makeFocusGroup({
            source_target: 'spec_sheet',
            content_target: 'technical_specs',
            search_intent: 'exact_match',
            host_class: 'lab_review',
          }),
        ],
      });
      await buildSearchPlan({ searchPlanningContext: ctx, config: makeConfig() });

      const body = JSON.parse(fetchMock.calls[0].opts.body);
      const payload = JSON.parse(body.messages.find(m => m.role === 'user')?.content);
      assert.equal(payload.focus_groups[0].source_target, 'spec_sheet');
      assert.equal(payload.focus_groups[0].search_intent, 'exact_match');
      assert.equal(payload.focus_groups[0].host_class, 'lab_review');
    });

    it('sends urls_examined_count and query_count to LLM', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const ctx = makeSearchPlanningContext({
        focus_groups: [
          makeFocusGroup({ urls_examined_count: 15, query_count: 8 }),
        ],
      });
      await buildSearchPlan({ searchPlanningContext: ctx, config: makeConfig() });

      const body = JSON.parse(fetchMock.calls[0].opts.body);
      const payload = JSON.parse(body.messages.find(m => m.role === 'user')?.content);
      assert.equal(payload.focus_groups[0].urls_examined_count, 15);
      assert.equal(payload.focus_groups[0].query_count, 8);
    });

    it('sends aliases_union to LLM', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const ctx = makeSearchPlanningContext({
        focus_groups: [
          makeFocusGroup({ aliases_union: ['GPX2', 'G Pro X2'] }),
        ],
      });
      await buildSearchPlan({ searchPlanningContext: ctx, config: makeConfig() });

      const body = JSON.parse(fetchMock.calls[0].opts.body);
      const payload = JSON.parse(body.messages.find(m => m.role === 'user')?.content);
      assert.deepStrictEqual(payload.focus_groups[0].aliases_union, ['GPX2', 'G Pro X2']);
    });
  });

  // ===== GAP-12: weak/conflict distinction + missing_critical_fields =====

  describe('GAP-12: weak/conflict and missing_critical_fields in LLM payload', () => {
    it('sends weak_field_keys and conflict_field_keys to LLM', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const ctx = makeSearchPlanningContext({
        focus_groups: [
          makeFocusGroup({ weak_field_keys: ['polling_rate'], conflict_field_keys: ['weight'] }),
        ],
      });
      await buildSearchPlan({ searchPlanningContext: ctx, config: makeConfig() });

      const body = JSON.parse(fetchMock.calls[0].opts.body);
      const payload = JSON.parse(body.messages.find(m => m.role === 'user')?.content);
      assert.deepStrictEqual(payload.focus_groups[0].weak_field_keys, ['polling_rate']);
      assert.deepStrictEqual(payload.focus_groups[0].conflict_field_keys, ['weight']);
    });

    it('sends missing_critical_fields as top-level in LLM payload', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const ctx = makeSearchPlanningContext();
      ctx.needset.missing_critical_fields = ['sensor', 'dpi', 'weight'];
      await buildSearchPlan({ searchPlanningContext: ctx, config: makeConfig() });

      const body = JSON.parse(fetchMock.calls[0].opts.body);
      const payload = JSON.parse(body.messages.find(m => m.role === 'user')?.content);
      assert.deepStrictEqual(payload.missing_critical_fields, ['sensor', 'dpi', 'weight']);
    });

    it('sends core_unresolved_count per group to LLM', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const ctx = makeSearchPlanningContext({
        focus_groups: [
          makeFocusGroup({ core_unresolved_count: 5, secondary_unresolved_count: 3 }),
        ],
      });
      await buildSearchPlan({ searchPlanningContext: ctx, config: makeConfig() });

      const body = JSON.parse(fetchMock.calls[0].opts.body);
      const payload = JSON.parse(body.messages.find(m => m.role === 'user')?.content);
      assert.equal(payload.focus_groups[0].core_unresolved_count, 5);
      assert.equal(payload.focus_groups[0].secondary_unresolved_count, 3);
    });
  });

  // ===== GAP-8/9: bundle LLM fields + query projection =====

  describe('bundle LLM fields and query projection', () => {
    it('bundle.query_family_mix from LLM response', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const result = await buildSearchPlan({
        searchPlanningContext: makeSearchPlanningContext(),
        config: makeConfig(),
      });
      const bundle = result.panel.bundles.find(b => b.key === 'sensor_performance');
      assert.equal(bundle.query_family_mix, 'spec_sheet+review');
    });

    it('bundle.reason_active from LLM response', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const result = await buildSearchPlan({
        searchPlanningContext: makeSearchPlanningContext(),
        config: makeConfig(),
      });
      const bundle = result.panel.bundles.find(b => b.key === 'sensor_performance');
      assert.equal(bundle.reason_active, 'Core fields missing');
    });

    it('group not in LLM response → null LLM fields', async () => {
      const resp = makeLlmResponse({ groups: [{ key: 'sensor_performance', queries: [{ family: 'spec_sheet', q: 'some query' }] }] });
      fetchMock = installFetchMock(resp);
      const result = await buildSearchPlan({
        searchPlanningContext: makeSearchPlanningContext(),
        config: makeConfig(),
      });
      const connBundle = result.panel.bundles.find(b => b.key === 'connectivity');
      assert.equal(connBundle.query_family_mix, null);
      assert.equal(connBundle.reason_active, null);
    });

    it('panel bundles do not carry queries', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const result = await buildSearchPlan({
        searchPlanningContext: makeSearchPlanningContext(),
        config: makeConfig(),
      });
      const bundle = result.panel.bundles.find(b => b.key === 'sensor_performance');
      assert.equal(bundle.queries, undefined, 'no queries on panel bundle');
    });
  });

  // ===== Tier-aware profile_influence =====

  describe('profile_influence tier-aware shape', () => {
    it('tier counts derived from Schema 3 focus_groups', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const ctx = makeSearchPlanningContext({
        focus_groups: [
          makeFocusGroup({ key: 'g1', phase: 'now', group_search_worthy: true, normalized_key_queue: ['a', 'b'] }),
          makeFocusGroup({ key: 'g2', phase: 'next', group_search_worthy: false, normalized_key_queue: ['c'] }),
          makeFocusGroup({ key: 'g3', phase: 'hold', group_search_worthy: false, normalized_key_queue: [] }),
        ],
      });
      const result = await buildSearchPlan({ searchPlanningContext: ctx, config: makeConfig() });
      const pi = result.panel.profile_influence;

      assert.equal(pi.tier2_group_count, 1, 'one search-worthy group');
      assert.equal(pi.tier3_key_count, 1, 'one key from non-worthy group with keys');
      assert.equal(pi.groups_now, 1);
      assert.equal(pi.groups_next, 1);
      assert.equal(pi.groups_hold, 1);
      assert.equal(pi.total_unresolved_keys, 3, 'a+b+c = 3 total keys');
    });

    it('tier1_seed_active reflects seed_status', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const ctx = makeSearchPlanningContext({
        seed_status: { specs_seed: { is_needed: true }, source_seeds: {} },
      });
      const result = await buildSearchPlan({ searchPlanningContext: ctx, config: makeConfig() });
      assert.equal(result.panel.profile_influence.tier1_seed_active, true);
    });

    it('tier1_seed_active false when no seeds needed', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const ctx = makeSearchPlanningContext({
        seed_status: { specs_seed: { is_needed: false }, source_seeds: {} },
      });
      const result = await buildSearchPlan({ searchPlanningContext: ctx, config: makeConfig() });
      assert.equal(result.panel.profile_influence.tier1_seed_active, false);
    });

    it('planner_confidence from LLM response', async () => {
      fetchMock = installFetchMock(makeLlmResponse({ planner_confidence: 0.85 }));
      const result = await buildSearchPlan({
        searchPlanningContext: makeSearchPlanningContext(),
        config: makeConfig(),
      });
      assert.equal(result.panel.profile_influence.planner_confidence, 0.85);
    });

    it('disabled mode → defaults', async () => {
      const result = await buildSearchPlan({
        searchPlanningContext: makeSearchPlanningContext(),
        config: makeConfig({ geminiApiKey: '' }),
      });
      const pi = result.panel.profile_influence;
      assert.equal(pi.tier1_seed_active, false);
      assert.equal(pi.tier2_group_count, 0);
      assert.equal(pi.tier3_key_count, 0);
      assert.equal(pi.planner_confidence, 0);
    });
  });

  // ===== GAP-11: panel deltas =====

  describe('panel deltas', () => {
    it('round 0 (no previous_round_fields) → deltas show all fields as new', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const result = await buildSearchPlan({
        searchPlanningContext: makeSearchPlanningContext({ previous_round_fields: null }),
        config: makeConfig(),
      });
      assert.ok(result.panel.deltas.length > 0, 'round 0 should show fields as new');
      assert.equal(result.panel.deltas[0].from, 'none');
    });

    it('changed field detected: prev missing → current satisfied', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const ctx = makeSearchPlanningContext({
        previous_round_fields: [
          { field_key: 'sensor', state: 'missing' },
          { field_key: 'dpi', state: 'missing' },
        ],
        focus_groups: [
          makeFocusGroup({
            key: 'sensor_performance',
            field_keys: ['sensor', 'dpi'],
            satisfied_field_keys: ['sensor'],
            unresolved_field_keys: ['dpi'],
          }),
        ],
      });
      const result = await buildSearchPlan({ searchPlanningContext: ctx, config: makeConfig() });
      assert.ok(result.panel.deltas.length >= 1);
      const sensorDelta = result.panel.deltas.find(d => d.field === 'sensor');
      assert.ok(sensorDelta, 'sensor delta present');
      assert.equal(sensorDelta.from, 'missing');
      assert.equal(sensorDelta.to, 'satisfied');
    });

    it('unchanged field not in deltas', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const ctx = makeSearchPlanningContext({
        previous_round_fields: [
          { field_key: 'dpi', state: 'missing' },
        ],
        focus_groups: [
          makeFocusGroup({
            key: 'sensor_performance',
            field_keys: ['dpi'],
            unresolved_field_keys: ['dpi'],
          }),
        ],
      });
      const result = await buildSearchPlan({ searchPlanningContext: ctx, config: makeConfig() });
      assert.equal(result.panel.deltas.length, 0);
    });

    it('multiple state transitions', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const ctx = makeSearchPlanningContext({
        previous_round_fields: [
          { field_key: 'sensor', state: 'missing' },
          { field_key: 'dpi', state: 'weak' },
          { field_key: 'weight', state: 'satisfied' },
        ],
        focus_groups: [
          makeFocusGroup({
            key: 'sensor_performance',
            field_keys: ['sensor', 'dpi'],
            satisfied_field_keys: ['sensor', 'dpi'],
            unresolved_field_keys: [],
          }),
          makeFocusGroup({
            key: 'dimensions',
            phase: 'now',
            field_keys: ['weight'],
            conflict_field_keys: ['weight'],
            unresolved_field_keys: [],
          }),
        ],
      });
      const result = await buildSearchPlan({ searchPlanningContext: ctx, config: makeConfig() });
      assert.equal(result.panel.deltas.length, 3);
      const byField = Object.fromEntries(result.panel.deltas.map(d => [d.field, d]));
      assert.equal(byField.sensor.from, 'missing');
      assert.equal(byField.sensor.to, 'satisfied');
      assert.equal(byField.dpi.from, 'weak');
      assert.equal(byField.dpi.to, 'satisfied');
      assert.equal(byField.weight.from, 'satisfied');
      assert.equal(byField.weight.to, 'conflict');
    });
  });

  // ===== GAP-10: bundle fields[] =====

  describe('bundle fields[]', () => {
    it('bundle.fields has correct keys from field_keys', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const result = await buildSearchPlan({
        searchPlanningContext: makeSearchPlanningContext(),
        config: makeConfig(),
      });
      const bundle = result.panel.bundles.find(b => b.key === 'sensor_performance');
      const fieldKeys = bundle.fields.map(f => f.key).sort();
      assert.deepStrictEqual(fieldKeys, ['dpi', 'sensor']);
    });

    it('state mapping: satisfied/weak/conflict/missing', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const ctx = makeSearchPlanningContext({
        focus_groups: [
          makeFocusGroup({
            key: 'sensor_performance',
            field_keys: ['sensor', 'dpi', 'polling_rate', 'lod'],
            satisfied_field_keys: ['sensor'],
            weak_field_keys: ['polling_rate'],
            conflict_field_keys: ['lod'],
            unresolved_field_keys: ['dpi'],
          }),
        ],
        field_priority_map: { sensor: 'critical', dpi: 'required', polling_rate: 'expected', lod: 'optional' },
      });
      const result = await buildSearchPlan({ searchPlanningContext: ctx, config: makeConfig() });
      const bundle = result.panel.bundles.find(b => b.key === 'sensor_performance');
      const byKey = Object.fromEntries(bundle.fields.map(f => [f.key, f]));
      assert.equal(byKey.sensor.state, 'satisfied');
      assert.equal(byKey.dpi.state, 'missing');
      assert.equal(byKey.polling_rate.state, 'weak');
      assert.equal(byKey.lod.state, 'conflict');
    });

    it('bucket mapping: identity/critical→core, required→secondary, expected→expected, optional→optional', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const ctx = makeSearchPlanningContext({
        focus_groups: [
          makeFocusGroup({
            key: 'sensor_performance',
            field_keys: ['a', 'b', 'c', 'd', 'e'],
            unresolved_field_keys: ['a', 'b', 'c', 'd', 'e'],
          }),
        ],
        field_priority_map: { a: 'identity', b: 'critical', c: 'required', d: 'expected', e: 'optional' },
      });
      const result = await buildSearchPlan({ searchPlanningContext: ctx, config: makeConfig() });
      const bundle = result.panel.bundles.find(b => b.key === 'sensor_performance');
      const byKey = Object.fromEntries(bundle.fields.map(f => [f.key, f]));
      assert.equal(byKey.a.bucket, 'core');
      assert.equal(byKey.b.bucket, 'core');
      assert.equal(byKey.c.bucket, 'secondary');
      assert.equal(byKey.d.bucket, 'expected');
      assert.equal(byKey.e.bucket, 'optional');
    });

    it('unknown field_key defaults to optional bucket', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const ctx = makeSearchPlanningContext({
        focus_groups: [
          makeFocusGroup({
            key: 'sensor_performance',
            field_keys: ['mystery'],
            unresolved_field_keys: ['mystery'],
          }),
        ],
        field_priority_map: {},
      });
      const result = await buildSearchPlan({ searchPlanningContext: ctx, config: makeConfig() });
      const bundle = result.panel.bundles.find(b => b.key === 'sensor_performance');
      assert.equal(bundle.fields[0].bucket, 'optional');
    });
  });
});
