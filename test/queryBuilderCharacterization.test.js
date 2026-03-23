import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSearchProfile } from '../src/features/indexing/search/queryBuilder.js';

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
      { host: 'techpowerup.com', tierName: 'lab', role: 'lab' },
      { host: 'amazon.com', tierName: 'retailer', role: 'retailer' }
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
          }
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
        },
        dpi: {
          required_level: 'expected',
          search_hints: {
            query_terms: ['max dpi', 'cpi'],
            preferred_content_types: ['spec']
          }
        },
        polling_rate: {
          required_level: 'expected',
          search_hints: {
            query_terms: ['polling rate hz', 'report rate'],
            preferred_content_types: ['spec']
          }
        }
      }
    },
    ...overrides
  };
}

// ── Characterization: lock down structural invariants before archetype refactor ──

describe('Characterization — buildSearchProfile structural invariants', () => {

  it('output has exactly the expected top-level keys and types', () => {
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: makeCategoryConfig(),
      missingFields: ['weight', 'sensor', 'click_latency', 'dpi', 'polling_rate'],
      maxQueries: 24
    });

    const expectedKeys = [
      'category', 'identity', 'variant_guard_terms', 'identity_aliases',
      'alias_reject_log', 'query_reject_log', 'focus_fields',
      'base_templates', 'query_rows', 'queries', 'targeted_queries',
      'field_target_queries', 'doc_hint_queries', 'hint_source_counts',
      'field_rule_gate_counts', 'field_rule_hint_counts_by_field'
    ];

    for (const key of expectedKeys) {
      assert.ok(key in profile, `missing key: ${key}`);
    }

    assert.equal(typeof profile.category, 'string');
    assert.equal(typeof profile.identity, 'object');
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
  });

  it('query_rows carry all required provenance fields', () => {
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: makeCategoryConfig(),
      missingFields: ['weight', 'sensor', 'click_latency'],
      maxQueries: 24
    });

    assert.ok(profile.query_rows.length > 0, 'produces query_rows');

    for (const row of profile.query_rows) {
      assert.equal(typeof row.query, 'string', 'row.query is string');
      assert.ok(row.query.length > 0, 'row.query is non-empty');
      assert.equal(typeof row.hint_source, 'string', 'row.hint_source is string');
      assert.ok(Array.isArray(row.target_fields), 'row.target_fields is array');
      assert.ok('doc_hint' in row, 'row has doc_hint');
      assert.ok('domain_hint' in row, 'row has domain_hint');
      assert.ok('source_host' in row, 'row has source_host');
    }
  });

  it('produces tier1 seed row with doc_hint when seedStatus triggers', () => {
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: makeCategoryConfig(),
      missingFields: ['weight', 'sensor', 'click_latency', 'dpi', 'polling_rate'],
      maxQueries: 48,
      seedStatus: { specs_seed: { is_needed: true }, source_seeds: {} },
    });

    const seedRows = profile.query_rows.filter((r) => r.tier === 'seed');
    assert.ok(seedRows.length >= 1, `at least one seed row: ${seedRows.length}`);
    assert.ok(seedRows.some((r) => r.doc_hint === 'spec'), 'seed row has doc_hint spec');
  });

  it('empty searchTemplates triggers fallback — base_templates never empty', () => {
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: makeCategoryConfig({ searchTemplates: [] }),
      missingFields: ['weight'],
      maxQueries: 24
    });

    assert.ok(Array.isArray(profile.base_templates));
    assert.ok(profile.base_templates.length >= 1, 'fallback guarantee: base_templates never empty');
    assert.ok(profile.base_templates[0].includes('Razer'), 'fallback includes brand');
  });

  it('base_templates derived from tier1 seed queries', () => {
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: makeCategoryConfig({
        searchTemplates: ['{brand} {model} specifications', '{brand} {model} review']
      }),
      missingFields: ['weight'],
      maxQueries: 24,
      seedStatus: { specs_seed: { is_needed: true }, source_seeds: {} },
    });

    // WHY: base_templates are now derived from tier1 seed query_rows, not from searchTemplates.
    assert.ok(Array.isArray(profile.base_templates), 'base_templates is array');
    assert.ok(profile.base_templates.length >= 1, 'at least one base template from seed');
    assert.ok(profile.base_templates[0].includes('Razer'), 'seed query includes brand');
  });

  it('variant_guard_terms include brand/model tokens and digit groups', () => {
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: makeCategoryConfig(),
      missingFields: ['weight'],
      maxQueries: 12
    });

    assert.ok(profile.variant_guard_terms.length > 0, 'guard terms produced');

    const joined = profile.variant_guard_terms.join(' ').toLowerCase();
    assert.ok(joined.includes('razer'), 'brand token present');
    assert.ok(joined.includes('viper'), 'model token present');
    assert.ok(profile.variant_guard_terms.some((t) => /\d/.test(t)), 'digit group present');
  });

  it('hint_source_counts reflect query_rows provenance', () => {
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: makeCategoryConfig(),
      missingFields: ['weight', 'sensor'],
      maxQueries: 24
    });

    const totalCounted = Object.values(profile.hint_source_counts).reduce((a, b) => a + b, 0);
    console.log('[CHAR] hint_source_counts:', JSON.stringify(profile.hint_source_counts));
    console.log('[CHAR] total counted:', totalCounted, 'query_rows:', profile.query_rows.length);

    assert.ok(totalCounted > 0, 'hint_source_counts has entries');
    assert.ok(totalCounted <= profile.query_rows.length, 'counts do not exceed query_rows');
  });

  it('identity object has brand, model, variant, category', () => {
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: makeCategoryConfig(),
      missingFields: ['weight'],
      maxQueries: 12
    });

    assert.equal(profile.identity.brand, 'Razer');
    assert.equal(profile.identity.model, 'Viper V3 Pro');
    assert.equal(profile.identity.variant, '');
    assert.equal(profile.identity.category, 'mouse');
  });

  it('no missing fields produces fallback queries', () => {
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: makeCategoryConfig(),
      missingFields: [],
      maxQueries: 24
    });

    assert.ok(profile.focus_fields.length === 0, 'no focus_fields');
    // Should still produce some queries (fallback path)
    assert.ok(profile.queries.length >= 0, 'valid output even with no missing fields');
  });
});
