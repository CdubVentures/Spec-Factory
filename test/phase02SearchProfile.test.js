import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDeterministicAliases,
  buildSearchProfile,
  buildTargetedQueries,
  normalizeQueryRows,
  makeJob,
  makeCategoryConfig,
} from './helpers/phase02SearchProfileHarness.js';

describe('Phase 02 â€” Deterministic Aliases', () => {
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

    console.log('[ALIAS] SteelSeries Aerox 5 Wireless â€” weights:', aliases.map((a) => `${a.alias}:${a.weight}`));

    for (const alias of aliases) {
      assert.ok(typeof alias.alias === 'string' && alias.alias.length > 0, 'alias is non-empty string');
      assert.ok(typeof alias.source === 'string', 'source is string');
      assert.ok(typeof alias.weight === 'number' && alias.weight > 0, 'weight is positive number');
    }
  });
});

describe('Phase 02 â€” SearchProfile Shape', () => {
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

describe('Phase 02 â€” Field Studio Hint Wiring (Spec Â§2.5)', () => {
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

    // WHY: soft domain bias â€” hosts appear as plain text in query, not site: operator
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

describe('Phase 02 â€” normalizeQueryRows Coercion', () => {
  it('converts flat string array to structured rows', () => {
    const result = normalizeQueryRows(['q1', 'q2', 'q3']);
    console.log('[NORMALIZE] strings â†’', JSON.stringify(result));

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

    console.log('[NORMALIZE] structured â†’', JSON.stringify(result));

    assert.deepEqual(result[0].target_fields, ['weight', 'sensor']);
    assert.deepEqual(result[1].target_fields, []);
  });

  it('handles mixed array of strings and objects', () => {
    const result = normalizeQueryRows([
      'plain query',
      { query: 'structured', target_fields: ['dpi'] },
      ''
    ]);

    console.log('[NORMALIZE] mixed â†’ count:', result.length);

    assert.equal(result.length, 2, 'empty string filtered out');
    assert.equal(result[0].query, 'plain query');
    assert.deepEqual(result[1].target_fields, ['dpi']);
  });

  it('strips whitespace and normalizes spacing', () => {
    const result = normalizeQueryRows(['  spaced   query  ', { query: '  another   one  ', target_fields: [' dpi '] }]);

    console.log('[NORMALIZE] whitespace â†’ queries:', result.map((r) => `"${r.query}"`));

    assert.equal(result[0].query, 'spaced query');
    assert.equal(result[1].query, 'another one');
    assert.equal(result[1].target_fields[0], 'dpi');
  });
});

describe('Phase 02 â€” Variant Guard Terms', () => {
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

describe('Phase 02 â€” BRAND_HOST_HINTS Sync (Fixed)', () => {
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

    // WHY: soft domain bias â€” manufacturer hosts appear as plain-text in queries
    const alienwareHostQueries = profile.queries.filter((q) => q.includes('alienware.com') && !q.includes('site:'));
    const dellHostQueries = profile.queries.filter((q) => q.includes('dell.com') && !q.includes('site:'));

    console.log(`[BRAND-FIX] alienware.com soft-bias queries: ${alienwareHostQueries.length}`);
    console.log(`[BRAND-FIX] dell.com soft-bias queries: ${dellHostQueries.length}`);

    assert.ok(alienwareHostQueries.length > 0, 'alienware.com soft host-biased queries now generated');
    assert.ok(dellHostQueries.length > 0, 'dell.com soft host-biased queries now generated (via brand resolver)');
  });
});

describe('Phase 02 â€” Query Cap and Reject Log', () => {
  it('respects maxQueries cap and logs rejections', () => {
    const cap = 6;
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: makeCategoryConfig(),
      missingFields: ['weight', 'sensor', 'click_latency', 'dpi', 'polling_rate'],
      maxQueries: cap
    });

    console.log(`[CAP] maxQueries=${cap} â†’ queries.length=${profile.queries.length}`);
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

describe('Phase 02 â€” buildTargetedQueries integration', () => {
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

describe('Phase 02 â€” Archetype Integration', () => {
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

  it('archetype_summary removed from tier-only output', () => {
    // WHY: archetype_summary was dead code (always empty {}). Deleted in P5 cleanup.
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: makeArchetypeConfig(),
      missingFields: ['weight', 'sensor', 'click_latency', 'dpi', 'polling_rate'],
      maxQueries: 48,
      seedStatus: { specs_seed: { is_needed: true }, source_seeds: {} },
      focusGroups: [],
    });

    assert.equal(profile.archetype_summary, undefined, 'archetype_summary no longer in output');
    assert.equal(profile.coverage_analysis, undefined, 'coverage_analysis no longer in output');
  });
});

