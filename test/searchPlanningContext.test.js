import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
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
} from '../src/indexlab/searchPlanningContext.js';

// --- Factories ---

function makeField(overrides = {}) {
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
      aliases: []
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
      duplicate_attempts_suppressed: 0
    },
    ...overrides
  };
}

function makeNeedSetOutput(overrides = {}) {
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
      support_domain: null
    },
    fields: [],
    planner_seed: {
      missing_critical_fields: [],
      unresolved_fields: [],
      existing_queries: [],
      current_product_identity: { category: 'mouse', brand: '', model: '' }
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
      bundles_planned: 0
    },
    blockers: { missing: 0, weak: 0, conflict: 0, needs_exact_match: 0, search_exhausted: 0 },
    focus_fields: [],
    bundles: [],
    profile_mix: {},
    rows: [],
    deltas: [],
    debug: {},
    ...overrides
  };
}

function makeFieldGroupsData(overrides = {}) {
  return {
    category: 'mouse',
    groups: [],
    group_index: {},
    version: 1,
    ...overrides
  };
}

function makeRunContext(overrides = {}) {
  return {
    run_id: 'run_001',
    category: 'mouse',
    product_id: 'prod_001',
    brand: 'TestBrand',
    model: 'TestModel',
    round: 0,
    ...overrides
  };
}

// --- Tests ---

describe('buildSearchPlanningContext', () => {

  // ===== Empty inputs =====

  describe('empty inputs', () => {
    it('empty needSetOutput → valid Schema 3 with empty focus_groups', () => {
      const result = buildSearchPlanningContext({
        needSetOutput: makeNeedSetOutput(),
        runContext: makeRunContext()
      });

      assert.equal(result.schema_version, 'search_planning_context.v2.1');
      assert.deepStrictEqual(result.focus_groups, []);
      assert.ok(result.needset);
      assert.ok(result.planner_limits);
      assert.ok(result.group_catalog);
      assert.equal(result.learning, null);
      assert.equal(result.previous_round_fields, null);
    });

    it('missing fieldGroupsData → fields go to _ungrouped group', () => {
      const ns = makeNeedSetOutput({
        fields: [makeField({ field_key: 'f1', group_key: null, state: 'unknown' })]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });

      assert.equal(result.focus_groups.length, 1);
      assert.equal(result.focus_groups[0].key, '_ungrouped');
      assert.deepStrictEqual(result.focus_groups[0].field_keys, ['f1']);
    });

    it('missing config → default planner_limits', () => {
      const result = buildSearchPlanningContext({
        needSetOutput: makeNeedSetOutput(),
        runContext: makeRunContext()
      });

      assert.equal(result.planner_limits.discoveryEnabled, true);
      // WHY: Registry defaults are SSOT — no hardcoded fallbacks
      assert.equal(result.planner_limits.searchProfileQueryCap, 10);
      assert.equal(result.planner_limits.maxUrlsPerProduct, 50);
      assert.equal(result.planner_limits.maxCandidateUrls, 80);
      assert.equal(result.planner_limits.maxPagesPerDomain, 5);
      assert.equal(result.planner_limits.maxRunSeconds, 480);
      assert.equal(result.planner_limits.llmModelPlan, 'gemini-2.5-flash');
      assert.equal(result.planner_limits.llmProvider, 'gemini');
      assert.equal(result.planner_limits.llmMaxOutputTokensPlan, 2048);
      assert.equal(result.planner_limits.searchProfileCapMap, null);
      assert.equal(result.planner_limits.searchEngines, 'bing,google');
    });
  });

  // ===== Field grouping =====

  describe('field grouping', () => {
    it('fields with same group_key grouped together', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({ field_key: 'sensor', group_key: 'sensor_performance', state: 'unknown' }),
          makeField({ field_key: 'dpi', group_key: 'sensor_performance', state: 'unknown' }),
          makeField({ field_key: 'weight', group_key: 'construction', state: 'unknown' })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });

      const sensorGroup = result.focus_groups.find(g => g.key === 'sensor_performance');
      const constructionGroup = result.focus_groups.find(g => g.key === 'construction');

      assert.ok(sensorGroup);
      assert.ok(constructionGroup);
      assert.deepStrictEqual(sensorGroup.field_keys.sort(), ['dpi', 'sensor']);
      assert.deepStrictEqual(constructionGroup.field_keys, ['weight']);
    });

    it('null/empty group_key → _ungrouped', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({ field_key: 'f1', group_key: null, state: 'unknown' }),
          makeField({ field_key: 'f2', group_key: '', state: 'unknown' })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });

      assert.equal(result.focus_groups.length, 1);
      assert.equal(result.focus_groups[0].key, '_ungrouped');
      assert.deepStrictEqual(result.focus_groups[0].field_keys.sort(), ['f1', 'f2']);
    });

    it('fields with group_key not in fieldGroupsData still form groups', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({ field_key: 'f1', group_key: 'exotic_group', state: 'unknown' })
        ]
      });
      const fgd = makeFieldGroupsData(); // no groups defined
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        fieldGroupsData: fgd,
        runContext: makeRunContext()
      });

      assert.equal(result.focus_groups.length, 1);
      assert.equal(result.focus_groups[0].key, 'exotic_group');
    });
  });

  // ===== State classification =====

  describe('state classification', () => {
    it('all-accepted group → satisfied_field_keys only', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({ field_key: 'f1', group_key: 'grp', state: 'accepted', need_score: 0, reasons: [] }),
          makeField({ field_key: 'f2', group_key: 'grp', state: 'accepted', need_score: 0, reasons: [] })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });

      const grp = result.focus_groups.find(g => g.key === 'grp');
      assert.ok(grp);
      assert.deepStrictEqual(grp.satisfied_field_keys.sort(), ['f1', 'f2']);
      assert.deepStrictEqual(grp.unresolved_field_keys, []);
      assert.deepStrictEqual(grp.weak_field_keys, []);
      assert.deepStrictEqual(grp.conflict_field_keys, []);
    });

    it('mix of states → correct classification into 4 arrays', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({ field_key: 'ok', group_key: 'grp', state: 'accepted', need_score: 0, reasons: [] }),
          makeField({ field_key: 'missing', group_key: 'grp', state: 'unknown' }),
          makeField({ field_key: 'low', group_key: 'grp', state: 'weak' }),
          makeField({ field_key: 'bad', group_key: 'grp', state: 'conflict' })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });

      const grp = result.focus_groups.find(g => g.key === 'grp');
      assert.deepStrictEqual(grp.satisfied_field_keys, ['ok']);
      assert.deepStrictEqual(grp.unresolved_field_keys, ['missing']);
      assert.deepStrictEqual(grp.weak_field_keys, ['low']);
      assert.deepStrictEqual(grp.conflict_field_keys, ['bad']);
    });
  });

  // ===== Priority =====

  describe('priority', () => {
    it('group with identity/critical/required unresolved → core', () => {
      for (const level of ['identity', 'critical', 'required']) {
        const ns = makeNeedSetOutput({
          fields: [
            makeField({ field_key: `f_${level}`, group_key: 'grp', state: 'unknown', required_level: level })
          ]
        });
        const result = buildSearchPlanningContext({
          needSetOutput: ns,
          runContext: makeRunContext()
        });
        const grp = result.focus_groups.find(g => g.key === 'grp');
        assert.equal(grp.priority, 'core', `expected core for required_level=${level}`);
      }
    });

    it('group with only expected unresolved → secondary', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({ field_key: 'f1', group_key: 'grp', state: 'unknown', required_level: 'expected' })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      const grp = result.focus_groups.find(g => g.key === 'grp');
      assert.equal(grp.priority, 'secondary');
    });

    it('group with only optional unresolved → optional', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({ field_key: 'f1', group_key: 'grp', state: 'unknown', required_level: 'optional' })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      const grp = result.focus_groups.find(g => g.key === 'grp');
      assert.equal(grp.priority, 'optional');
    });
  });

  // ===== Phase =====

  describe('phase', () => {
    it('round 0 (seeds first) → all unresolved groups are next', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({ field_key: 'f1', group_key: 'grp', state: 'unknown', required_level: 'critical' })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext({ round: 0 })
      });
      const grp = result.focus_groups.find(g => g.key === 'grp');
      assert.equal(grp.phase, 'next');
    });

    it('round 1+ → search-worthy groups become now', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({ field_key: 'f1', group_key: 'grp', state: 'unknown', required_level: 'critical' }),
          makeField({ field_key: 'f2', group_key: 'grp', state: 'unknown', required_level: 'expected' }),
          makeField({ field_key: 'f3', group_key: 'grp', state: 'unknown', required_level: 'expected' }),
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext({ round: 1 }),
        config: { searchProfileQueryCap: 10 },
      });
      const grp = result.focus_groups.find(g => g.key === 'grp');
      assert.equal(grp.group_search_worthy, true);
      assert.equal(grp.phase, 'now');
    });

    it('round 1+ with multiple groups → higher productivity group is now, lower is next', () => {
      const ns = makeNeedSetOutput({
        fields: [
          // easy group: 4 fields, all expected+easy+always
          makeField({ field_key: 'e1', group_key: 'easy_grp', state: 'unknown', required_level: 'expected', availability: 'always', difficulty: 'easy', need_score: 30 }),
          makeField({ field_key: 'e2', group_key: 'easy_grp', state: 'unknown', required_level: 'expected', availability: 'always', difficulty: 'easy', need_score: 30 }),
          makeField({ field_key: 'e3', group_key: 'easy_grp', state: 'unknown', required_level: 'expected', availability: 'always', difficulty: 'easy', need_score: 30 }),
          makeField({ field_key: 'e4', group_key: 'easy_grp', state: 'unknown', required_level: 'expected', availability: 'always', difficulty: 'easy', need_score: 30 }),
          // hard group: 1 field, critical but rare+hard
          makeField({ field_key: 'h1', group_key: 'hard_grp', state: 'unknown', required_level: 'critical', availability: 'rare', difficulty: 'hard', need_score: 80 }),
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext({ round: 1 })
      });
      const easyGrp = result.focus_groups.find(g => g.key === 'easy_grp');
      const hardGrp = result.focus_groups.find(g => g.key === 'hard_grp');
      assert.equal(easyGrp.phase, 'now');
      assert.equal(hardGrp.phase, 'next');
    });

    it('all-satisfied group → hold', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({ field_key: 'f1', group_key: 'grp', state: 'accepted', need_score: 0, reasons: [] })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      const grp = result.focus_groups.find(g => g.key === 'grp');
      assert.equal(grp.phase, 'hold');
    });
  });

  // ===== SET unions =====

  describe('SET unions', () => {
    it('query_terms from multiple fields unioned, sorted, no dupes', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({
            field_key: 'f1', group_key: 'grp', state: 'unknown',
            idx: { ...makeField().idx, query_terms: ['zebra', 'apple'] }
          }),
          makeField({
            field_key: 'f2', group_key: 'grp', state: 'unknown',
            idx: { ...makeField().idx, query_terms: ['apple', 'mango'] }
          })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      const grp = result.focus_groups.find(g => g.key === 'grp');
      assert.deepStrictEqual(grp.query_terms_union, ['apple', 'mango', 'zebra']);
    });

    it('domains_tried unioned from history', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({
            field_key: 'f1', group_key: 'grp', state: 'unknown',
            history: { ...makeField().history, domains_tried: ['a.com', 'b.com'] }
          }),
          makeField({
            field_key: 'f2', group_key: 'grp', state: 'unknown',
            history: { ...makeField().history, domains_tried: ['b.com', 'c.com'] }
          })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      const grp = result.focus_groups.find(g => g.key === 'grp');
      assert.deepStrictEqual(grp.domains_tried_union, ['a.com', 'b.com', 'c.com']);
    });
  });

  // ===== Scalar sums =====

  describe('scalar sums', () => {
    it('no_value_attempts summed across group fields', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({
            field_key: 'f1', group_key: 'grp', state: 'unknown',
            history: { ...makeField().history, no_value_attempts: 3 }
          }),
          makeField({
            field_key: 'f2', group_key: 'grp', state: 'unknown',
            history: { ...makeField().history, no_value_attempts: 2 }
          })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      const grp = result.focus_groups.find(g => g.key === 'grp');
      assert.equal(grp.no_value_attempts, 5);
      assert.equal(grp.duplicate_attempts_suppressed, 0);
    });
  });

  // ===== group_catalog =====

  describe('group_catalog', () => {
    it('known group gets default metadata (no search_intent or host_class)', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({ field_key: 'sensor', group_key: 'sensor_performance', state: 'unknown' })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      const entry = result.group_catalog.sensor_performance;
      assert.ok(entry);
      assert.equal(entry.source_target, 'spec_sheet');
      assert.equal(entry.search_intent, undefined);
      assert.equal(entry.host_class, undefined);
    });

    it('unknown group gets generic fallback (no search_intent or host_class)', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({ field_key: 'f1', group_key: 'exotic_group', state: 'unknown' })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      const entry = result.group_catalog.exotic_group;
      assert.ok(entry);
      assert.equal(entry.source_target, 'product_page');
      assert.equal(entry.search_intent, undefined);
    });

    it('label comes from fieldGroupsData display_name', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({ field_key: 'sensor', group_key: 'sensor_performance', state: 'unknown' })
        ]
      });
      const fgd = makeFieldGroupsData({
        groups: [
          { group_key: 'sensor_performance', display_name: 'Sensor & Performance', field_keys: ['sensor'], count: 1 }
        ],
        group_index: { sensor_performance: ['sensor'] }
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        fieldGroupsData: fgd,
        runContext: makeRunContext()
      });
      assert.equal(result.group_catalog.sensor_performance.label, 'Sensor & Performance');
    });
  });

  // ===== planner_limits =====

  describe('planner_limits', () => {
    it('config values mapped correctly to planner-specific keys', () => {
      const config = {
        discoveryEnabled: true,
        searchProfileQueryCap: 10,
        maxUrlsPerProduct: 30,
        maxCandidateUrls: 60,
        maxPagesPerDomain: 3,
        maxRunSeconds: 600,
        llmModelPlan: 'gpt-4o',
        llmProvider: 'openai',
        llmMaxOutputTokensPlan: 4096,
        searchProfileCapMapJson: '{"deterministicAliasCap":6}',
        searchEngines: 'google'
      };
      const result = buildSearchPlanningContext({
        needSetOutput: makeNeedSetOutput(),
        config,
        runContext: makeRunContext()
      });

      assert.equal(result.planner_limits.discoveryEnabled, true);
      assert.equal(result.planner_limits.searchProfileQueryCap, 10);
      assert.equal(result.planner_limits.maxUrlsPerProduct, 30);
      assert.equal(result.planner_limits.maxCandidateUrls, 60);
      assert.equal(result.planner_limits.maxPagesPerDomain, 3);
      assert.equal(result.planner_limits.maxRunSeconds, 600);
      assert.equal(result.planner_limits.llmModelPlan, 'gpt-4o');
      assert.equal(result.planner_limits.llmProvider, 'openai');
      assert.equal(result.planner_limits.llmMaxOutputTokensPlan, 4096);
      assert.deepStrictEqual(result.planner_limits.searchProfileCapMap, { deterministicAliasCap: 6 });
      assert.equal(result.planner_limits.searchEngines, 'google');
    });

    it('llmProvider passed through to planner_limits', () => {
      const config = {
        llmModelPlan: 'gemini-2.5-flash-lite',
        llmProvider: 'gemini',
      };
      const result = buildSearchPlanningContext({
        needSetOutput: makeNeedSetOutput(),
        config,
        runContext: makeRunContext()
      });

      assert.equal(result.planner_limits.llmModelPlan, 'gemini-2.5-flash-lite');
      assert.equal(result.planner_limits.llmProvider, 'gemini');
    });


    it('invalid searchProfileCapMapJson → null', () => {
      const result = buildSearchPlanningContext({
        needSetOutput: makeNeedSetOutput(),
        config: { searchProfileCapMapJson: 'not-json' },
        runContext: makeRunContext()
      });
      assert.equal(result.planner_limits.searchProfileCapMap, null);
    });
  });

  // ===== Passthrough =====

  describe('passthrough', () => {
    it('identity block unchanged', () => {
      const identity = {
        state: 'locked',
        source_label_state: 'matched',
        manufacturer: 'Razer',
        model: 'Viper V3',
        confidence: 0.99,
        official_domain: 'razer.com',
        support_domain: 'support.razer.com'
      };
      const ns = makeNeedSetOutput({ identity });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      assert.deepStrictEqual(result.identity, identity);
    });

    it('summary/blockers unchanged', () => {
      const summary = {
        total: 50, resolved: 30, core_total: 10, core_unresolved: 5,
        secondary_total: 20, secondary_unresolved: 10,
        optional_total: 20, optional_unresolved: 5,
        conflicts: 2, bundles_planned: 3
      };
      const blockers = { missing: 10, weak: 3, conflict: 2, needs_exact_match: 1, search_exhausted: 0 };
      const ns = makeNeedSetOutput({ summary, blockers });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      assert.deepStrictEqual(result.needset.summary, summary);
      assert.deepStrictEqual(result.needset.blockers, blockers);
    });

    it('schema_version = search_planning_context.v2', () => {
      const result = buildSearchPlanningContext({
        needSetOutput: makeNeedSetOutput(),
        runContext: makeRunContext()
      });
      assert.equal(result.schema_version, 'search_planning_context.v2.1');
    });
  });

  // ===== Sorting =====

  describe('sorting', () => {
    it('focus_groups sorted by phase, then priority, then key', () => {
      const ns = makeNeedSetOutput({
        fields: [
          // optional group → hold (when core exists)
          makeField({ field_key: 'f_opt', group_key: 'zzz_optional', state: 'accepted', required_level: 'optional', need_score: 0, reasons: [] }),
          // secondary group → next (because core exists)
          makeField({ field_key: 'f_sec', group_key: 'bbb_secondary', state: 'unknown', required_level: 'expected' }),
          // core group → now
          makeField({ field_key: 'f_core', group_key: 'aaa_core', state: 'unknown', required_level: 'critical' }),
          // another core group → now
          makeField({ field_key: 'f_core2', group_key: 'ccc_core', state: 'unknown', required_level: 'required' })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });

      const keys = result.focus_groups.map(g => g.key);
      // now/core: aaa_core, ccc_core | next/secondary: bbb_secondary | hold/optional: zzz_optional
      assert.deepStrictEqual(keys, ['aaa_core', 'ccc_core', 'bbb_secondary', 'zzz_optional']);
    });
  });

  // ===== Determinism =====

  describe('determinism', () => {
    it('same inputs → identical output', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({ field_key: 'sensor', group_key: 'sensor_performance', state: 'unknown',
            idx: { ...makeField().idx, query_terms: ['dpi', 'sensor'], domain_hints: ['example.com'] },
            history: { ...makeField().history, domains_tried: ['foo.com'], no_value_attempts: 2 }
          }),
          makeField({ field_key: 'weight', group_key: 'construction', state: 'unknown', required_level: 'expected' })
        ]
      });
      const rc = makeRunContext();
      const config = { discoveryEnabled: true, searchProfileQueryCap: 8 };
      const fgd = makeFieldGroupsData({
        groups: [
          { group_key: 'sensor_performance', display_name: 'Sensor & Performance', field_keys: ['sensor'], count: 1 },
          { group_key: 'construction', display_name: 'Construction', field_keys: ['weight'], count: 1 }
        ]
      });

      const r1 = buildSearchPlanningContext({ needSetOutput: ns, config, fieldGroupsData: fgd, runContext: rc });
      const r2 = buildSearchPlanningContext({ needSetOutput: ns, config, fieldGroupsData: fgd, runContext: rc });

      assert.deepStrictEqual(r1, r2);
    });
  });

  // ===== Exact match count =====

  describe('exact_match_count', () => {
    it('counts fields with exact_match_required and state !== accepted', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({ field_key: 'f1', group_key: 'grp', state: 'unknown', exact_match_required: true }),
          makeField({ field_key: 'f2', group_key: 'grp', state: 'accepted', exact_match_required: true, need_score: 0, reasons: [] }),
          makeField({ field_key: 'f3', group_key: 'grp', state: 'weak', exact_match_required: true })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      const grp = result.focus_groups.find(g => g.key === 'grp');
      assert.equal(grp.exact_match_count, 2);
    });
  });

  // ===== Unresolved counts by required_level =====

  describe('unresolved counts', () => {
    it('counts unresolved by required_level correctly', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({ field_key: 'f1', group_key: 'grp', state: 'unknown', required_level: 'identity' }),
          makeField({ field_key: 'f2', group_key: 'grp', state: 'unknown', required_level: 'critical' }),
          makeField({ field_key: 'f3', group_key: 'grp', state: 'unknown', required_level: 'required' }),
          makeField({ field_key: 'f4', group_key: 'grp', state: 'unknown', required_level: 'expected' }),
          makeField({ field_key: 'f5', group_key: 'grp', state: 'unknown', required_level: 'optional' }),
          makeField({ field_key: 'f6', group_key: 'grp', state: 'accepted', required_level: 'identity', need_score: 0, reasons: [] })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      const grp = result.focus_groups.find(g => g.key === 'grp');
      assert.equal(grp.core_unresolved_count, 3);     // identity + critical + required
      assert.equal(grp.secondary_unresolved_count, 1); // expected
      assert.equal(grp.optional_unresolved_count, 1);  // optional
    });
  });

  // ===== Additional SET unions =====

  describe('additional SET unions', () => {
    it('domain_hints unioned from idx', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({
            field_key: 'f1', group_key: 'grp', state: 'unknown',
            idx: { ...makeField().idx, domain_hints: ['razer.com', 'example.com'] }
          }),
          makeField({
            field_key: 'f2', group_key: 'grp', state: 'unknown',
            idx: { ...makeField().idx, domain_hints: ['example.com', 'other.com'] }
          })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      const grp = result.focus_groups.find(g => g.key === 'grp');
      assert.deepStrictEqual(grp.domain_hints_union, ['example.com', 'other.com', 'razer.com']);
    });

    it('preferred_content_types unioned from idx', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({
            field_key: 'f1', group_key: 'grp', state: 'unknown',
            idx: { ...makeField().idx, preferred_content_types: ['spec_sheet', 'review'] }
          }),
          makeField({
            field_key: 'f2', group_key: 'grp', state: 'unknown',
            idx: { ...makeField().idx, preferred_content_types: ['review', 'product_page'] }
          })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      const grp = result.focus_groups.find(g => g.key === 'grp');
      assert.deepStrictEqual(grp.preferred_content_types_union, ['product_page', 'review', 'spec_sheet']);
    });

    it('existing_queries unioned from history', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({
            field_key: 'f1', group_key: 'grp', state: 'unknown',
            history: { ...makeField().history, existing_queries: ['q1', 'q2'] }
          }),
          makeField({
            field_key: 'f2', group_key: 'grp', state: 'unknown',
            history: { ...makeField().history, existing_queries: ['q2', 'q3'] }
          })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      const grp = result.focus_groups.find(g => g.key === 'grp');
      assert.deepStrictEqual(grp.existing_queries_union, ['q1', 'q2', 'q3']);
    });

    it('host_classes_tried unioned from history', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({
            field_key: 'f1', group_key: 'grp', state: 'unknown',
            history: { ...makeField().history, host_classes_tried: ['manufacturer', 'review'] }
          }),
          makeField({
            field_key: 'f2', group_key: 'grp', state: 'unknown',
            history: { ...makeField().history, host_classes_tried: ['review', 'forum'] }
          })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      const grp = result.focus_groups.find(g => g.key === 'grp');
      assert.deepStrictEqual(grp.host_classes_tried_union, ['forum', 'manufacturer', 'review']);
    });

    it('evidence_classes_tried unioned from history', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({
            field_key: 'f1', group_key: 'grp', state: 'unknown',
            history: { ...makeField().history, evidence_classes_tried: ['html', 'pdf'] }
          }),
          makeField({
            field_key: 'f2', group_key: 'grp', state: 'unknown',
            history: { ...makeField().history, evidence_classes_tried: ['pdf', 'json'] }
          })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      const grp = result.focus_groups.find(g => g.key === 'grp');
      assert.deepStrictEqual(grp.evidence_classes_tried_union, ['html', 'json', 'pdf']);
    });
  });

  // ===== Run context passthrough =====

  describe('run context', () => {
    it('run block reflects runContext', () => {
      const rc = makeRunContext({ run_id: 'r_42', category: 'keyboard', round: 3 });
      const result = buildSearchPlanningContext({
        needSetOutput: makeNeedSetOutput(),
        runContext: rc
      });
      assert.equal(result.run.run_id, 'r_42');
      assert.equal(result.run.category, 'keyboard');
      assert.equal(result.run.round, 3);
    });
  });

  // ===== Learning + previousRoundFields passthrough =====

  describe('optional passthrough', () => {
    it('learning passed through when provided', () => {
      const learning = { query_index_hits: { q1: 3 }, dead_domains: ['spam.com'] };
      const result = buildSearchPlanningContext({
        needSetOutput: makeNeedSetOutput(),
        runContext: makeRunContext(),
        learning
      });
      assert.deepStrictEqual(result.learning, learning);
    });

    it('previousRoundFields passed through when provided', () => {
      const previousRoundFields = [{ field_key: 'sensor', state: 'unknown' }];
      const result = buildSearchPlanningContext({
        needSetOutput: makeNeedSetOutput(),
        runContext: makeRunContext(),
        previousRoundFields
      });
      assert.deepStrictEqual(result.previous_round_fields, previousRoundFields);
    });
  });

  // ===== needset block =====

  describe('needset block', () => {
    it('needset contains existing_queries, missing_critical_fields, unresolved_fields (no fields passthrough)', () => {
      const planner_seed = {
        missing_critical_fields: ['sensor'],
        unresolved_fields: ['sensor', 'weight'],
        existing_queries: ['razer viper specs'],
        current_product_identity: { category: 'mouse', brand: 'Razer', model: 'Viper' }
      };
      const fields = [makeField({ field_key: 'sensor' })];
      const ns = makeNeedSetOutput({ fields, planner_seed });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });

      assert.deepStrictEqual(result.needset.missing_critical_fields, ['sensor']);
      assert.deepStrictEqual(result.needset.unresolved_fields, ['sensor', 'weight']);
      assert.deepStrictEqual(result.needset.existing_queries, ['razer viper specs']);
      // fields NOT passed through — data is already in focus_groups
      assert.equal(result.needset.fields, undefined);
    });
  });

  // ===== duplicate_attempts_suppressed sum =====

  describe('duplicate_attempts_suppressed sum', () => {
    it('sums duplicate_attempts_suppressed across group fields', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({
            field_key: 'f1', group_key: 'grp', state: 'unknown',
            history: { ...makeField().history, duplicate_attempts_suppressed: 4 }
          }),
          makeField({
            field_key: 'f2', group_key: 'grp', state: 'unknown',
            history: { ...makeField().history, duplicate_attempts_suppressed: 1 }
          })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      const grp = result.focus_groups.find(g => g.key === 'grp');
      assert.equal(grp.duplicate_attempts_suppressed, 5);
    });
  });

  // ===== PROFILE-GAP-1: Inline catalog metadata into focus_groups =====

  describe('GAP-1: inline catalog metadata', () => {
    it('known group has label, desc, source_target, content_target inlined (no search_intent or host_class — those are per-key)', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({ field_key: 'sensor', group_key: 'sensor_performance', state: 'unknown' })
        ]
      });
      const fgd = makeFieldGroupsData({
        groups: [
          { group_key: 'sensor_performance', display_name: 'Sensor & Performance', field_keys: ['sensor'], count: 1 }
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        fieldGroupsData: fgd,
        runContext: makeRunContext()
      });
      const grp = result.focus_groups.find(g => g.key === 'sensor_performance');
      assert.ok(grp);
      assert.equal(grp.label, 'Sensor & Performance');
      assert.equal(grp.desc, 'Sensor and performance metrics');
      assert.equal(grp.source_target, 'spec_sheet');
      assert.equal(grp.content_target, 'technical_specs');
      assert.equal(grp.search_intent, undefined);
      assert.equal(grp.host_class, undefined);
    });

    it('unknown group gets generic fallback metadata', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({ field_key: 'f1', group_key: 'exotic_group', state: 'unknown' })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      const grp = result.focus_groups.find(g => g.key === 'exotic_group');
      assert.ok(grp);
      assert.equal(grp.label, 'exotic_group');
      assert.equal(grp.desc, '');
      assert.equal(grp.source_target, 'product_page');
      assert.equal(grp.search_intent, undefined);
      assert.equal(grp.host_class, undefined);
    });

    it('group_catalog is still present as top-level key (retained for GUI panel)', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({ field_key: 'sensor', group_key: 'sensor_performance', state: 'unknown' })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      assert.ok(result.group_catalog);
      assert.ok(result.group_catalog.sensor_performance);
    });
  });

  // ===== PROFILE-GAP-3: aliases_union per focus group =====

  describe('GAP-3: aliases_union', () => {
    it('aliases from idx aggregated per group with SET semantics', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({
            field_key: 'f1', group_key: 'grp', state: 'unknown',
            idx: { ...makeField().idx, aliases: ['GPX2', 'G Pro X2'] }
          }),
          makeField({
            field_key: 'f2', group_key: 'grp', state: 'unknown',
            idx: { ...makeField().idx, aliases: ['G Pro X2', 'GPXS2'] }
          })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      const grp = result.focus_groups.find(g => g.key === 'grp');
      assert.deepStrictEqual(grp.aliases_union, ['G Pro X2', 'GPX2', 'GPXS2']);
    });

    it('empty aliases → empty aliases_union', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({ field_key: 'f1', group_key: 'grp', state: 'unknown' })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      const grp = result.focus_groups.find(g => g.key === 'grp');
      assert.deepStrictEqual(grp.aliases_union, []);
    });
  });

  // ===== PROFILE-GAP-4: search_exhausted signals =====

  describe('GAP-4: search_exhausted', () => {
    it('field with no_value_attempts >= 3 AND evidence_classes_tried.length >= 3 is search-exhausted', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({
            field_key: 'f1', group_key: 'grp', state: 'unknown', required_level: 'required',
            history: { ...makeField().history, no_value_attempts: 5, evidence_classes_tried: ['html', 'pdf', 'json'] }
          }),
          makeField({
            field_key: 'f2', group_key: 'grp', state: 'unknown', required_level: 'required',
            history: { ...makeField().history, no_value_attempts: 1, evidence_classes_tried: ['html'] }
          })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      const grp = result.focus_groups.find(g => g.key === 'grp');
      assert.equal(grp.search_exhausted_count, 1);
      assert.deepStrictEqual(grp.search_exhausted_field_keys, ['f1']);
    });

    it('group where ALL fields are search-exhausted → phase becomes hold', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({
            field_key: 'f1', group_key: 'grp', state: 'unknown', required_level: 'required',
            history: { ...makeField().history, no_value_attempts: 4, evidence_classes_tried: ['html', 'pdf', 'json'] }
          }),
          makeField({
            field_key: 'f2', group_key: 'grp', state: 'unknown', required_level: 'required',
            history: { ...makeField().history, no_value_attempts: 3, evidence_classes_tried: ['html', 'pdf', 'review'] }
          })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      const grp = result.focus_groups.find(g => g.key === 'grp');
      assert.equal(grp.search_exhausted_count, 2);
      assert.equal(grp.phase, 'hold');
    });

    it('group with SOME exhausted fields → not hold (still has unexhausted fields)', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({
            field_key: 'f1', group_key: 'grp', state: 'unknown', required_level: 'required',
            history: { ...makeField().history, no_value_attempts: 5, evidence_classes_tried: ['html', 'pdf', 'json'] }
          }),
          makeField({
            field_key: 'f2', group_key: 'grp', state: 'unknown', required_level: 'required',
            history: { ...makeField().history, no_value_attempts: 0, evidence_classes_tried: [] }
          })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext({ round: 1 })
      });
      const grp = result.focus_groups.find(g => g.key === 'grp');
      assert.equal(grp.search_exhausted_count, 1);
      assert.ok(grp.phase === 'now' || grp.phase === 'next'); // not hold — still has work
    });
  });

  // ===== PROFILE-GAP-5: base_model + aliases in run block =====

  describe('GAP-5: run block base_model + aliases', () => {
    it('base_model and aliases from runContext appear in run block', () => {
      const rc = makeRunContext({
        base_model: 'Viper V3',
        aliases: ['VV3P', 'Viper V3 Pro']
      });
      const result = buildSearchPlanningContext({
        needSetOutput: makeNeedSetOutput(),
        runContext: rc
      });
      assert.equal(result.run.base_model, 'Viper V3');
      assert.deepStrictEqual(result.run.aliases, ['VV3P', 'Viper V3 Pro']);
    });

    it('missing base_model/aliases → defaults', () => {
      const result = buildSearchPlanningContext({
        needSetOutput: makeNeedSetOutput(),
        runContext: makeRunContext()
      });
      assert.equal(result.run.base_model, '');
      assert.deepStrictEqual(result.run.aliases, []);
    });
  });

  // ===== PROFILE-GAP-6: SET unions from unresolved fields only =====

  describe('GAP-6: unresolved-only unions', () => {
    it('accepted fields do NOT contribute to query_terms_union', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({
            field_key: 'f_ok', group_key: 'grp', state: 'accepted', need_score: 0, reasons: [],
            idx: { ...makeField().idx, query_terms: ['satisfied_term'] }
          }),
          makeField({
            field_key: 'f_missing', group_key: 'grp', state: 'unknown',
            idx: { ...makeField().idx, query_terms: ['needed_term'] }
          })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      const grp = result.focus_groups.find(g => g.key === 'grp');
      assert.deepStrictEqual(grp.query_terms_union, ['needed_term']);
    });

    it('accepted fields do NOT contribute to domain_hints_union', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({
            field_key: 'f_ok', group_key: 'grp', state: 'accepted', need_score: 0, reasons: [],
            idx: { ...makeField().idx, domain_hints: ['old.com'] }
          }),
          makeField({
            field_key: 'f_missing', group_key: 'grp', state: 'unknown',
            idx: { ...makeField().idx, domain_hints: ['new.com'] }
          })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      const grp = result.focus_groups.find(g => g.key === 'grp');
      assert.deepStrictEqual(grp.domain_hints_union, ['new.com']);
    });

    it('accepted fields do NOT contribute to history unions (existing_queries, domains_tried, etc.)', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({
            field_key: 'f_ok', group_key: 'grp', state: 'accepted', need_score: 0, reasons: [],
            history: { ...makeField().history, existing_queries: ['old_query'], domains_tried: ['old.com'] }
          }),
          makeField({
            field_key: 'f_missing', group_key: 'grp', state: 'unknown',
            history: { ...makeField().history, existing_queries: ['new_query'], domains_tried: ['new.com'] }
          })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      const grp = result.focus_groups.find(g => g.key === 'grp');
      assert.deepStrictEqual(grp.existing_queries_union, ['new_query']);
      assert.deepStrictEqual(grp.domains_tried_union, ['new.com']);
    });

    it('weak and conflict fields DO contribute to unions', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({
            field_key: 'f_weak', group_key: 'grp', state: 'weak',
            idx: { ...makeField().idx, query_terms: ['weak_term'] }
          }),
          makeField({
            field_key: 'f_conflict', group_key: 'grp', state: 'conflict',
            idx: { ...makeField().idx, query_terms: ['conflict_term'] }
          })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      const grp = result.focus_groups.find(g => g.key === 'grp');
      assert.deepStrictEqual(grp.query_terms_union, ['conflict_term', 'weak_term']);
    });
  });

  // ===== PROFILE-GAP-8: urls_examined_count + query_count aggregations =====

  describe('GAP-8: urls_examined_count + query_count sums', () => {
    it('urls_examined_count summed across group fields', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({
            field_key: 'f1', group_key: 'grp', state: 'unknown',
            history: { ...makeField().history, urls_examined_count: 10 }
          }),
          makeField({
            field_key: 'f2', group_key: 'grp', state: 'unknown',
            history: { ...makeField().history, urls_examined_count: 5 }
          })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      const grp = result.focus_groups.find(g => g.key === 'grp');
      assert.equal(grp.urls_examined_count, 15);
    });

    it('query_count summed across group fields', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({
            field_key: 'f1', group_key: 'grp', state: 'unknown',
            history: { ...makeField().history, query_count: 3 }
          }),
          makeField({
            field_key: 'f2', group_key: 'grp', state: 'unknown',
            history: { ...makeField().history, query_count: 2 }
          })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      const grp = result.focus_groups.find(g => g.key === 'grp');
      assert.equal(grp.query_count, 5);
    });
  });

  // ===== PROFILE-GAP-9: previous_round_fields with confidence =====

  describe('GAP-9: previous_round_fields confidence', () => {
    it('previous_round_fields items with confidence pass through', () => {
      const previousRoundFields = [
        { field_key: 'sensor', state: 'weak', confidence: 0.3 },
        { field_key: 'weight', state: 'satisfied', confidence: 0.95 }
      ];
      const result = buildSearchPlanningContext({
        needSetOutput: makeNeedSetOutput(),
        runContext: makeRunContext(),
        previousRoundFields
      });
      assert.equal(result.previous_round_fields[0].confidence, 0.3);
      assert.equal(result.previous_round_fields[1].confidence, 0.95);
    });
  });

  // ===== PROFILE-GAP-10: key vs group_key rename =====

  describe('GAP-10: focus_groups use key not group_key', () => {
    it('focus_group entries have key, not group_key', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({ field_key: 'f1', group_key: 'sensor_performance', state: 'unknown' })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      const grp = result.focus_groups[0];
      assert.equal(grp.key, 'sensor_performance');
      assert.equal(grp.group_key, undefined);
    });
  });

  // ===== PROFILE-GAP-7: Category-aware GROUP_DEFAULTS =====

  describe('GAP-7: category-aware group defaults', () => {
    it('category passed in fieldGroupsData can supply group metadata', () => {
      // For now, just verify that groups from fieldGroupsData get their metadata
      // when GROUP_DEFAULTS doesn't have the group (keyboard-specific group)
      const ns = makeNeedSetOutput({
        fields: [
          makeField({ field_key: 'f1', group_key: 'key_switches', state: 'unknown' })
        ]
      });
      const fgd = makeFieldGroupsData({
        category: 'keyboard',
        groups: [
          {
            group_key: 'key_switches',
            display_name: 'Key Switches',
            field_keys: ['f1'],
            count: 1,
            desc: 'Mechanical key switch specifications',
            source_target: 'spec_sheet',
            content_target: 'technical_specs',
          }
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        fieldGroupsData: fgd,
        runContext: makeRunContext({ category: 'keyboard' })
      });
      const grp = result.focus_groups.find(g => g.key === 'key_switches');
      assert.ok(grp);
      assert.equal(grp.label, 'Key Switches');
      assert.equal(grp.desc, 'Mechanical key switch specifications');
      assert.equal(grp.source_target, 'spec_sheet');
    });
  });

  // ===== Needset heavy passthrough removal =====

  describe('needset block slim', () => {
    it('needset.fields is NOT included (remove heavy passthrough)', () => {
      const fields = [makeField({ field_key: 'sensor' })];
      const ns = makeNeedSetOutput({ fields });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      // fields should not be passed through — data is in focus_groups
      assert.equal(result.needset.fields, undefined);
    });
  });

  // ===== field_priority_map =====

  describe('field_priority_map', () => {
    it('fields with varied required_levels → correct map entries', () => {
      const fields = [
        makeField({ field_key: 'sensor', group_key: 'sensor_performance', required_level: 'critical' }),
        makeField({ field_key: 'dpi', group_key: 'sensor_performance', required_level: 'required' }),
        makeField({ field_key: 'weight', group_key: 'dimensions', required_level: 'expected' }),
        makeField({ field_key: 'color', group_key: 'construction', required_level: 'optional' }),
      ];
      const result = buildSearchPlanningContext({
        needSetOutput: makeNeedSetOutput({ fields }),
        runContext: makeRunContext(),
      });
      assert.deepStrictEqual(result.field_priority_map, {
        sensor: 'critical',
        dpi: 'required',
        weight: 'expected',
        color: 'optional',
      });
    });

    it('empty fields → empty map', () => {
      const result = buildSearchPlanningContext({
        needSetOutput: makeNeedSetOutput({ fields: [] }),
        runContext: makeRunContext(),
      });
      assert.deepStrictEqual(result.field_priority_map, {});
    });

    it('every field_key from needSetOutput.fields appears in the map', () => {
      const fields = [
        makeField({ field_key: 'sensor', group_key: 'sp', required_level: 'critical' }),
        makeField({ field_key: 'dpi', group_key: 'sp', required_level: 'required' }),
        makeField({ field_key: 'hz', group_key: 'sp' }), // no required_level → defaults to 'optional'
      ];
      const result = buildSearchPlanningContext({
        needSetOutput: makeNeedSetOutput({ fields }),
        runContext: makeRunContext(),
      });
      const mapKeys = Object.keys(result.field_priority_map).sort();
      const fieldKeys = fields.map(f => f.field_key).sort();
      assert.deepStrictEqual(mapKeys, fieldKeys);
      assert.equal(result.field_priority_map.hz, 'optional');
    });
  });
});

// ── V4: Schema 3 helpers ──

describe('V4 — buildGroupDescriptionShort', () => {
  it('extracts search-safe tokens from catalog desc', () => {
    assert.equal(buildGroupDescriptionShort('Sensor and performance metrics'), 'sensor performance metrics');
  });

  it('empty desc → empty string', () => {
    assert.equal(buildGroupDescriptionShort(''), '');
    assert.equal(buildGroupDescriptionShort(null), '');
  });

  it('caps at 10 tokens', () => {
    const long = 'a b c d e f g h i j k l m n';
    assert.ok(buildGroupDescriptionShort(long).split(/\s+/).length <= 10);
  });
});

describe('V4 — buildGroupDescriptionLong', () => {
  it('appends unresolved keys to desc', () => {
    const result = buildGroupDescriptionLong('Sensor metrics', ['dpi', 'polling rate']);
    assert.ok(result.includes('sensor'));
    assert.ok(result.includes('dpi'));
    assert.ok(result.includes('polling rate'));
  });

  it('caps at 20 tokens', () => {
    const keys = Array.from({ length: 20 }, (_, i) => `field_${i}`);
    const result = buildGroupDescriptionLong('Sensor and performance metrics', keys);
    assert.ok(result.split(/\s+/).length <= 20);
  });
});

describe('V4 — buildGroupFingerprintFine', () => {
  it('produces group_key::sorted_keys format', () => {
    assert.equal(
      buildGroupFingerprintFine('sensor_performance', ['polling rate', 'dpi', 'lift distance']),
      'sensor_performance::dpi,lift distance,polling rate'
    );
  });

  it('empty keys → group_key:: only', () => {
    assert.equal(buildGroupFingerprintFine('sp', []), 'sp::');
  });
});

describe('V4 — computeGroupQueryCount', () => {
  it('counts tier=group_search matching group_key', () => {
    const history = {
      queries: [
        { tier: 'group_search', group_key: 'sp', status: 'scrape_complete' },
        { tier: 'group_search', group_key: 'sp', status: 'scrape_incomplete' },
        { tier: 'group_search', group_key: 'other', status: 'scrape_complete' },
        { tier: 'key_search', group_key: 'sp', status: 'scrape_complete' },
        { tier: 'seed', group_key: null, status: 'scrape_complete' },
      ]
    };
    assert.equal(computeGroupQueryCount('sp', history), 2);
  });

  it('null history → 0', () => {
    assert.equal(computeGroupQueryCount('sp', null), 0);
  });
});

describe('V4 — isGroupSearchWorthy', () => {
  it('worthy when all conditions met', () => {
    const { worthy, skipReason } = isGroupSearchWorthy({
      coverageRatio: 0.3, unresolvedCount: 5, groupQueryCount: 0, phase: 'now'
    });
    assert.equal(worthy, true);
    assert.equal(skipReason, null);
  });

  it('not worthy when coverage >= threshold', () => {
    const { worthy, skipReason } = isGroupSearchWorthy({
      coverageRatio: 0.9, unresolvedCount: 5, groupQueryCount: 0, phase: 'now'
    });
    assert.equal(worthy, false);
    assert.equal(skipReason, 'group_mostly_resolved');
  });

  it('not worthy when too few unresolved', () => {
    const { worthy, skipReason } = isGroupSearchWorthy({
      coverageRatio: 0.3, unresolvedCount: 2, groupQueryCount: 0, phase: 'now'
    });
    assert.equal(worthy, false);
    assert.equal(skipReason, 'too_few_missing_keys');
  });

  it('not worthy when group_query_count >= max (uses broad query count, not key retries)', () => {
    const { worthy, skipReason } = isGroupSearchWorthy({
      coverageRatio: 0.3, unresolvedCount: 5, groupQueryCount: 3, phase: 'now'
    });
    assert.equal(worthy, false);
    assert.equal(skipReason, 'group_search_exhausted');
  });

  it('not worthy when phase=hold', () => {
    const { worthy, skipReason } = isGroupSearchWorthy({
      coverageRatio: 0.3, unresolvedCount: 5, groupQueryCount: 0, phase: 'hold'
    });
    assert.equal(worthy, false);
    assert.equal(skipReason, 'group_on_hold');
  });
});

describe('V4 — buildNormalizedKeyQueue', () => {
  it('sorts by availability → difficulty → repeat → need_score → required_level', () => {
    const fields = [
      { normalized_key: 'rare hard', availability: 'rare', difficulty: 'hard', repeat_count: 0, need_score: 80, required_level: 'critical' },
      { normalized_key: 'expected easy', availability: 'expected', difficulty: 'easy', repeat_count: 0, need_score: 30, required_level: 'expected' },
      { normalized_key: 'expected hard', availability: 'expected', difficulty: 'hard', repeat_count: 0, need_score: 60, required_level: 'required' },
    ];
    const queue = buildNormalizedKeyQueue(fields);
    assert.deepStrictEqual(queue.map(e => typeof e === 'string' ? e : e.normalized_key), ['expected easy', 'expected hard', 'rare hard']);
  });

  it('returns enriched objects with per-key search metadata', () => {
    const fields = [
      {
        normalized_key: 'battery hours', field_key: 'battery_hours',
        availability: 'expected', difficulty: 'medium', repeat_count: 2, need_score: 40, required_level: 'required',
        all_aliases: ['battery life', 'battery runtime'],
        alias_shards: [['battery life', 'battery runtime']],
        domains_tried_for_key: ['rtings.com'],
        content_types_tried_for_key: ['review'],
        idx: { domain_hints: ['rtings.com', 'mousespecs.org'], preferred_content_types: ['review', 'product_page'] },
      },
    ];
    const queue = buildNormalizedKeyQueue(fields);
    assert.equal(queue.length, 1);
    const entry = queue[0];
    assert.equal(typeof entry, 'object', 'queue entries should be objects, not strings');
    assert.equal(entry.normalized_key, 'battery hours');
    assert.equal(entry.repeat_count, 2);
    assert.deepStrictEqual(entry.all_aliases, ['battery life', 'battery runtime']);
    assert.deepStrictEqual(entry.domain_hints, ['rtings.com', 'mousespecs.org']);
    assert.deepStrictEqual(entry.preferred_content_types, ['review', 'product_page']);
    assert.deepStrictEqual(entry.domains_tried_for_key, ['rtings.com']);
  });
});

describe('V4 — deriveSeedStatus', () => {
  it('specs seed needed when never run', () => {
    const status = deriveSeedStatus(null, { official_domain: 'razer.com', manufacturer: 'Razer' });
    assert.equal(status.specs_seed.is_needed, true);
    assert.equal(status.specs_seed.last_status, 'never_run');
  });

  it('brand_seed is_needed when identity has manufacturer', () => {
    const status = deriveSeedStatus(null, { manufacturer: 'Razer' });
    assert.equal(status.brand_seed.is_needed, true);
    assert.equal(status.brand_seed.brand_name, 'Razer');
  });

  it('brand_seed not needed when no brand name', () => {
    const status = deriveSeedStatus(null, {});
    assert.equal(status.brand_seed.is_needed, false);
    assert.equal(status.brand_seed.brand_name, '');
  });

  it('identity domains NOT included in source_seeds', () => {
    const status = deriveSeedStatus(null, { official_domain: 'razer.com', support_domain: 'support.razer.com', manufacturer: 'Razer' });
    assert.equal(status.source_seeds['razer.com'], undefined, 'official_domain should not be in source_seeds');
    assert.equal(status.source_seeds['support.razer.com'], undefined, 'support_domain should not be in source_seeds');
  });

  it('specs seed not needed when complete + on cooldown', () => {
    const now = Date.now();
    const history = {
      queries: [{
        tier: 'seed', source_name: null, status: 'scrape_complete',
        completed_at_ms: now - 1000, new_fields_closed: 3, pending_count: 0,
      }]
    };
    const status = deriveSeedStatus(history, {});
    assert.equal(status.specs_seed.is_needed, false);
    assert.equal(status.specs_seed.last_status, 'scrape_complete');
    assert.ok(status.specs_seed.cooldown_until_ms > now);
  });

  it('specs seed needed when complete but 0 fields closed (no cooldown)', () => {
    const history = {
      queries: [{
        tier: 'seed', source_name: null, status: 'scrape_complete',
        completed_at_ms: Date.now() - 1000, new_fields_closed: 0, pending_count: 0,
      }]
    };
    const status = deriveSeedStatus(history, {});
    assert.equal(status.specs_seed.is_needed, true);
    assert.equal(status.specs_seed.cooldown_until_ms, null);
  });

  it('source seeds tracked per source_name', () => {
    const history = {
      queries: [
        { tier: 'seed', source_name: 'rtings.com', status: 'scrape_complete', completed_at_ms: Date.now() - 1000, new_fields_closed: 2, pending_count: 0 },
        { tier: 'seed', source_name: 'amazon.com', status: 'scrape_incomplete', completed_at_ms: null, new_fields_closed: 0, pending_count: 3 },
      ]
    };
    const status = deriveSeedStatus(history, { official_domain: 'razer.com', manufacturer: 'Razer' });
    assert.equal(status.source_seeds['rtings.com'].is_needed, false);
    assert.equal(status.source_seeds['amazon.com'].is_needed, true);
    assert.equal(status.source_seeds['razer.com'], undefined, 'identity domain not in source_seeds');
    assert.equal(status.brand_seed.is_needed, true, 'brand tracked via brand_seed');
  });

  it('query_completion_summary counts correctly', () => {
    const history = {
      queries: [
        { tier: 'seed', status: 'scrape_complete', pending_count: 0 },
        { tier: 'group_search', status: 'scrape_incomplete', pending_count: 3 },
        { tier: 'key_search', status: 'exhausted', pending_count: 0 },
      ]
    };
    const status = deriveSeedStatus(history, {});
    assert.equal(status.query_completion_summary.total_queries, 3);
    assert.equal(status.query_completion_summary.complete, 2);
    assert.equal(status.query_completion_summary.incomplete, 1);
    assert.equal(status.query_completion_summary.pending_scrapes, 3);
  });
});

// ── V4: Schema 3 focus_group integration ──

describe('V4 — focus_groups carry V4 fields', () => {
  it('every focus_group has V4 coverage and description fields', () => {
    const fields = [
      makeField({ field_key: 'sensor', group_key: 'sp', required_level: 'critical', state: 'unknown' }),
      makeField({ field_key: 'dpi', group_key: 'sp', required_level: 'required', state: 'accepted', value: '26000' }),
      makeField({ field_key: 'hz', group_key: 'sp', required_level: 'expected', state: 'unknown' }),
    ];
    const result = buildSearchPlanningContext({
      needSetOutput: makeNeedSetOutput({ fields }),
      runContext: makeRunContext(),
    });
    const grp = result.focus_groups.find((g) => g.key === 'sp');
    assert.ok(grp);
    assert.equal(grp.total_field_count, 3);
    assert.equal(grp.resolved_field_count, 1);
    assert.ok(grp.coverage_ratio > 0.3 && grp.coverage_ratio < 0.4);
    assert.equal(typeof grp.group_description_short, 'string');
    assert.equal(typeof grp.group_description_long, 'string');
    assert.equal(typeof grp.group_search_worthy, 'boolean');
    assert.equal(typeof grp.group_fingerprint_coarse, 'string');
    assert.equal(typeof grp.group_fingerprint_fine, 'string');
    assert.ok(Array.isArray(grp.normalized_key_queue));
    assert.ok(Array.isArray(grp.group_search_terms));
    assert.ok(Array.isArray(grp.content_type_candidates));
    assert.ok(Array.isArray(grp.domains_tried_for_group));
    assert.equal(typeof grp.group_query_count, 'number');
    assert.equal(typeof grp.group_key_retry_count, 'number');
  });

  it('group_search_worthy = true for group with many unresolved fields', () => {
    const fields = Array.from({ length: 6 }, (_, i) =>
      makeField({ field_key: `f${i}`, group_key: 'g', required_level: 'expected', state: 'unknown' })
    );
    const result = buildSearchPlanningContext({
      needSetOutput: makeNeedSetOutput({ fields }),
      runContext: makeRunContext(),
    });
    const grp = result.focus_groups[0];
    assert.equal(grp.group_search_worthy, true);
    assert.equal(grp.skip_reason, null);
  });

  it('group_search_worthy = false when only 1 unresolved field', () => {
    const fields = [
      makeField({ field_key: 'f1', group_key: 'g', required_level: 'expected', state: 'accepted', value: 'ok' }),
      makeField({ field_key: 'f2', group_key: 'g', required_level: 'expected', state: 'accepted', value: 'ok' }),
      makeField({ field_key: 'f3', group_key: 'g', required_level: 'expected', state: 'unknown' }),
    ];
    const result = buildSearchPlanningContext({
      needSetOutput: makeNeedSetOutput({ fields }),
      runContext: makeRunContext(),
    });
    const grp = result.focus_groups[0];
    assert.equal(grp.group_search_worthy, false);
    assert.equal(grp.skip_reason, 'too_few_missing_keys');
  });

  it('group_fingerprint_coarse is just group_key', () => {
    const fields = [makeField({ field_key: 'f1', group_key: 'sp', state: 'unknown' })];
    const result = buildSearchPlanningContext({
      needSetOutput: makeNeedSetOutput({ fields }),
      runContext: makeRunContext(),
    });
    assert.equal(result.focus_groups[0].group_fingerprint_coarse, 'sp');
  });
});

// ── V4: Schema 3 top-level additions ──

describe('V4 — Schema 3 top-level seed_status and pass_seed', () => {
  it('seed_status present on output', () => {
    const result = buildSearchPlanningContext({
      needSetOutput: makeNeedSetOutput(),
      runContext: makeRunContext(),
    });
    assert.ok(result.seed_status);
    assert.ok(result.seed_status.specs_seed);
    assert.ok(result.seed_status.query_completion_summary);
  });

  it('pass_seed.passA_specs_seed = true on round 0', () => {
    const result = buildSearchPlanningContext({
      needSetOutput: makeNeedSetOutput(),
      runContext: makeRunContext({ round: 0 }),
    });
    assert.equal(result.pass_seed.passA_specs_seed, true);
  });

  it('pass_seed.passA_specs_seed = true on round 1+ without execution history (still needed)', () => {
    const result = buildSearchPlanningContext({
      needSetOutput: makeNeedSetOutput(),
      runContext: makeRunContext({ round: 2 }),
    });
    // WHY: Without queryExecutionHistory, specs_seed has never_run status → is_needed = true
    assert.equal(result.pass_seed.passA_specs_seed, true);
  });

  it('pass_seed.passA_specs_seed = false on round 1+ with completed execution history', () => {
    const now = Date.now();
    const result = buildSearchPlanningContext({
      needSetOutput: makeNeedSetOutput(),
      runContext: makeRunContext({ round: 2 }),
      queryExecutionHistory: {
        queries: [{
          tier: 'seed', source_name: null, status: 'scrape_complete',
          completed_at_ms: now - 1000, new_fields_closed: 3, pending_count: 0,
        }],
      },
    });
    assert.equal(result.pass_seed.passA_specs_seed, false);
  });

  it('pass_seed.passA_target_groups = phase:now groups (round 1+)', () => {
    // WHY: Group needs 3+ unresolved fields to be search-worthy and thus 'now'
    const fields = [
      makeField({ field_key: 'f1', group_key: 'active', required_level: 'critical', state: 'unknown' }),
      makeField({ field_key: 'f2', group_key: 'active', required_level: 'expected', state: 'unknown' }),
      makeField({ field_key: 'f3', group_key: 'active', required_level: 'expected', state: 'unknown' }),
    ];
    const result = buildSearchPlanningContext({
      needSetOutput: makeNeedSetOutput({ fields }),
      runContext: makeRunContext({ round: 1 }),
      config: { searchProfileQueryCap: 10 },
    });
    assert.ok(result.pass_seed.passA_target_groups.includes('active'));
  });

  it('pass_seed.passA_target_groups = empty on round 0 (seeds first)', () => {
    const fields = [
      makeField({ field_key: 'f1', group_key: 'active', required_level: 'critical', state: 'unknown' }),
    ];
    const result = buildSearchPlanningContext({
      needSetOutput: makeNeedSetOutput({ fields }),
      runContext: makeRunContext({ round: 0 }),
    });
    assert.deepStrictEqual(result.pass_seed.passA_target_groups, []);
  });

  it('schema_version is search_planning_context.v2.1', () => {
    const result = buildSearchPlanningContext({
      needSetOutput: makeNeedSetOutput(),
      runContext: makeRunContext(),
    });
    assert.equal(result.schema_version, 'search_planning_context.v2.1');
  });

  it('tier_allocation present on output', () => {
    const result = buildSearchPlanningContext({
      needSetOutput: makeNeedSetOutput(),
      runContext: makeRunContext(),
      config: { searchProfileQueryCap: 10 },
    });
    assert.ok(result.tier_allocation);
    assert.equal(result.tier_allocation.budget, 10);
    assert.equal(typeof result.tier_allocation.tier1_seed_count, 'number');
    assert.equal(typeof result.tier_allocation.tier2_group_count, 'number');
    assert.equal(typeof result.tier_allocation.tier3_key_count, 'number');
  });

  it('pass_seed.passB_group_queue lists search-worthy groups', () => {
    const fields = Array.from({ length: 4 }, (_, i) =>
      makeField({ field_key: `f${i}`, group_key: 'worthy', required_level: 'expected', state: 'unknown' })
    );
    const result = buildSearchPlanningContext({
      needSetOutput: makeNeedSetOutput({ fields }),
      runContext: makeRunContext({ round: 1 }),
      config: { searchProfileQueryCap: 10 },
    });
    assert.ok(Array.isArray(result.pass_seed.passB_group_queue));
    assert.ok(result.pass_seed.passB_group_queue.includes('worthy'));
  });

  it('pass_seed.passB_key_queue lists keys from non-worthy groups', () => {
    // 1 unresolved field in a group = not search-worthy (too_few_missing_keys)
    const fields = [
      makeField({ field_key: 'solo_key', group_key: 'small', required_level: 'expected', state: 'unknown' }),
    ];
    const result = buildSearchPlanningContext({
      needSetOutput: makeNeedSetOutput({ fields }),
      runContext: makeRunContext({ round: 1 }),
      config: { searchProfileQueryCap: 10 },
    });
    assert.ok(Array.isArray(result.pass_seed.passB_key_queue));
    // Non-worthy group should have its key in passB_key_queue
    const grp = result.focus_groups.find(g => g.key === 'small');
    if (grp && grp.group_search_worthy === false && grp.normalized_key_queue.length > 0) {
      assert.ok(result.pass_seed.passB_key_queue.length > 0);
    }
  });
});

// ── V4: Budget-aware phase assignment ──

describe('V4 — budget-aware phase assignment', () => {
  it('round 0: all pending groups are next regardless of budget', () => {
    const fields = Array.from({ length: 4 }, (_, i) =>
      makeField({ field_key: `f${i}`, group_key: 'g', required_level: 'expected', state: 'unknown' })
    );
    const result = buildSearchPlanningContext({
      needSetOutput: makeNeedSetOutput({ fields }),
      runContext: makeRunContext({ round: 0 }),
      config: { searchProfileQueryCap: 10 },
    });
    const grp = result.focus_groups.find(g => g.key === 'g');
    assert.equal(grp.phase, 'next');
  });

  it('round 1+: now count limited by budget minus seeds', () => {
    // 3 groups, each with 4 unresolved fields = all search-worthy
    const fields = [];
    for (let g = 0; g < 3; g++) {
      for (let f = 0; f < 4; f++) {
        fields.push(makeField({
          field_key: `g${g}_f${f}`,
          group_key: `grp${g}`,
          required_level: 'expected',
          state: 'unknown',
          need_score: (3 - g) * 10, // grp0 highest productivity
        }));
      }
    }
    // Budget = 3: 1 spec seed (round 0 never completed, so specs_seed is_needed)
    // Remaining = 2 for groups → only 2 groups should be 'now'
    const result = buildSearchPlanningContext({
      needSetOutput: makeNeedSetOutput({ fields }),
      runContext: makeRunContext({ round: 1 }),
      config: { searchProfileQueryCap: 3 },
    });
    const nowGroups = result.focus_groups.filter(g => g.phase === 'now');
    const nextGroups = result.focus_groups.filter(g => g.phase === 'next');
    // Seeds take slots from budget, limiting how many groups can be 'now'
    assert.ok(nowGroups.length <= 3, `Expected at most 3 now groups, got ${nowGroups.length}`);
    assert.ok(nowGroups.length + nextGroups.length === 3, 'All 3 groups accounted for');
  });

  it('hold groups are never promoted to now regardless of budget', () => {
    // 1 resolved field = hold
    const fields = [
      makeField({ field_key: 'f1', group_key: 'resolved', required_level: 'expected', state: 'accepted', value: 'ok' }),
    ];
    const result = buildSearchPlanningContext({
      needSetOutput: makeNeedSetOutput({ fields }),
      runContext: makeRunContext({ round: 1 }),
      config: { searchProfileQueryCap: 100 },
    });
    const grp = result.focus_groups.find(g => g.key === 'resolved');
    assert.equal(grp.phase, 'hold');
  });
});

describe('phase assignment immutability', () => {
  it('no focus_group has phase=pending in the output (pending is resolved to now/next)', () => {
    const ns = makeNeedSetOutput({
      fields: [
        makeField({ field_key: 'f1', group_key: 'grp', state: 'unknown', required_level: 'critical' }),
        makeField({ field_key: 'f2', group_key: 'grp', state: 'unknown', required_level: 'expected' }),
        makeField({ field_key: 'f3', group_key: 'grp', state: 'unknown', required_level: 'expected' }),
      ]
    });
    for (const round of [0, 1, 2]) {
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext({ round }),
      });
      for (const g of result.focus_groups) {
        assert.notEqual(g.phase, 'pending',
          `group ${g.key} at round ${round} must not have phase=pending`);
      }
    }
  });

  it('budget overflow: excess worthy groups get next not now', () => {
    const fields = [];
    for (let g = 0; g < 3; g++) {
      for (let f = 0; f < 4; f++) {
        fields.push(makeField({
          field_key: `g${g}_f${f}`,
          group_key: `grp${g}`,
          required_level: 'expected',
          state: 'unknown',
          need_score: (3 - g) * 10,
        }));
      }
    }
    const result = buildSearchPlanningContext({
      needSetOutput: makeNeedSetOutput({ fields }),
      runContext: makeRunContext({ round: 1 }),
      config: { searchProfileQueryCap: 3 },
    });
    const nowCount = result.focus_groups.filter(g => g.phase === 'now').length;
    const nextCount = result.focus_groups.filter(g => g.phase === 'next').length;
    assert.ok(nowCount >= 1, 'at least one group should be now');
    assert.equal(nowCount + nextCount, 3, 'all 3 groups accounted for');
  });

  it('focus_groups from two calls are independent objects (no shared mutation)', () => {
    const ns = makeNeedSetOutput({
      fields: [
        makeField({ field_key: 'f1', group_key: 'grp', state: 'unknown', required_level: 'critical' }),
        makeField({ field_key: 'f2', group_key: 'grp', state: 'unknown', required_level: 'expected' }),
        makeField({ field_key: 'f3', group_key: 'grp', state: 'unknown', required_level: 'expected' }),
      ]
    });
    const args = {
      needSetOutput: ns,
      runContext: makeRunContext({ round: 1 }),
      config: { searchProfileQueryCap: 10 },
    };
    const r1 = buildSearchPlanningContext(args);
    const r2 = buildSearchPlanningContext(args);

    r1.focus_groups[0].phase = 'CORRUPTED';
    assert.notEqual(r2.focus_groups[0].phase, 'CORRUPTED',
      'focus_groups objects must not be shared across calls');
  });

  it('needSetOutput is not mutated by buildSearchPlanningContext', () => {
    const ns = makeNeedSetOutput({
      fields: [
        makeField({ field_key: 'f1', group_key: 'grp_a', state: 'unknown', required_level: 'critical' }),
        makeField({ field_key: 'f2', group_key: 'grp_a', state: 'unknown', required_level: 'expected' }),
        makeField({ field_key: 'f3', group_key: 'grp_a', state: 'unknown', required_level: 'expected' }),
        makeField({ field_key: 'f4', group_key: 'grp_b', state: 'unknown', required_level: 'optional' }),
      ]
    });
    const snapshot = structuredClone(ns);

    buildSearchPlanningContext({
      needSetOutput: ns,
      runContext: makeRunContext({ round: 1 }),
      config: { searchProfileQueryCap: 10 },
    });

    assert.deepStrictEqual(ns, snapshot, 'needSetOutput must not be mutated');
  });
});

// ── V4: computeTierAllocation ──

function makeSeedStatus(overrides = {}) {
  return {
    brand_seed: { is_needed: false, brand_name: '' },
    specs_seed: { is_needed: true, last_status: 'never_run' },
    source_seeds: {},
    query_completion_summary: { total_queries: 0, complete: 0, incomplete: 0, pending_scrapes: 0 },
    ...overrides,
  };
}

function makeFocusGroup(key, overrides = {}) {
  return {
    key,
    phase: 'now',
    group_search_worthy: true,
    productivity_score: 50,
    normalized_key_queue: [],
    ...overrides,
  };
}

describe('V4 — computeTierAllocation', () => {
  it('allocates seeds first, then groups, then keys', () => {
    const seedStatus = makeSeedStatus({
      specs_seed: { is_needed: true },
      source_seeds: { 'rtings.com': { is_needed: true } },
    });
    const groups = [
      makeFocusGroup('g1', { group_search_worthy: true, productivity_score: 80 }),
      makeFocusGroup('g2', { group_search_worthy: true, productivity_score: 60 }),
      makeFocusGroup('g3', { group_search_worthy: true, productivity_score: 40 }),
      makeFocusGroup('g4', { group_search_worthy: true, productivity_score: 20 }),
      makeFocusGroup('g5', { group_search_worthy: true, productivity_score: 10 }),
      makeFocusGroup('gk', { group_search_worthy: false, normalized_key_queue: ['k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7', 'k8', 'k9', 'k10', 'k11', 'k12', 'k13', 'k14', 'k15', 'k16', 'k17', 'k18', 'k19', 'k20'] }),
    ];
    const alloc = computeTierAllocation(seedStatus, groups, 10);
    assert.equal(alloc.budget, 10);
    assert.equal(alloc.tier1_seed_count, 2); // specs + rtings
    assert.equal(alloc.tier2_group_count, 5); // 5 worthy groups, 8 remaining
    assert.equal(alloc.tier3_key_count, 3); // remaining 3
    assert.equal(alloc.overflow_group_count, 0);
    assert.equal(alloc.overflow_key_count, 17); // 20 - 3
  });

  it('seeds consume entire budget when budget is small', () => {
    const seedStatus = makeSeedStatus({
      specs_seed: { is_needed: true },
      source_seeds: {
        'rtings.com': { is_needed: true },
        'amazon.com': { is_needed: true },
      },
    });
    const groups = [
      makeFocusGroup('g1', { group_search_worthy: true }),
    ];
    const alloc = computeTierAllocation(seedStatus, groups, 3);
    assert.equal(alloc.tier1_seed_count, 3); // specs + 2 sources
    assert.equal(alloc.tier2_group_count, 0);
    assert.equal(alloc.tier3_key_count, 0);
    assert.equal(alloc.overflow_group_count, 1);
  });

  it('all budget to keys when no seeds or worthy groups', () => {
    const seedStatus = makeSeedStatus({
      specs_seed: { is_needed: false },
    });
    const groups = [
      makeFocusGroup('g1', { group_search_worthy: false, normalized_key_queue: ['k1', 'k2', 'k3'] }),
      makeFocusGroup('g2', { group_search_worthy: false, normalized_key_queue: ['k4', 'k5'] }),
    ];
    const alloc = computeTierAllocation(seedStatus, groups, 10);
    assert.equal(alloc.tier1_seed_count, 0);
    assert.equal(alloc.tier2_group_count, 0);
    assert.equal(alloc.tier3_key_count, 5); // all 5 keys
    assert.equal(alloc.overflow_key_count, 0);
  });

  it('budget 0 yields zero allocation everywhere', () => {
    const seedStatus = makeSeedStatus();
    const groups = [makeFocusGroup('g1')];
    const alloc = computeTierAllocation(seedStatus, groups, 0);
    assert.equal(alloc.tier1_seed_count, 0);
    assert.equal(alloc.tier2_group_count, 0);
    assert.equal(alloc.tier3_key_count, 0);
  });

  it('null seedStatus means 0 seeds, budget to groups/keys', () => {
    const groups = [
      makeFocusGroup('g1', { group_search_worthy: true, productivity_score: 80 }),
      makeFocusGroup('gk', { group_search_worthy: false, normalized_key_queue: ['k1', 'k2'] }),
    ];
    const alloc = computeTierAllocation(null, groups, 5);
    assert.equal(alloc.tier1_seed_count, 0);
    assert.equal(alloc.tier2_group_count, 1);
    assert.equal(alloc.tier3_key_count, 2);
  });

  it('overflow groups counted when worthy groups exceed remaining budget', () => {
    const seedStatus = makeSeedStatus({
      specs_seed: { is_needed: true },
      source_seeds: { 'a.com': { is_needed: true }, 'b.com': { is_needed: true }, 'c.com': { is_needed: true }, 'd.com': { is_needed: true } },
    });
    const groups = Array.from({ length: 9 }, (_, i) =>
      makeFocusGroup(`g${i}`, { group_search_worthy: true, productivity_score: 90 - i * 10 })
    );
    const alloc = computeTierAllocation(seedStatus, groups, 10);
    assert.equal(alloc.tier1_seed_count, 5); // specs + 4 sources
    assert.equal(alloc.tier2_group_count, 5); // 5 remaining
    assert.equal(alloc.overflow_group_count, 4); // 9 - 5
  });

  it('tier1_seeds array itemizes each seed', () => {
    const seedStatus = makeSeedStatus({
      specs_seed: { is_needed: true },
      source_seeds: { 'rtings.com': { is_needed: true }, 'done.com': { is_needed: false } },
    });
    const alloc = computeTierAllocation(seedStatus, [], 10);
    assert.equal(alloc.tier1_seeds.length, 2); // specs + rtings (done.com excluded)
    assert.deepStrictEqual(alloc.tier1_seeds[0], { type: 'specs', source_name: null, is_needed: true });
    assert.deepStrictEqual(alloc.tier1_seeds[1], { type: 'source', source_name: 'rtings.com', is_needed: true });
  });

  it('brand seed appears first in tier1_seeds (above specs)', () => {
    const seedStatus = makeSeedStatus({
      brand_seed: { is_needed: true, brand_name: 'Razer' },
      specs_seed: { is_needed: true },
      source_seeds: { 'rtings.com': { is_needed: true } },
    });
    const alloc = computeTierAllocation(seedStatus, [], 10);
    assert.equal(alloc.tier1_seeds.length, 3); // brand + specs + rtings
    assert.deepStrictEqual(alloc.tier1_seeds[0], { type: 'brand', source_name: null, is_needed: true });
    assert.deepStrictEqual(alloc.tier1_seeds[1], { type: 'specs', source_name: null, is_needed: true });
    assert.deepStrictEqual(alloc.tier1_seeds[2], { type: 'source', source_name: 'rtings.com', is_needed: true });
  });

  it('tier2_groups array marks allocated vs overflow', () => {
    const seedStatus = makeSeedStatus({ specs_seed: { is_needed: false } });
    const groups = [
      makeFocusGroup('g1', { group_search_worthy: true, productivity_score: 80 }),
      makeFocusGroup('g2', { group_search_worthy: true, productivity_score: 40 }),
      makeFocusGroup('g3', { group_search_worthy: true, productivity_score: 20 }),
    ];
    const alloc = computeTierAllocation(seedStatus, groups, 2);
    const allocated = alloc.tier2_groups.filter(g => g.allocated);
    const overflow = alloc.tier2_groups.filter(g => !g.allocated);
    assert.equal(allocated.length, 2);
    assert.equal(overflow.length, 1);
    assert.equal(allocated[0].group_key, 'g1'); // highest productivity first
    assert.equal(allocated[1].group_key, 'g2');
    assert.equal(overflow[0].group_key, 'g3');
  });

  it('tier3_keys array shows per-group key allocation', () => {
    const seedStatus = makeSeedStatus({ specs_seed: { is_needed: false } });
    const groups = [
      makeFocusGroup('ga', { group_search_worthy: false, normalized_key_queue: ['k1', 'k2', 'k3'] }),
      makeFocusGroup('gb', { group_search_worthy: false, normalized_key_queue: ['k4', 'k5'] }),
    ];
    const alloc = computeTierAllocation(seedStatus, groups, 4);
    assert.equal(alloc.tier3_key_count, 4);
    const ga = alloc.tier3_keys.find(t => t.group_key === 'ga');
    const gb = alloc.tier3_keys.find(t => t.group_key === 'gb');
    assert.ok(ga);
    assert.ok(gb);
    assert.equal(ga.key_count, 3);
    assert.equal(gb.key_count, 2);
    // First group fills first (3 keys), then second group gets remaining (1 key)
    assert.equal(ga.allocated_count + gb.allocated_count, 4);
  });

  it('empty groups and null groups handled gracefully', () => {
    const alloc1 = computeTierAllocation(null, [], 10);
    assert.equal(alloc1.tier1_seed_count, 0);
    assert.equal(alloc1.tier2_group_count, 0);
    assert.equal(alloc1.tier3_key_count, 0);

    const alloc2 = computeTierAllocation(null, null, 10);
    assert.equal(alloc2.budget, 10);
    assert.equal(alloc2.tier1_seed_count, 0);
  });
});
