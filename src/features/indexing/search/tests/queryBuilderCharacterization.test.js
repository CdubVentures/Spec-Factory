import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSearchProfile } from '../../pipeline/searchProfile/queryBuilder.js';

function makeJob(overrides = {}) {
  return {
    category: 'mouse',
    productId: 'mouse-razer-viper-v3-pro',
    identityLock: {
      brand: 'Razer',
      model: 'Viper V3 Pro',
      variant: '',
      ...overrides.identityLock,
    },
    ...overrides,
  };
}

function makeCategoryConfig(overrides = {}) {
  return {
    category: 'mouse',
    fieldOrder: ['weight', 'sensor', 'dpi', 'polling_rate', 'click_latency', 'switch', 'connection', 'battery_hours', 'lift'],
    sourceHosts: [
      { host: 'razer.com', tierName: 'manufacturer', role: 'manufacturer' },
      { host: 'rtings.com', tierName: 'lab', role: 'lab' },
      { host: 'techpowerup.com', tierName: 'lab', role: 'lab' },
      { host: 'amazon.com', tierName: 'retailer', role: 'retailer' },
    ],
    searchTemplates: [],
    fieldRules: {
      fields: {
        weight: {
          required_level: 'critical',
          search_hints: {
            query_terms: ['weight grams'],
            domain_hints: ['razer.com'],
            preferred_content_types: ['spec'],
          },
        },
        sensor: {
          required_level: 'critical',
          search_hints: {
            query_terms: ['optical sensor model'],
            preferred_content_types: ['teardown_review', 'lab_review'],
          },
        },
        click_latency: {
          required_level: 'required',
          search_hints: {
            query_terms: ['click latency ms', 'end to end latency'],
            domain_hints: ['rtings.com'],
            preferred_content_types: ['lab_review', 'benchmark'],
          },
        },
        dpi: {
          required_level: 'expected',
          search_hints: {
            query_terms: ['max dpi', 'cpi'],
            preferred_content_types: ['spec'],
          },
        },
        polling_rate: {
          required_level: 'expected',
          search_hints: {
            query_terms: ['polling rate hz', 'report rate'],
            preferred_content_types: ['spec'],
          },
        },
      },
    },
    ...overrides,
  };
}

function makeFocusGroup(overrides = {}) {
  return {
    key: overrides.key || 'weight_group',
    label: overrides.label || 'Weight',
    group_search_worthy: overrides.group_search_worthy ?? false,
    normalized_key_queue: overrides.normalized_key_queue || ['weight'],
    unresolved_field_keys: overrides.unresolved_field_keys || overrides.normalized_key_queue || ['weight'],
    field_keys: overrides.field_keys || overrides.normalized_key_queue || ['weight'],
    satisfied_field_keys: overrides.satisfied_field_keys || [],
    productivity_score: overrides.productivity_score ?? 50,
    group_description_short: overrides.group_description_short || 'weight',
    group_description_long: overrides.group_description_long || 'weight grams',
    query_terms_union: overrides.query_terms_union || [],
    domain_hints_union: overrides.domain_hints_union || [],
    preferred_content_types_union: overrides.preferred_content_types_union || [],
    domains_tried_union: overrides.domains_tried_union || [],
    aliases_union: overrides.aliases_union || [],
    total_field_count: overrides.total_field_count ?? 1,
    resolved_field_count: overrides.resolved_field_count ?? 0,
    coverage_ratio: overrides.coverage_ratio ?? 0,
    phase: overrides.phase || 'now',
    skip_reason: overrides.skip_reason ?? null,
    desc: overrides.desc || 'weight',
  };
}

function buildProfile(overrides = {}) {
  const {
    job = makeJob(),
    categoryConfig = makeCategoryConfig(),
    missingFields = ['weight', 'sensor', 'click_latency', 'dpi', 'polling_rate'],
    maxQueries = 24,
    ...rest
  } = overrides;

  return buildSearchProfile({
    job,
    categoryConfig,
    missingFields,
    maxQueries,
    ...rest,
  });
}

function assertQueryRowContract(row) {
  assert.equal(typeof row.query, 'string');
  assert.ok(row.query.length > 0, 'row.query is non-empty');
  assert.equal(typeof row.hint_source, 'string');
  assert.ok(Array.isArray(row.target_fields));
  assert.ok('doc_hint' in row);
  assert.ok('domain_hint' in row);
  assert.ok('source_host' in row);
}

describe('buildSearchProfile contract', () => {
  it('returns the required public search profile surface', () => {
    const profile = buildProfile();

    assert.equal(profile.category, 'mouse');
    assert.deepEqual(profile.identity, {
      brand: 'Razer',
      base_model: '',
      model: 'Viper V3 Pro',
      variant: '',
      category: 'mouse',
    });
    assert.ok(Array.isArray(profile.variant_guard_terms));
    assert.ok(Array.isArray(profile.identity_aliases));
    assert.ok(Array.isArray(profile.alias_reject_log));
    assert.ok(Array.isArray(profile.query_reject_log));
    assert.ok(Array.isArray(profile.focus_fields));
    assert.ok(Array.isArray(profile.base_templates));
    assert.ok(Array.isArray(profile.query_rows));
    assert.ok(Array.isArray(profile.queries));
    assert.ok(Array.isArray(profile.targeted_queries));
    assert.equal(typeof profile.field_target_queries, 'object');
    assert.ok(Array.isArray(profile.doc_hint_queries));
    assert.equal(typeof profile.hint_source_counts, 'object');
    assert.equal(typeof profile.field_rule_gate_counts, 'object');
    assert.equal(typeof profile.field_rule_hint_counts_by_field, 'object');
  });

  it('returns query rows with the documented provenance fields', () => {
    const profile = buildProfile({
      missingFields: ['weight', 'sensor', 'click_latency'],
      focusGroups: [
        makeFocusGroup({
          normalized_key_queue: ['weight', 'sensor'],
          unresolved_field_keys: ['weight', 'sensor'],
          field_keys: ['weight', 'sensor'],
          total_field_count: 2,
          group_description_short: 'weight sensor',
          group_description_long: 'weight sensor',
          desc: 'weight sensor',
        }),
      ],
      seedStatus: {
        specs_seed: { is_needed: true },
        source_seeds: { 'razer.com': { is_needed: true } },
      },
    });

    assert.ok(profile.query_rows.length > 0, 'produces query_rows');
    for (const row of profile.query_rows) {
      assertQueryRowContract(row);
    }

    assert.ok(
      profile.query_rows.some((row) => row.target_fields.length > 0),
      'at least one row targets a field',
    );
    assert.ok(
      profile.query_rows.some((row) => row.doc_hint),
      'at least one row carries a doc hint',
    );
  });

  it('emits seed rows when specs seed work is needed', () => {
    const profile = buildProfile({
      maxQueries: 48,
      seedStatus: { specs_seed: { is_needed: true }, source_seeds: {} },
    });

    const seedRows = profile.query_rows.filter((row) => row.tier === 'seed');
    assert.ok(seedRows.length >= 1, 'at least one seed row is emitted');
    assert.ok(seedRows.some((row) => row.doc_hint === 'spec'));
  });

  it('provides a fallback base template when search templates are absent', () => {
    const profile = buildProfile({
      categoryConfig: makeCategoryConfig({ searchTemplates: [] }),
      missingFields: ['weight'],
    });

    assert.ok(profile.base_templates.length >= 1, 'base_templates is never empty');
    assert.ok(profile.base_templates.some((query) => query.includes('Razer')));
  });

  it('uses emitted seed queries as base templates when seed rows exist', () => {
    const profile = buildProfile({
      categoryConfig: makeCategoryConfig({
        searchTemplates: ['{brand} {model} specifications', '{brand} {model} review'],
      }),
      missingFields: ['weight'],
      seedStatus: { specs_seed: { is_needed: true }, source_seeds: {} },
    });

    const seedQueries = profile.query_rows
      .filter((row) => row.tier === 'seed')
      .map((row) => row.query);

    assert.ok(seedQueries.length >= 1, 'seed queries are emitted');
    assert.deepEqual(profile.base_templates, seedQueries);
  });

  it('includes identity tokens in variant guard terms', () => {
    const profile = buildProfile({
      missingFields: ['weight'],
      maxQueries: 12,
    });

    const joined = profile.variant_guard_terms.join(' ').toLowerCase();
    assert.ok(profile.variant_guard_terms.length > 0, 'guard terms are emitted');
    assert.ok(joined.includes('razer'));
    assert.ok(joined.includes('viper'));
    assert.ok(profile.variant_guard_terms.some((term) => /\d/.test(term)));
  });

  it('keeps hint source counts aligned with the emitted query rows', () => {
    const profile = buildProfile({
      missingFields: ['weight', 'sensor'],
    });

    const totalCounted = Object.values(profile.hint_source_counts).reduce((sum, count) => sum + count, 0);

    assert.ok(totalCounted > 0, 'hint_source_counts records at least one emitted row');
    assert.equal(totalCounted, profile.query_rows.length);
  });

  it('supports empty missing fields without leaking stale focus state', () => {
    const profile = buildProfile({
      missingFields: [],
    });

    assert.deepEqual(profile.focus_fields, []);
    assert.ok(Array.isArray(profile.queries));
    assert.ok(Array.isArray(profile.query_rows));
  });
});
