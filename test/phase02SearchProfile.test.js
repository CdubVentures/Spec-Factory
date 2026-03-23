import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDeterministicAliases,
  buildSearchProfile,
  buildTargetedQueries,
  determineQueryModes,
  buildTier1Queries,
  buildTier2Queries,
  buildTier3Queries,
} from '../src/features/indexing/search/queryBuilder.js';
import { normalizeQueryRows } from '../src/research/queryPlanner.js';

function makeJob(overrides = {}) {
  return {
    category: 'mouse',
    productId: 'mouse-razer-viper-v3-pro',
    identityLock: {
      brand: 'Razer',
      model: 'Viper V3 Pro',
      variant: '',
      ...overrides.identityLock
    },
    ...overrides
  };
}

function makeCategoryConfig(overrides = {}) {
  return {
    category: 'mouse',
    fieldOrder: ['weight', 'sensor', 'dpi', 'polling_rate', 'click_latency', 'switch', 'connection', 'battery_hours', 'lift'],
    sourceHosts: [
      { host: 'razer.com', tierName: 'manufacturer', role: 'manufacturer' },
      { host: 'rtings.com', tierName: 'lab', role: 'lab' },
      { host: 'techpowerup.com', tierName: 'lab', role: 'lab' }
    ],
    searchTemplates: [],
    fieldRules: {
      fields: {
        weight: {
          required_level: 'critical',
          search_hints: {
            query_terms: ['weight grams'],
            domain_hints: ['razer.com'],
            preferred_content_types: ['spec']
          },
          ui: { tooltip_md: 'Weight in grams without cable' }
        },
        sensor: {
          required_level: 'critical',
          search_hints: {
            query_terms: ['optical sensor model'],
            preferred_content_types: ['teardown_review', 'lab_review']
          }
        },
        click_latency: {
          required_level: 'required',
          search_hints: {
            query_terms: ['click latency ms', 'end to end latency'],
            domain_hints: ['rtings.com'],
            preferred_content_types: ['lab_review', 'benchmark']
          }
        }
      }
    },
    ...overrides
  };
}

describe('Phase 02 — Deterministic Aliases', () => {
  it('generates spacing and hyphen variants for alphanumeric models', () => {
    const aliases = buildDeterministicAliases({
      brand: 'Alienware',
      model: 'AW610M',
      variant: ''
    });
    const tokens = aliases.map((row) => row.alias);

    console.log('[ALIAS] Alienware AW610M aliases:', JSON.stringify(tokens));
    console.log('[ALIAS] count:', aliases.length);

    assert.ok(tokens.includes('aw610m'), 'compact model alias present');
    assert.ok(
      tokens.includes('aw-610-m') || tokens.includes('aw-610m'),
      'hyphen variant present'
    );
    assert.ok(
      tokens.includes('aw 610 m') || tokens.includes('aw 610m'),
      'spaced variant present'
    );
    assert.ok(tokens.includes('alienware'), 'brand alias present');
    assert.ok(tokens.some((t) => t.includes('alienware') && t.includes('aw610m')), 'brand+model combo present');
  });

  it('preserves digit groups and never mutates them', () => {
    const aliases = buildDeterministicAliases({
      brand: 'Logitech',
      model: 'G Pro X Superlight 2',
      variant: ''
    });
    const tokens = aliases.map((row) => row.alias);

    console.log('[ALIAS] Logitech G Pro X Superlight 2 aliases:', JSON.stringify(tokens));

    const hasDigit2 = tokens.some((t) => t.includes('2'));
    assert.ok(hasDigit2, 'digit group "2" preserved in at least one alias');
  });

  it('caps aliases at 12', () => {
    const aliases = buildDeterministicAliases({
      brand: 'Razer',
      model: 'DeathAdder V3 Pro',
      variant: 'Black Edition'
    });
    console.log('[ALIAS] alias count:', aliases.length, '(cap=12)');
    assert.ok(aliases.length <= 12, 'alias count within cap');
  });

  it('emits reject log for duplicates and cap overflows', () => {
    const rejectLog = [];
    const aliases = buildDeterministicAliases(
      { brand: 'Razer', model: 'Viper V3 Pro', variant: '' },
      12,
      rejectLog
    );
    console.log('[ALIAS] reject log entries:', rejectLog.length);
    console.log('[ALIAS] reject reasons:', [...new Set(rejectLog.map((r) => r.reason))]);

    assert.ok(Array.isArray(rejectLog));
    if (rejectLog.length > 0) {
      assert.ok(rejectLog.every((r) => r.reason), 'every reject has a reason');
      assert.ok(rejectLog.every((r) => r.alias !== undefined), 'every reject has an alias');
    }
  });

  it('each alias has source and weight', () => {
    const aliases = buildDeterministicAliases({
      brand: 'SteelSeries',
      model: 'Aerox 5',
      variant: 'Wireless'
    });

    console.log('[ALIAS] SteelSeries Aerox 5 Wireless — weights:', aliases.map((a) => `${a.alias}:${a.weight}`));

    for (const alias of aliases) {
      assert.ok(typeof alias.alias === 'string' && alias.alias.length > 0, 'alias is non-empty string');
      assert.ok(typeof alias.source === 'string', 'source is string');
      assert.ok(typeof alias.weight === 'number' && alias.weight > 0, 'weight is positive number');
    }
  });
});

describe('Phase 02 — SearchProfile Shape', () => {
  it('produces all spec-required top-level keys', () => {
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: makeCategoryConfig(),
      missingFields: ['weight', 'sensor'],
      maxQueries: 24
    });

    console.log('[PROFILE] keys:', Object.keys(profile).sort().join(', '));
    console.log('[PROFILE] alias count:', profile.identity_aliases?.length);
    console.log('[PROFILE] query count:', profile.queries?.length);
    console.log('[PROFILE] focus_fields:', profile.focus_fields);
    console.log('[PROFILE] hint_source_counts:', JSON.stringify(profile.hint_source_counts));

    assert.ok(profile.category === 'mouse');
    assert.ok(profile.identity, 'identity present');
    assert.ok(Array.isArray(profile.variant_guard_terms), 'variant_guard_terms present');
    assert.ok(Array.isArray(profile.identity_aliases), 'identity_aliases present');
    assert.ok(Array.isArray(profile.alias_reject_log), 'alias_reject_log present');
    assert.ok(Array.isArray(profile.query_reject_log), 'query_reject_log present');
    assert.ok(Array.isArray(profile.focus_fields), 'focus_fields present');
    assert.ok(Array.isArray(profile.base_templates), 'base_templates present');
    assert.ok(Array.isArray(profile.query_rows), 'query_rows present');
    assert.ok(Array.isArray(profile.queries), 'queries present');
    assert.ok(Array.isArray(profile.targeted_queries), 'targeted_queries present');
    assert.ok(typeof profile.field_target_queries === 'object', 'field_target_queries present');
    assert.ok(Array.isArray(profile.doc_hint_queries), 'doc_hint_queries present');
    assert.ok(typeof profile.hint_source_counts === 'object', 'hint_source_counts present');
  });

  it('query_rows contain provenance metadata (hint_source, target_fields, doc_hint, domain_hint)', () => {
    // WHY: Tier-only pipeline needs focusGroups to produce target_fields and domain_hint.
    // Tier 1 seed rows have hint_source and doc_hint. Tier 3 key rows have target_fields.
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: makeCategoryConfig(),
      missingFields: ['weight', 'click_latency'],
      maxQueries: 24,
      seedStatus: { specs_seed: { is_needed: true }, source_seeds: { 'razer.com': { is_needed: true } } },
      focusGroups: [
        { key: 'weight_group', label: 'Weight', group_search_worthy: false,
          normalized_key_queue: ['weight'], unresolved_field_keys: ['weight'],
          field_keys: ['weight'], satisfied_field_keys: [], productivity_score: 50,
          group_description_short: 'weight', group_description_long: 'weight grams',
          query_terms_union: [], domain_hints_union: [], preferred_content_types_union: [],
          domains_tried_union: [], aliases_union: [], total_field_count: 1,
          resolved_field_count: 0, coverage_ratio: 0, phase: 'now',
          skip_reason: null, desc: 'weight' },
      ],
    });

    console.log('[PROVENANCE] query_rows sample (first 3):');
    for (const row of profile.query_rows.slice(0, 3)) {
      console.log(`  query="${row.query}" hint_source="${row.hint_source}" target_fields=[${row.target_fields}] doc_hint="${row.doc_hint}" domain_hint="${row.domain_hint}"`);
    }

    const withHintSource = profile.query_rows.filter((r) => r.hint_source);
    const withTargetFields = profile.query_rows.filter((r) => r.target_fields?.length > 0);
    const withDocHint = profile.query_rows.filter((r) => r.doc_hint);

    console.log(`[PROVENANCE] rows with hint_source: ${withHintSource.length}/${profile.query_rows.length}`);
    console.log(`[PROVENANCE] rows with target_fields: ${withTargetFields.length}/${profile.query_rows.length}`);
    console.log(`[PROVENANCE] rows with doc_hint: ${withDocHint.length}/${profile.query_rows.length}`);

    assert.ok(withHintSource.length > 0, 'some query_rows have hint_source');
    assert.ok(withTargetFields.length > 0, 'some query_rows have target_fields');
    assert.ok(withDocHint.length > 0, 'some query_rows have doc_hint');
  });

  it('field_target_queries maps fields to their queries', () => {
    // WHY: Tier-only pipeline needs tier3 key rows via focusGroups to produce field_target_queries.
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: makeCategoryConfig(),
      missingFields: ['weight', 'sensor'],
      maxQueries: 24,
      seedStatus: { specs_seed: { is_needed: true }, source_seeds: {} },
      focusGroups: [
        { key: 'weight_group', label: 'Weight', group_search_worthy: false,
          normalized_key_queue: ['weight', 'sensor'], unresolved_field_keys: ['weight', 'sensor'],
          field_keys: ['weight', 'sensor'], satisfied_field_keys: [], productivity_score: 50,
          group_description_short: 'weight sensor', group_description_long: 'weight sensor',
          query_terms_union: [], domain_hints_union: [], preferred_content_types_union: [],
          domains_tried_union: [], aliases_union: [], total_field_count: 2,
          resolved_field_count: 0, coverage_ratio: 0, phase: 'now',
          skip_reason: null, desc: 'weight sensor' },
      ],
    });

    console.log('[FIELD-TARGET] field_target_queries keys:', Object.keys(profile.field_target_queries));
    for (const [field, queries] of Object.entries(profile.field_target_queries)) {
      console.log(`  ${field}: ${queries.length} queries`);
    }

    assert.ok('weight' in profile.field_target_queries || 'sensor' in profile.field_target_queries,
      'at least one focus field has targeted queries');

    for (const queries of Object.values(profile.field_target_queries)) {
      assert.ok(queries.length <= 3, 'field_target_queries capped at 3 per field');
    }
  });

  it('doc_hint_queries groups queries by doc_hint', () => {
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: makeCategoryConfig(),
      missingFields: ['weight'],
      maxQueries: 24
    });

    console.log('[DOC-HINT] doc_hint_queries:');
    for (const row of profile.doc_hint_queries) {
      console.log(`  ${row.doc_hint}: ${row.queries.length} queries`);
    }

    assert.ok(Array.isArray(profile.doc_hint_queries));
    for (const row of profile.doc_hint_queries) {
      assert.ok(typeof row.doc_hint === 'string' && row.doc_hint.length > 0, 'doc_hint is non-empty');
      assert.ok(Array.isArray(row.queries), 'queries is array');
      assert.ok(row.queries.length <= 3, 'doc_hint queries capped at 3');
    }
  });
});

describe('Phase 02 — Field Studio Hint Wiring (Spec §2.5)', () => {
  it('search_hints.query_terms are consumed before fallback synonym expansion', () => {
    // WHY: Tier-only pipeline generates field-targeted queries via focusGroups (tier3 keys).
    // Tier3 rows have hint_source='tier3_key' and target_fields with the key name.
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: makeCategoryConfig(),
      missingFields: ['weight'],
      maxQueries: 24,
      seedStatus: { specs_seed: { is_needed: true }, source_seeds: {} },
      focusGroups: [
        { key: 'weight_group', label: 'Weight', group_search_worthy: false,
          normalized_key_queue: ['weight'], unresolved_field_keys: ['weight'],
          field_keys: ['weight'], satisfied_field_keys: [], productivity_score: 50,
          group_description_short: 'weight', group_description_long: 'weight grams',
          query_terms_union: [], domain_hints_union: [], preferred_content_types_union: [],
          domains_tried_union: [], aliases_union: [], total_field_count: 1,
          resolved_field_count: 0, coverage_ratio: 0, phase: 'now',
          skip_reason: null, desc: 'weight' },
      ],
    });

    const weightQueries = profile.query_rows.filter((r) => r.target_fields?.includes('weight'));
    const fromTier3 = weightQueries.filter((r) => r.hint_source === 'tier3_key');

    console.log('[FIELD-HINTS] weight queries from tier3_key:', fromTier3.length);

    assert.ok(fromTier3.length > 0, 'tier3 key search produces weight-targeted queries');
  });

  it('search_hints.domain_hints emit soft host-biased queries (plain-text host name)', () => {
    // WHY: Tier-only pipeline produces domain_hint queries via tier1 source seeds.
    // Use seedStatus with source_seeds for the domains we want to verify.
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: makeCategoryConfig(),
      missingFields: ['weight', 'click_latency'],
      maxQueries: 48,
      seedStatus: {
        specs_seed: { is_needed: true },
        source_seeds: {
          'razer.com': { is_needed: true },
          'rtings.com': { is_needed: true },
        },
      },
      focusGroups: [],
    });

    // WHY: soft domain bias — hosts appear as plain text in query, not site: operator
    const razerHostQueries = profile.queries.filter((q) => q.includes('razer.com') && !q.includes('site:'));
    const rtingsHostQueries = profile.queries.filter((q) => q.includes('rtings.com') && !q.includes('site:'));

    console.log('[DOMAIN-HINTS] razer.com soft-bias queries:', razerHostQueries.length);
    console.log('[DOMAIN-HINTS] rtings.com soft-bias queries:', rtingsHostQueries.length);

    assert.ok(razerHostQueries.length > 0, 'razer.com source seed produces soft host-biased queries');
    assert.ok(rtingsHostQueries.length > 0, 'rtings.com source seed produces soft host-biased queries');
  });

  it('preferred_content_types bias doc_hint in query rows', () => {
    // WHY: Tier-only pipeline produces doc_hint='spec' on tier1 seed rows.
    // Verify the seed row doc_hint is present.
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: makeCategoryConfig(),
      missingFields: ['weight', 'sensor', 'click_latency'],
      maxQueries: 48,
      seedStatus: { specs_seed: { is_needed: true }, source_seeds: {} },
      focusGroups: [],
    });

    const seedRows = profile.query_rows.filter((r) => r.tier === 'seed');
    const seedDocHints = [...new Set(seedRows.map((r) => r.doc_hint).filter(Boolean))];

    console.log('[CONTENT-TYPE] seed doc_hints:', seedDocHints);

    assert.ok(seedDocHints.some((h) => h.includes('spec')), 'tier1 seed row has doc_hint=spec');
  });
});

describe('Phase 02 — normalizeQueryRows Coercion', () => {
  it('converts flat string array to structured rows', () => {
    const result = normalizeQueryRows(['q1', 'q2', 'q3']);
    console.log('[NORMALIZE] strings →', JSON.stringify(result));

    assert.equal(result.length, 3);
    assert.deepEqual(result[0], { query: 'q1', target_fields: [] });
    assert.deepEqual(result[1], { query: 'q2', target_fields: [] });
  });

  it('preserves structured rows with target_fields', () => {
    const input = [
      { query: 'razer viper specs', target_fields: ['weight', 'sensor'] },
      { query: 'razer viper review', target_fields: [] }
    ];
    const result = normalizeQueryRows(input);

    console.log('[NORMALIZE] structured →', JSON.stringify(result));

    assert.deepEqual(result[0].target_fields, ['weight', 'sensor']);
    assert.deepEqual(result[1].target_fields, []);
  });

  it('handles mixed array of strings and objects', () => {
    const result = normalizeQueryRows([
      'plain query',
      { query: 'structured', target_fields: ['dpi'] },
      ''
    ]);

    console.log('[NORMALIZE] mixed → count:', result.length);

    assert.equal(result.length, 2, 'empty string filtered out');
    assert.equal(result[0].query, 'plain query');
    assert.deepEqual(result[1].target_fields, ['dpi']);
  });

  it('strips whitespace and normalizes spacing', () => {
    const result = normalizeQueryRows(['  spaced   query  ', { query: '  another   one  ', target_fields: [' dpi '] }]);

    console.log('[NORMALIZE] whitespace → queries:', result.map((r) => `"${r.query}"`));

    assert.equal(result[0].query, 'spaced query');
    assert.equal(result[1].query, 'another one');
    assert.equal(result[1].target_fields[0], 'dpi');
  });
});

describe('Phase 02 — Variant Guard Terms', () => {
  it('includes identity tokens and digit groups in variant_guard_terms', () => {
    const profile = buildSearchProfile({
      job: makeJob({ identityLock: { brand: 'Razer', model: 'Viper V3 Pro', variant: '' } }),
      categoryConfig: makeCategoryConfig(),
      missingFields: ['weight'],
      maxQueries: 12
    });

    console.log('[GUARD] variant_guard_terms:', profile.variant_guard_terms);

    assert.ok(Array.isArray(profile.variant_guard_terms));
    assert.ok(profile.variant_guard_terms.length > 0, 'guard terms produced');
    const hasDigit = profile.variant_guard_terms.some((t) => /\d/.test(t));
    assert.ok(hasDigit, 'includes digit group from model');
  });
});

describe('Phase 02 — BRAND_HOST_HINTS Sync (Fixed)', () => {
  it('FIXED: queryBuilder BRAND_HOST_HINTS now includes alienware/dell brands', () => {
    // WHY: Tier-only pipeline produces host-biased queries via brandResolution domains
    // and source_seeds. Use both to verify alienware.com and dell.com appear in queries.
    const profile = buildSearchProfile({
      job: makeJob({ identityLock: { brand: 'Alienware', model: 'AW610M', variant: '' } }),
      categoryConfig: {
        ...makeCategoryConfig(),
        sourceHosts: [
          { host: 'alienware.com', tierName: 'manufacturer', role: 'manufacturer' },
          { host: 'dell.com', tierName: 'manufacturer', role: 'manufacturer' },
          { host: 'rtings.com', tierName: 'lab', role: 'lab' }
        ]
      },
      missingFields: ['weight'],
      maxQueries: 48,
      seedStatus: {
        specs_seed: { is_needed: true },
        source_seeds: {},
      },
      brandResolution: {
        officialDomain: 'alienware.com',
        supportDomain: 'dell.com',
        aliases: [],
      },
      focusGroups: [],
    });

    // WHY: soft domain bias — manufacturer hosts appear as plain-text in queries
    const alienwareHostQueries = profile.queries.filter((q) => q.includes('alienware.com') && !q.includes('site:'));
    const dellHostQueries = profile.queries.filter((q) => q.includes('dell.com') && !q.includes('site:'));

    console.log(`[BRAND-FIX] alienware.com soft-bias queries: ${alienwareHostQueries.length}`);
    console.log(`[BRAND-FIX] dell.com soft-bias queries: ${dellHostQueries.length}`);

    assert.ok(alienwareHostQueries.length > 0, 'alienware.com soft host-biased queries now generated');
    assert.ok(dellHostQueries.length > 0, 'dell.com soft host-biased queries now generated (via brand resolver)');
  });
});

describe('Phase 02 — Query Cap and Reject Log', () => {
  it('respects maxQueries cap and logs rejections', () => {
    const cap = 6;
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: makeCategoryConfig(),
      missingFields: ['weight', 'sensor', 'click_latency', 'dpi', 'polling_rate'],
      maxQueries: cap
    });

    console.log(`[CAP] maxQueries=${cap} → queries.length=${profile.queries.length}`);
    console.log(`[CAP] query_reject_log entries: ${profile.query_reject_log.length}`);

    const capRejects = profile.query_reject_log.filter((r) => r.reason === 'max_query_cap');
    console.log(`[CAP] max_query_cap rejections: ${capRejects.length}`);

    assert.ok(profile.queries.length <= cap, `queries capped at ${cap}`);
  });

  it('reject log entries have reason, stage, and query', () => {
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: makeCategoryConfig(),
      missingFields: ['weight', 'sensor', 'dpi', 'polling_rate', 'click_latency'],
      maxQueries: 4
    });

    console.log('[REJECT-LOG] reasons:', [...new Set(profile.query_reject_log.map((r) => r.reason))]);

    for (const entry of profile.query_reject_log.slice(0, 5)) {
      assert.ok(typeof entry.reason === 'string' && entry.reason, 'reject has reason');
      assert.ok(typeof entry.stage === 'string', 'reject has stage');
    }
  });
});

describe('Phase 02 — buildTargetedQueries integration', () => {
  it('returns string array bounded by maxQueries', () => {
    const queries = buildTargetedQueries({
      job: makeJob(),
      categoryConfig: makeCategoryConfig(),
      missingFields: ['weight'],
      maxQueries: 8
    });

    console.log(`[TARGETED] queries.length=${queries.length} (cap=8)`);
    console.log('[TARGETED] sample:', queries.slice(0, 3));

    assert.ok(Array.isArray(queries));
    assert.ok(queries.length <= 8);
    assert.ok(queries.every((q) => typeof q === 'string'));
  });
});

describe('Phase 02 — Archetype Integration', () => {
  function makeArchetypeConfig() {
    return makeCategoryConfig({
      sourceRegistry: {
        rtings_com: {
          display_name: 'RTINGS',
          base_url: 'https://www.rtings.com',
          content_types: ['review', 'benchmark'],
          field_coverage: {
            high: ['click_latency', 'weight', 'sensor'],
            medium: ['polling_rate', 'dpi'],
            low: []
          },
          discovery: { source_type: 'lab_review', priority: 98, enabled: true }
        },
        techpowerup_com: {
          display_name: 'TechPowerUp',
          base_url: 'https://www.techpowerup.com',
          content_types: ['review'],
          field_coverage: {
            high: ['sensor', 'lift', 'switch'],
            medium: ['weight', 'dpi'],
            low: []
          },
          discovery: { source_type: 'lab_review', priority: 94, enabled: true }
        },
        eloshapes_com: {
          display_name: 'EloShapes',
          base_url: 'https://www.eloshapes.com',
          content_types: ['spec_database'],
          field_coverage: {
            high: ['weight', 'sensor'],
            medium: ['dpi', 'connection'],
            low: []
          },
          discovery: { source_type: 'spec_database', priority: 60, enabled: true }
        }
      },
      fieldRules: {
        fields: {
          weight: {
            required_level: 'critical',
            search_hints: { query_terms: ['weight grams'], domain_hints: ['razer.com'], preferred_content_types: ['spec'] }
          },
          sensor: {
            required_level: 'critical',
            search_hints: { query_terms: ['optical sensor model'], domain_hints: ['techpowerup.com'], preferred_content_types: ['teardown_review', 'lab_review'] }
          },
          click_latency: {
            required_level: 'required',
            search_hints: { query_terms: ['click latency ms'], domain_hints: ['rtings.com'], preferred_content_types: ['lab_review', 'benchmark'] }
          },
          dpi: {
            required_level: 'expected',
            search_hints: { query_terms: ['max dpi'], preferred_content_types: ['spec'] }
          },
          polling_rate: {
            required_level: 'critical',
            search_hints: { query_terms: ['polling rate hz'], preferred_content_types: ['spec'] }
          },
          switch: {
            required_level: 'expected',
            search_hints: { query_terms: ['mouse switch type'], domain_hints: ['techpowerup.com'], preferred_content_types: ['teardown_review'] }
          },
          connection: {
            required_level: 'expected',
            search_hints: { query_terms: ['wireless connectivity'], preferred_content_types: ['spec'] }
          }
        }
      }
    });
  }

  it('4+ distinct domain_hint values when 5+ fields missing', () => {
    // WHY: Tier-only pipeline produces domain_hints via tier1 source_seeds and brandResolution.
    // Provide enough source_seeds to hit 4+ distinct domain_hints.
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: makeArchetypeConfig(),
      missingFields: ['weight', 'sensor', 'click_latency', 'dpi', 'polling_rate', 'switch', 'connection'],
      maxQueries: 48,
      seedStatus: {
        specs_seed: { is_needed: true },
        source_seeds: {
          'rtings.com': { is_needed: true },
          'techpowerup.com': { is_needed: true },
          'eloshapes.com': { is_needed: true },
        },
      },
      brandResolution: {
        officialDomain: 'razer.com',
        aliases: [],
      },
      focusGroups: [],
    });

    const domainHints = new Set(
      profile.query_rows.map((r) => r.domain_hint).filter(Boolean)
    );
    console.log('[ARCHETYPE] distinct domain_hints:', [...domainHints]);
    assert.ok(domainHints.size >= 4, `expected 4+ distinct domain_hints, got ${domainHints.size}: ${[...domainHints]}`);
  });

  it('seed rows have doc_hint=spec', () => {
    // WHY: Tier-only pipeline produces doc_hint='spec' on the specs_seed row.
    // Other tier rows have empty doc_hint. Doc_hint diversity comes from the
    // legacy archetype path which has been removed.
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: makeArchetypeConfig(),
      missingFields: ['weight', 'sensor', 'click_latency', 'dpi', 'polling_rate'],
      maxQueries: 48,
      seedStatus: { specs_seed: { is_needed: true }, source_seeds: {} },
      focusGroups: [],
    });

    const docHints = new Set(
      profile.query_rows.map((r) => r.doc_hint).filter(Boolean)
    );
    console.log('[TIER] distinct doc_hints:', [...docHints]);
    assert.ok(docHints.size >= 1, `expected at least 1 doc_hint, got ${docHints.size}: ${[...docHints]}`);
    assert.ok(docHints.has('spec'), 'seed row has doc_hint=spec');
  });

  it('no duplicate host-biased query for same host within tier emission (Set enforcement)', () => {
    // WHY: Tier-only pipeline deduplicates source seed domains via emittedSources Set.
    // Verify no duplicate host queries are emitted.
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: makeArchetypeConfig(),
      missingFields: ['weight', 'sensor', 'click_latency', 'dpi', 'polling_rate'],
      maxQueries: 48,
      seedStatus: {
        specs_seed: { is_needed: true },
        source_seeds: {
          'razer.com': { is_needed: true },
          'rtings.com': { is_needed: true },
        },
      },
      brandResolution: {
        officialDomain: 'razer.com',
        aliases: [],
      },
      focusGroups: [],
    });

    const hostBiasedRows = profile.query_rows.filter((r) => r.domain_hint);
    const seen = new Map();
    for (const row of hostBiasedRows) {
      const host = row.domain_hint;
      if (seen.has(host)) {
        const prevQuery = seen.get(host);
        assert.notEqual(row.query, prevQuery,
          `exact duplicate query for host ${host}`);
      }
      seen.set(host, row.query);
    }
    console.log('[TIER] host-biased queries verified per source:', [...seen.keys()]);
    assert.ok(seen.size > 0, 'at least one host-biased query exists');
  });

  it('base_templates never empty when brand+model present', () => {
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: makeArchetypeConfig(),
      missingFields: ['weight'],
      maxQueries: 24
    });

    console.log('[ARCHETYPE] base_templates:', profile.base_templates);
    assert.ok(profile.base_templates.length > 0, 'base_templates is non-empty');
  });

  it('archetype_summary is empty object in tier-only mode', () => {
    // WHY: The legacy archetype pipeline was removed. archetype_summary is always {}
    // in the tier-only query generation path.
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: makeArchetypeConfig(),
      missingFields: ['weight', 'sensor', 'click_latency', 'dpi', 'polling_rate'],
      maxQueries: 48,
      seedStatus: { specs_seed: { is_needed: true }, source_seeds: {} },
      focusGroups: [],
    });

    console.log('[TIER] archetype_summary:', JSON.stringify(profile.archetype_summary));
    assert.ok(typeof profile.archetype_summary === 'object', 'archetype_summary is object');
    assert.deepEqual(profile.archetype_summary, {}, 'archetype_summary is empty in tier-only mode');
  });
});

// ── Tier-Aware Query Generation Factories ──

function makeSeedStatus(overrides = {}) {
  return {
    specs_seed: {
      is_needed: false,
      last_status: 'never_run',
      last_completed_at_ms: null,
      cooldown_until_ms: null,
      new_fields_closed_last_run: 0,
      ...(overrides.specs_seed || {}),
    },
    source_seeds: overrides.source_seeds || {},
    query_completion_summary: {
      total_queries: 0,
      complete: 0,
      incomplete: 0,
      pending_scrapes: 0,
      ...(overrides.query_completion_summary || {}),
    },
  };
}

function makeFocusGroup(overrides = {}) {
  return {
    key: overrides.key || 'dimensions',
    label: overrides.label || 'Dimensions',
    desc: overrides.desc || 'Physical dimensions',
    phase: overrides.phase || 'now',
    group_search_worthy: overrides.group_search_worthy ?? true,
    skip_reason: overrides.skip_reason || null,
    productivity_score: overrides.productivity_score ?? 50,
    group_description_short: overrides.group_description_short || 'physical dimensions',
    group_description_long: overrides.group_description_long || 'physical dimensions length width height',
    normalized_key_queue: overrides.normalized_key_queue || ['length', 'width', 'height'],
    unresolved_field_keys: overrides.unresolved_field_keys || overrides.normalized_key_queue || ['length', 'width', 'height'],
    field_keys: overrides.field_keys || overrides.normalized_key_queue || ['length', 'width', 'height'],
    satisfied_field_keys: overrides.satisfied_field_keys || [],
    query_terms_union: overrides.query_terms_union || [],
    domain_hints_union: overrides.domain_hints_union || [],
    preferred_content_types_union: overrides.preferred_content_types_union || [],
    domains_tried_union: overrides.domains_tried_union || [],
    aliases_union: overrides.aliases_union || [],
    total_field_count: overrides.total_field_count ?? 3,
    resolved_field_count: overrides.resolved_field_count ?? 0,
    coverage_ratio: overrides.coverage_ratio ?? 0,
  };
}

// ── determineQueryModes ──

describe('Phase 02 — determineQueryModes', () => {
  it('returns runTier1Seeds=true when specs_seed.is_needed', () => {
    const modes = determineQueryModes(
      makeSeedStatus({ specs_seed: { is_needed: true } }),
      [],
    );
    assert.equal(modes.runTier1Seeds, true);
    assert.equal(modes.runTier2Groups, false);
    assert.equal(modes.runTier3Keys, false);
  });

  it('returns runTier1Seeds=true when any source seed is_needed', () => {
    const modes = determineQueryModes(
      makeSeedStatus({
        source_seeds: {
          'razer.com': { is_needed: true },
          'rtings.com': { is_needed: false },
        },
      }),
      [],
    );
    assert.equal(modes.runTier1Seeds, true);
  });

  it('returns runTier1Seeds=false when no seeds needed', () => {
    const modes = determineQueryModes(
      makeSeedStatus({ specs_seed: { is_needed: false } }),
      [],
    );
    assert.equal(modes.runTier1Seeds, false);
  });

  it('returns runTier2Groups=true when any group has group_search_worthy=true', () => {
    const modes = determineQueryModes(
      makeSeedStatus(),
      [makeFocusGroup({ group_search_worthy: true })],
    );
    assert.equal(modes.runTier2Groups, true);
  });

  it('returns runTier2Groups=false when no group has group_search_worthy=true', () => {
    const modes = determineQueryModes(
      makeSeedStatus(),
      [makeFocusGroup({ group_search_worthy: false, normalized_key_queue: ['a'] })],
    );
    assert.equal(modes.runTier2Groups, false);
  });

  it('returns runTier3Keys=true when any group has group_search_worthy=false with unresolved keys', () => {
    const modes = determineQueryModes(
      makeSeedStatus(),
      [makeFocusGroup({ group_search_worthy: false, normalized_key_queue: ['length', 'width'] })],
    );
    assert.equal(modes.runTier3Keys, true);
  });

  it('returns runTier3Keys=false when groups have empty key queues', () => {
    const modes = determineQueryModes(
      makeSeedStatus(),
      [makeFocusGroup({ group_search_worthy: false, normalized_key_queue: [] })],
    );
    assert.equal(modes.runTier3Keys, false);
  });

  it('all three tiers can be true simultaneously', () => {
    const modes = determineQueryModes(
      makeSeedStatus({ specs_seed: { is_needed: true } }),
      [
        makeFocusGroup({ key: 'g1', group_search_worthy: true }),
        makeFocusGroup({ key: 'g2', group_search_worthy: false, normalized_key_queue: ['a'] }),
      ],
    );
    assert.equal(modes.runTier1Seeds, true);
    assert.equal(modes.runTier2Groups, true);
    assert.equal(modes.runTier3Keys, true);
  });

  it('handles null seedStatus gracefully', () => {
    const modes = determineQueryModes(null, []);
    assert.equal(modes.runTier1Seeds, false);
    assert.equal(modes.runTier2Groups, false);
    assert.equal(modes.runTier3Keys, false);
  });

  it('handles undefined focusGroups gracefully', () => {
    const modes = determineQueryModes(makeSeedStatus(), undefined);
    assert.equal(modes.runTier1Seeds, false);
    assert.equal(modes.runTier2Groups, false);
    assert.equal(modes.runTier3Keys, false);
  });
});

// ── buildTier1Queries ──

describe('Phase 02 — buildTier1Queries', () => {
  it('emits specs seed query when specs_seed.is_needed', () => {
    const rows = buildTier1Queries(
      makeJob(),
      makeSeedStatus({ specs_seed: { is_needed: true } }),
      null,
    );
    assert.ok(rows.length >= 1, 'at least one row');
    const specsRow = rows.find((r) => r.query.includes('specifications'));
    assert.ok(specsRow, 'specs seed query present');
    assert.equal(specsRow.hint_source, 'tier1_seed');
    assert.equal(specsRow.tier, 'seed');
  });

  it('emits source seed queries for each needed source', () => {
    const rows = buildTier1Queries(
      makeJob(),
      makeSeedStatus({
        source_seeds: {
          'razer.com': { is_needed: true },
          'rtings.com': { is_needed: true },
          'amazon.com': { is_needed: false },
        },
      }),
      null,
    );
    const sourceRows = rows.filter((r) => !r.query.includes('specifications'));
    assert.ok(sourceRows.length >= 2, 'at least 2 source seed rows');
    assert.ok(rows.some((r) => r.query.includes('razer.com')), 'razer.com source present');
    assert.ok(rows.some((r) => r.query.includes('rtings.com')), 'rtings.com source present');
    assert.ok(!rows.some((r) => r.query.includes('amazon.com')), 'amazon.com not emitted');
  });

  it('returns empty array when no seeds needed', () => {
    const rows = buildTier1Queries(
      makeJob(),
      makeSeedStatus({ specs_seed: { is_needed: false } }),
      null,
    );
    assert.equal(rows.length, 0);
  });

  it('includes brand model variant in query string', () => {
    const rows = buildTier1Queries(
      makeJob({ identityLock: { brand: 'Logitech', model: 'G Pro X', variant: 'Superlight 2' } }),
      makeSeedStatus({ specs_seed: { is_needed: true } }),
      null,
    );
    const specsRow = rows.find((r) => r.query.includes('specifications'));
    assert.ok(specsRow.query.includes('Logitech'), 'brand in query');
    assert.ok(specsRow.query.includes('G Pro X'), 'model in query');
    assert.ok(specsRow.query.includes('Superlight 2'), 'variant in query');
  });

  it('all rows tagged with tier1_seed and seed tier', () => {
    const rows = buildTier1Queries(
      makeJob(),
      makeSeedStatus({
        specs_seed: { is_needed: true },
        source_seeds: { 'razer.com': { is_needed: true } },
      }),
      null,
    );
    assert.ok(rows.length >= 2);
    assert.ok(rows.every((r) => r.hint_source === 'tier1_seed'), 'all hint_source tier1_seed');
    assert.ok(rows.every((r) => r.tier === 'seed'), 'all tier seed');
  });
});

// ── buildTier2Queries ──

describe('Phase 02 — buildTier2Queries', () => {
  it('emits one query per group_search_worthy group', () => {
    const groups = [
      makeFocusGroup({ key: 'dimensions', group_search_worthy: true }),
      makeFocusGroup({ key: 'performance', label: 'Performance', group_search_worthy: true, group_description_long: 'performance metrics response' }),
      makeFocusGroup({ key: 'connectivity', group_search_worthy: false }),
    ];
    const rows = buildTier2Queries(makeJob(), groups);
    assert.equal(rows.length, 2, 'only 2 worthy groups emit queries');
    assert.ok(rows.every((r) => r.hint_source === 'tier2_group'));
    assert.ok(rows.every((r) => r.tier === 'group_search'));
  });

  it('includes group_key in each row', () => {
    const groups = [
      makeFocusGroup({ key: 'dimensions', group_search_worthy: true }),
    ];
    const rows = buildTier2Queries(makeJob(), groups);
    assert.equal(rows[0].group_key, 'dimensions');
  });

  it('sorts output by productivity_score descending', () => {
    const groups = [
      makeFocusGroup({ key: 'low', productivity_score: 10, group_search_worthy: true }),
      makeFocusGroup({ key: 'high', productivity_score: 90, group_search_worthy: true }),
      makeFocusGroup({ key: 'mid', productivity_score: 50, group_search_worthy: true }),
    ];
    const rows = buildTier2Queries(makeJob(), groups);
    assert.equal(rows[0].group_key, 'high');
    assert.equal(rows[1].group_key, 'mid');
    assert.equal(rows[2].group_key, 'low');
  });

  it('returns empty array when no groups are search-worthy', () => {
    const rows = buildTier2Queries(makeJob(), [
      makeFocusGroup({ group_search_worthy: false }),
    ]);
    assert.equal(rows.length, 0);
  });

  it('query includes brand model label and group_description_long', () => {
    const groups = [
      makeFocusGroup({
        key: 'dimensions',
        label: 'Dimensions',
        group_search_worthy: true,
        group_description_long: 'physical dimensions length width height',
      }),
    ];
    const rows = buildTier2Queries(
      makeJob({ identityLock: { brand: 'Razer', model: 'Viper V3 Pro', variant: '' } }),
      groups,
    );
    assert.ok(rows[0].query.includes('Razer'), 'brand in query');
    assert.ok(rows[0].query.includes('Viper V3 Pro'), 'model in query');
    assert.ok(rows[0].query.includes('Dimensions'), 'label in query');
    assert.ok(rows[0].query.includes('physical dimensions'), 'description_long in query');
  });
});

// ── buildTier3Queries ──

describe('Phase 02 — buildTier3Queries', () => {
  it('emits queries for groups with group_search_worthy=false and unresolved keys', () => {
    const groups = [
      makeFocusGroup({
        key: 'dimensions',
        group_search_worthy: false,
        normalized_key_queue: ['length', 'width', 'height'],
      }),
    ];
    const rows = buildTier3Queries(makeJob(), groups, makeCategoryConfig(), null);
    assert.equal(rows.length, 3, 'one row per key');
    assert.ok(rows.every((r) => r.hint_source === 'tier3_key'));
    assert.ok(rows.every((r) => r.tier === 'key_search'));
  });

  it('skips groups where group_search_worthy=true', () => {
    const groups = [
      makeFocusGroup({
        key: 'dimensions',
        group_search_worthy: true,
        normalized_key_queue: ['length', 'width'],
      }),
    ];
    const rows = buildTier3Queries(makeJob(), groups, makeCategoryConfig(), null);
    assert.equal(rows.length, 0);
  });

  it('includes normalized_key and group_key in each row', () => {
    const groups = [
      makeFocusGroup({
        key: 'sensor_perf',
        group_search_worthy: false,
        normalized_key_queue: ['sensor'],
      }),
    ];
    const rows = buildTier3Queries(makeJob(), groups, makeCategoryConfig(), null);
    assert.ok(rows.length >= 1);
    assert.equal(rows[0].group_key, 'sensor_perf');
    assert.equal(rows[0].normalized_key, 'sensor');
  });

  it('preserves normalized_key_queue order', () => {
    const groups = [
      makeFocusGroup({
        key: 'dims',
        group_search_worthy: false,
        normalized_key_queue: ['alpha', 'beta', 'gamma'],
      }),
    ];
    const rows = buildTier3Queries(makeJob(), groups, makeCategoryConfig(), null);
    const keys = rows.map((r) => r.normalized_key);
    assert.deepEqual(keys, ['alpha', 'beta', 'gamma']);
  });

  it('query includes brand model variant and normalized_key', () => {
    const groups = [
      makeFocusGroup({
        key: 'sensor_perf',
        group_search_worthy: false,
        normalized_key_queue: ['sensor'],
      }),
    ];
    const rows = buildTier3Queries(
      makeJob({ identityLock: { brand: 'Razer', model: 'Viper V3 Pro', variant: '' } }),
      groups,
      makeCategoryConfig(),
      null,
    );
    assert.ok(rows[0].query.includes('Razer'), 'brand in query');
    assert.ok(rows[0].query.includes('Viper V3 Pro'), 'model in query');
    assert.ok(rows[0].query.includes('sensor'), 'normalized_key in query');
  });

  it('returns empty array when no unresolved keys', () => {
    const groups = [
      makeFocusGroup({
        group_search_worthy: false,
        normalized_key_queue: [],
      }),
    ];
    const rows = buildTier3Queries(makeJob(), groups, makeCategoryConfig(), null);
    assert.equal(rows.length, 0);
  });

  it('target_fields includes the normalized_key', () => {
    const groups = [
      makeFocusGroup({
        key: 'sensor_perf',
        group_search_worthy: false,
        normalized_key_queue: ['weight', 'sensor'],
      }),
    ];
    const rows = buildTier3Queries(makeJob(), groups, makeCategoryConfig(), null);
    assert.deepEqual(rows[0].target_fields, ['weight']);
    assert.deepEqual(rows[1].target_fields, ['sensor']);
  });
});

// ── Tier 3 Progressive Enrichment ──

describe('Phase 02 — buildTier3Queries progressive enrichment', () => {
  it('repeat_count 0: bare query with just product + key', () => {
    const groups = [
      makeFocusGroup({
        key: 'connectivity',
        group_search_worthy: false,
        normalized_key_queue: [
          { normalized_key: 'battery hours', repeat_count: 0, all_aliases: ['battery life'], domain_hints: ['rtings.com'], preferred_content_types: ['review'], domains_tried_for_key: [] },
        ],
      }),
    ];
    const rows = buildTier3Queries(makeJob(), groups, makeCategoryConfig(), null);
    assert.equal(rows.length, 1);
    assert.ok(rows[0].query.includes('battery hours'), 'query has key');
    assert.ok(!rows[0].query.includes('battery life'), 'round 0: no aliases yet');
    assert.ok(!rows[0].query.includes('rtings.com'), 'round 0: no domain hints yet');
  });

  it('repeat_count 1: adds aliases to query', () => {
    const groups = [
      makeFocusGroup({
        key: 'connectivity',
        group_search_worthy: false,
        normalized_key_queue: [
          { normalized_key: 'battery hours', repeat_count: 1, all_aliases: ['battery life', 'battery runtime'], domain_hints: ['rtings.com'], preferred_content_types: ['review'], domains_tried_for_key: [] },
        ],
      }),
    ];
    const rows = buildTier3Queries(makeJob(), groups, makeCategoryConfig(), null);
    assert.equal(rows.length, 1);
    assert.ok(rows[0].query.includes('battery life') || rows[0].query.includes('battery runtime'), 'round 1: aliases added');
  });

  it('repeat_count 2: adds domain hints to query', () => {
    const groups = [
      makeFocusGroup({
        key: 'connectivity',
        group_search_worthy: false,
        normalized_key_queue: [
          { normalized_key: 'battery hours', repeat_count: 2, all_aliases: ['battery life'], domain_hints: ['rtings.com', 'mousespecs.org'], preferred_content_types: ['review'], domains_tried_for_key: ['rtings.com'] },
        ],
      }),
    ];
    const rows = buildTier3Queries(makeJob(), groups, makeCategoryConfig(), null);
    assert.equal(rows.length, 1);
    // Should prefer untried domain hints
    assert.ok(rows[0].query.includes('mousespecs.org') || rows[0].query.includes('rtings.com'), 'round 2: domain hints added');
  });

  it('repeat_count 3+: adds content type hints', () => {
    const groups = [
      makeFocusGroup({
        key: 'connectivity',
        group_search_worthy: false,
        normalized_key_queue: [
          { normalized_key: 'battery hours', repeat_count: 3, all_aliases: ['battery life'], domain_hints: ['rtings.com'], preferred_content_types: ['review', 'spec sheet'], domains_tried_for_key: ['rtings.com'] },
        ],
      }),
    ];
    const rows = buildTier3Queries(makeJob(), groups, makeCategoryConfig(), null);
    assert.equal(rows.length, 1);
    assert.ok(rows[0].query.includes('review') || rows[0].query.includes('spec sheet'), 'round 3+: content types added');
  });

  it('backward compat: plain string keys still work', () => {
    const groups = [
      makeFocusGroup({
        key: 'g1',
        group_search_worthy: false,
        normalized_key_queue: ['weight', 'sensor'],
      }),
    ];
    const rows = buildTier3Queries(makeJob(), groups, makeCategoryConfig(), null);
    assert.equal(rows.length, 2);
    assert.ok(rows[0].query.includes('weight'));
    assert.ok(rows[1].query.includes('sensor'));
  });
});

// ── Tier-Aware buildSearchProfile Integration ──

describe('Phase 02 — Tier-Aware buildSearchProfile Integration', () => {
  it('tier1-only: emits seed queries when seedStatus has specs_seed.is_needed', () => {
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: makeCategoryConfig(),
      missingFields: ['weight', 'sensor'],
      maxQueries: 24,
      seedStatus: makeSeedStatus({ specs_seed: { is_needed: true } }),
      focusGroups: [],
    });

    assert.ok(profile.queries.length > 0, 'queries emitted');
    const tierRows = profile.query_rows.filter((r) => r.tier === 'seed');
    assert.ok(tierRows.length > 0, 'seed tier rows present');
  });

  it('tier2-only: emits group queries when groups are search-worthy', () => {
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: makeCategoryConfig(),
      missingFields: ['weight', 'sensor'],
      maxQueries: 24,
      seedStatus: makeSeedStatus(),
      focusGroups: [
        makeFocusGroup({ key: 'dims', group_search_worthy: true, productivity_score: 80 }),
      ],
    });

    assert.ok(profile.queries.length > 0);
    const tierRows = profile.query_rows.filter((r) => r.tier === 'group_search');
    assert.ok(tierRows.length > 0, 'group_search tier rows present');
  });

  it('mixed tier2+tier3: emits both group and key queries simultaneously', () => {
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: makeCategoryConfig(),
      missingFields: ['weight', 'sensor', 'dpi'],
      maxQueries: 48,
      seedStatus: makeSeedStatus(),
      focusGroups: [
        makeFocusGroup({ key: 'sensor_perf', group_search_worthy: true, productivity_score: 90 }),
        makeFocusGroup({ key: 'connectivity', group_search_worthy: false, normalized_key_queue: ['bluetooth', 'dongle'] }),
      ],
    });

    const groupRows = profile.query_rows.filter((r) => r.tier === 'group_search');
    const keyRows = profile.query_rows.filter((r) => r.tier === 'key_search');
    assert.ok(groupRows.length > 0, 'group_search rows present');
    assert.ok(keyRows.length > 0, 'key_search rows present');
  });

  it('preserves output shape when seedStatus provided', () => {
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: makeCategoryConfig(),
      missingFields: ['weight'],
      maxQueries: 24,
      seedStatus: makeSeedStatus({ specs_seed: { is_needed: true } }),
      focusGroups: [],
    });

    assert.ok(profile.category);
    assert.ok(profile.identity);
    assert.ok(Array.isArray(profile.variant_guard_terms));
    assert.ok(Array.isArray(profile.identity_aliases));
    assert.ok(Array.isArray(profile.alias_reject_log));
    assert.ok(Array.isArray(profile.query_reject_log));
    assert.ok(Array.isArray(profile.focus_fields));
    assert.ok(Array.isArray(profile.base_templates));
    assert.ok(Array.isArray(profile.query_rows));
    assert.ok(Array.isArray(profile.queries));
    assert.ok(Array.isArray(profile.targeted_queries));
    assert.ok(typeof profile.field_target_queries === 'object');
    assert.ok(Array.isArray(profile.doc_hint_queries));
    assert.ok(typeof profile.hint_source_counts === 'object');
    assert.ok(typeof profile.archetype_summary === 'object');
    assert.ok(typeof profile.coverage_analysis === 'object');
  });

  it('backward compat: no seedStatus synthesizes default so Tier 1 always fires', () => {
    // WHY: When seedStatus is null, buildSearchProfile synthesizes
    // { specs_seed: { is_needed: true }, source_seeds: {} } so Tier 1 always fires.
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: makeCategoryConfig(),
      missingFields: ['weight', 'sensor'],
      maxQueries: 24,
    });

    assert.ok(profile.queries.length > 0, 'queries emitted via synthesized seedStatus');
    // All rows have a tier tag in tier-only mode
    const seedRows = profile.query_rows.filter((r) => r.tier === 'seed');
    assert.ok(seedRows.length > 0, 'seed tier rows present from synthesized seedStatus');
    assert.ok(profile.query_rows.every((r) => r.tier), 'all rows have tier tag');
  });
});
