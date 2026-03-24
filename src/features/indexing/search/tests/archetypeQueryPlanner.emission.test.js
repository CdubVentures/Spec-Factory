import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifySourceArchetypes,
  computeArchetypeCoverage,
  allocateArchetypeBudget,
  emitArchetypeQueries,
  classifyFieldSearchWorthiness,
  identifyUncoveredFields,
  emitHardFieldQueries,
  intentFingerprint,
  buildArchetypeSummary,
  buildCoverageAnalysis,
  isZeroYieldHost,
  makeSourceRegistry,
  makeSourceHosts,
  makeManufacturerHosts,
  makeIdentity,
  makeFieldRules,
} from './helpers/archetypeQueryPlannerHarness.js';

describe('emitArchetypeQueries', () => {
  it('lab emits diverse intents with per-host soft domain bias', () => {
    const slot = {
      archetype: 'lab_review',
      hosts: ['rtings.com', 'techpowerup.com'],
      slots: 4,
      coveredFields: ['click_latency', 'sensor', 'weight']
    };
    const identity = makeIdentity();
    const product = 'Razer Viper V3 Pro';
    const focusFields = ['click_latency', 'sensor', 'weight', 'mcu'];

    const rows = emitArchetypeQueries(slot, identity, product, focusFields);

    assert.ok(rows.length > 0, 'emits rows');
    // Soft domain bias — hosts appear in query text
    assert.ok(rows.some((r) => r.query.includes('rtings.com')), 'rtings.com soft bias in query');
    assert.ok(rows.some((r) => r.query.includes('techpowerup.com')), 'techpowerup.com soft bias in query');
    assert.ok(rows.every((r) => !r.query.includes('site:')), 'no site: operator');
    // domainHint metadata preserved across hosts
    const domainHints = new Set(rows.map((r) => r.domain_hint).filter(Boolean));
    assert.ok(domainHints.size >= 2, `multiple domain_hints: ${[...domainHints]}`);
    // Diverse intents — unique query strings
    const uniqueQueries = new Set(rows.map((r) => r.query));
    assert.ok(uniqueQueries.size >= 2, 'multiple distinct intent queries');
  });

  it('manufacturer emits diverse intent queries with soft domain bias', () => {
    const slot = {
      archetype: 'manufacturer',
      hosts: ['razer.com'],
      slots: 3,
      coveredFields: []
    };
    const identity = makeIdentity();
    const product = 'Razer Viper V3 Pro';

    const rows = emitArchetypeQueries(slot, identity, product, ['weight', 'sensor']);

    assert.ok(rows.length > 0, 'emits rows');
    // Soft domain bias — host appears as plain text, not site: operator
    const hostRows = rows.filter((r) => r.query.includes('razer.com'));
    assert.ok(hostRows.length > 0, 'has soft domain-biased query');
    assert.ok(hostRows.every((r) => !r.query.includes('site:')), 'no site: operator');
    // domainHint metadata preserved
    assert.ok(rows.every((r) => r.domain_hint === 'razer.com'), 'domainHint still set');
    // Diverse intents — unique query strings
    const uniqueQueries = new Set(rows.map((r) => r.query));
    assert.equal(uniqueQueries.size, rows.length, 'all queries are unique intents');
  });

  it('target_fields from coverage intersection (advisory)', () => {
    const slot = {
      archetype: 'lab_review',
      hosts: ['rtings.com'],
      slots: 2,
      coveredFields: ['click_latency', 'weight']
    };
    const rows = emitArchetypeQueries(slot, makeIdentity(), 'Razer Viper V3 Pro', ['click_latency', 'weight', 'mcu']);

    const hasTargetFields = rows.some((r) => r.target_fields && r.target_fields.length > 0);
    assert.ok(hasTargetFields, 'rows carry target_fields');
  });

  it('each intent variant is a unique query string (no duplicates)', () => {
    const slot = {
      archetype: 'lab_review',
      hosts: ['rtings.com', 'techpowerup.com'],
      slots: 6,
      coveredFields: ['click_latency', 'sensor']
    };
    const rows = emitArchetypeQueries(slot, makeIdentity(), 'Razer Viper V3 Pro', ['click_latency', 'sensor']);

    // Every emitted query string must be unique
    const queries = rows.map((r) => r.query);
    const uniqueQueries = new Set(queries);
    assert.equal(queries.length, uniqueQueries.size,
      `no duplicate query strings: ${queries}`);
    // Each carries a domainHint
    for (const row of rows) {
      assert.ok(row.domain_hint, `row "${row.query}" has domain_hint`);
    }
  });

  it('every row has _meta with archetype, gap_reason, intent_fingerprint, query_family', () => {
    const slot = {
      archetype: 'lab_review',
      hosts: ['rtings.com'],
      slots: 3,
      coveredFields: ['click_latency']
    };
    const rows = emitArchetypeQueries(slot, makeIdentity(), 'Razer Viper V3 Pro', ['click_latency']);

    for (const row of rows) {
      assert.ok(row._meta, 'row has _meta');
      assert.equal(typeof row._meta.archetype, 'string', '_meta.archetype is string');
      assert.equal(typeof row._meta.gap_reason, 'string', '_meta.gap_reason is string');
      assert.equal(typeof row._meta.intent_fingerprint, 'string', '_meta.intent_fingerprint is string');
      assert.equal(typeof row._meta.query_family, 'string', '_meta.query_family is string');
      assert.equal(row._meta.archetype, 'lab_review', '_meta.archetype matches slot');
    }
  });
});

// ── Intent-based queries: soft domain bias + diverse intents ──

describe('emitArchetypeQueries — soft domain bias with diverse intents', () => {
  it('manufacturer queries use soft domain bias (no site: operator)', () => {
    const slot = {
      archetype: 'manufacturer',
      hosts: ['razer.com'],
      slots: 3,
      coveredFields: []
    };
    const rows = emitArchetypeQueries(slot, makeIdentity(), 'Razer Viper V3 Pro', ['weight']);

    for (const row of rows) {
      assert.ok(!row.query.includes('site:'), `no site: in "${row.query}"`);
    }
    assert.ok(rows.some((r) => r.query.includes('razer.com')), 'soft domain bias present');
  });

  it('lab_review queries use soft domain bias per host', () => {
    const slot = {
      archetype: 'lab_review',
      hosts: ['rtings.com', 'techpowerup.com'],
      slots: 4,
      coveredFields: ['click_latency']
    };
    const rows = emitArchetypeQueries(slot, makeIdentity(), 'Razer Viper V3 Pro', ['click_latency']);

    assert.ok(rows.some((r) => r.query.includes('rtings.com')), 'rtings.com soft bias');
    assert.ok(rows.some((r) => r.query.includes('techpowerup.com')), 'techpowerup.com soft bias');
    assert.ok(rows.every((r) => !r.query.includes('site:')), 'no site: operator');
  });

  it('spec_database queries use soft domain bias', () => {
    const slot = {
      archetype: 'spec_database',
      hosts: ['eloshapes.com'],
      slots: 3,
      coveredFields: ['weight']
    };
    const rows = emitArchetypeQueries(slot, makeIdentity(), 'Razer Viper V3 Pro', ['weight']);

    assert.ok(rows.some((r) => r.query.includes('eloshapes.com')), 'soft domain bias present');
    assert.ok(rows.every((r) => !r.query.includes('site:')), 'no site: operator');
  });

  it('no host → no domain token in query (graceful fallback)', () => {
    const slot = {
      archetype: 'manufacturer',
      hosts: [],
      slots: 3,
      coveredFields: []
    };
    const rows = emitArchetypeQueries(slot, makeIdentity(), 'Razer Viper V3 Pro', ['weight']);

    assert.ok(rows.length > 0, 'still emits rows');
    for (const row of rows) {
      assert.ok(!row.query.includes('.com'), `no domain in "${row.query}" when hosts empty`);
    }
  });

  it('manufacturer emits diverse intents (specifications, manual, support)', () => {
    const slot = {
      archetype: 'manufacturer',
      hosts: ['razer.com'],
      slots: 3,
      coveredFields: []
    };
    const rows = emitArchetypeQueries(slot, makeIdentity(), 'Razer Viper V3 Pro', ['weight']);

    const queries = rows.map((r) => r.query.toLowerCase());
    assert.ok(queries.some((q) => q.includes('specifications')), 'has specifications intent');
    assert.ok(queries.some((q) => q.includes('manual') || q.includes('pdf')), 'has manual intent');
    assert.ok(queries.some((q) => q.includes('support')), 'has support intent');
  });

  it('lab_review emits diverse intents (review, measurements, teardown)', () => {
    const slot = {
      archetype: 'lab_review',
      hosts: ['rtings.com', 'techpowerup.com', 'overclock.net'],
      slots: 4,
      coveredFields: ['click_latency']
    };
    const rows = emitArchetypeQueries(slot, makeIdentity(), 'Razer Viper V3 Pro', ['click_latency']);

    const queries = rows.map((r) => r.query.toLowerCase());
    assert.ok(queries.some((q) => q.includes('review') && !q.includes('measurements') && !q.includes('teardown')), 'has plain review intent');
    assert.ok(queries.some((q) => q.includes('measurements')), 'has measurements intent');
    assert.ok(queries.some((q) => q.includes('teardown')), 'has teardown intent');
  });

  it('spec_database emits diverse intents (specifications, dimensions)', () => {
    const slot = {
      archetype: 'spec_database',
      hosts: ['eloshapes.com', 'rtings.com'],
      slots: 3,
      coveredFields: ['weight']
    };
    const rows = emitArchetypeQueries(slot, makeIdentity(), 'Razer Viper V3 Pro', ['weight']);

    const queries = rows.map((r) => r.query.toLowerCase());
    assert.ok(queries.some((q) => q.includes('specifications')), 'has specifications intent');
    assert.ok(queries.some((q) => q.includes('dimensions')), 'has dimensions intent');
  });

  it('each intent variant carries a deliberate domainHint from host list', () => {
    const slot = {
      archetype: 'lab_review',
      hosts: ['rtings.com', 'techpowerup.com', 'overclock.net'],
      slots: 4,
      coveredFields: ['click_latency']
    };
    const rows = emitArchetypeQueries(slot, makeIdentity(), 'Razer Viper V3 Pro', ['click_latency']);

    // First intent → first host, second → second host, etc.
    if (rows.length >= 2) {
      assert.equal(rows[0].domain_hint, 'rtings.com', 'first intent gets first host');
      assert.equal(rows[1].domain_hint, 'techpowerup.com', 'second intent gets second host');
    }
    if (rows.length >= 3) {
      assert.equal(rows[2].domain_hint, 'overclock.net', 'third intent gets third host');
    }
  });
});

// ── classifyFieldSearchWorthiness ──

describe('intentFingerprint', () => {
  it('same archetype+host+family+cluster → same fingerprint', () => {
    const row1 = { _meta: { archetype: 'lab_review', query_family: 'review' }, domain_hint: 'rtings.com', target_fields: ['click_latency', 'sensor'] };
    const row2 = { _meta: { archetype: 'lab_review', query_family: 'review' }, domain_hint: 'rtings.com', target_fields: ['sensor', 'click_latency'] };

    assert.equal(intentFingerprint(row1), intentFingerprint(row2));
  });

  it('different host → different fingerprint', () => {
    const row1 = { _meta: { archetype: 'lab_review', query_family: 'review' }, domain_hint: 'rtings.com', target_fields: ['click_latency'] };
    const row2 = { _meta: { archetype: 'lab_review', query_family: 'review' }, domain_hint: 'techpowerup.com', target_fields: ['click_latency'] };

    assert.notEqual(intentFingerprint(row1), intentFingerprint(row2));
  });

  it('hard-field with empty host uses field_cluster for differentiation', () => {
    const row1 = { _meta: { archetype: 'hard_field', query_family: 'spec' }, domain_hint: '', target_fields: ['mcu'] };
    const row2 = { _meta: { archetype: 'hard_field', query_family: 'spec' }, domain_hint: '', target_fields: ['encoder'] };

    assert.notEqual(intentFingerprint(row1), intentFingerprint(row2));
  });

  it('word order does not matter in field cluster', () => {
    const row1 = { _meta: { archetype: 'lab_review', query_family: 'review' }, domain_hint: 'rtings.com', target_fields: ['a', 'b', 'c'] };
    const row2 = { _meta: { archetype: 'lab_review', query_family: 'review' }, domain_hint: 'rtings.com', target_fields: ['c', 'a', 'b'] };

    assert.equal(intentFingerprint(row1), intentFingerprint(row2));
  });
});

// ── emitHardFieldQueries ──

describe('emitHardFieldQueries', () => {
  it('emits queries for search-worthy uncovered fields', () => {
    const uncoveredFields = ['mcu', 'encoder'];
    const identity = makeIdentity();
    const product = 'Razer Viper V3 Pro';
    const categoryConfig = { fieldRules: { fields: makeFieldRules() } };

    const rows = emitHardFieldQueries(uncoveredFields, identity, product, categoryConfig);

    assert.ok(rows.length > 0, 'emits rows');
    for (const row of rows) {
      assert.ok(row.query, 'row has query');
      assert.ok(row._meta, 'row has _meta');
      assert.equal(row._meta.archetype, 'hard_field');
    }
  });

  it('uses field-specific query_terms from field rules', () => {
    const rows = emitHardFieldQueries(
      ['mcu'],
      makeIdentity(),
      'Razer Viper V3 Pro',
      { fieldRules: { fields: makeFieldRules() } }
    );

    const queries = rows.map((r) => r.query.toLowerCase());
    const hasMcuTerm = queries.some(
      (q) => q.includes('microcontroller') || q.includes('mcu')
    );
    assert.ok(hasMcuTerm, 'uses field-specific query terms');
  });
});

// ── Retailer gate ──

describe('emitArchetypeQueries — identity guard compatibility', () => {
  it('all emitted queries contain brand + model tokens', () => {
    const slot = {
      archetype: 'lab_review',
      hosts: ['rtings.com'],
      slots: 4,
      coveredFields: ['click_latency', 'sensor']
    };
    const identity = makeIdentity();
    const product = 'Razer Viper V3 Pro';

    const rows = emitArchetypeQueries(slot, identity, product, ['click_latency', 'sensor']);

    for (const row of rows) {
      const lower = row.query.toLowerCase();
      assert.ok(
        lower.includes('razer') || lower.includes('viper'),
        `query "${row.query}" contains brand or model token`
      );
    }
  });
});

// ── Cross-category ──

describe('isZeroYieldHost', () => {
  it('zero-yield host (>= 3 attempts, 0 fields) → true', () => {
    assert.equal(isZeroYieldHost('deadsite.com', {
      'deadsite.com': { attempts: 3, fields: {} }
    }), true);
  });

  it('high-attempt zero-yield → true', () => {
    assert.equal(isZeroYieldHost('deadsite.com', {
      'deadsite.com': { attempts: 10, fields: {} }
    }), true);
  });

  it('host with field yield → false', () => {
    assert.equal(isZeroYieldHost('rtings.com', {
      'rtings.com': { attempts: 5, fields: { click_latency: { seen: 3, accepted: 2, yield: 3 } } }
    }), false);
  });

  it('new host (not in map) → false', () => {
    assert.equal(isZeroYieldHost('newsite.com', {}), false);
  });

  it('insufficient attempts (< 3) → false (not proven dead yet)', () => {
    assert.equal(isZeroYieldHost('flaky.com', {
      'flaky.com': { attempts: 2, fields: {} }
    }), false);
  });

  it('single attempt → false (transient failure)', () => {
    assert.equal(isZeroYieldHost('flaky.com', {
      'flaky.com': { attempts: 1, fields: {} }
    }), false);
  });

  it('null fieldYieldByDomain → false', () => {
    assert.equal(isZeroYieldHost('any.com', null), false);
  });

  it('empty host → false', () => {
    assert.equal(isZeroYieldHost('', { 'x.com': { attempts: 5, fields: {} } }), false);
  });
});

// ── History-aware domain bias ──

describe('emitArchetypeQueries — history-aware domain bias', () => {
  it('zero-yield host: query has NO host, domain_hint empty', () => {
    const slot = {
      archetype: 'lab_review',
      hosts: ['deadsite.com'],
      slots: 3,
      coveredFields: ['click_latency']
    };
    const fieldYieldByDomain = {
      'deadsite.com': { attempts: 5, fields: {} }
    };
    const rows = emitArchetypeQueries(slot, makeIdentity(), 'Razer Viper V3 Pro', ['click_latency'], { fieldYieldByDomain });

    assert.ok(rows.length > 0, 'still emits queries');
    for (const row of rows) {
      assert.ok(!row.query.includes('deadsite.com'), `query "${row.query}" must not contain dead host`);
      assert.equal(row.domain_hint, '', 'domain_hint cleared for zero-yield host');
    }
  });

  it('yielding host: query includes host, domain_hint set', () => {
    const slot = {
      archetype: 'lab_review',
      hosts: ['rtings.com'],
      slots: 3,
      coveredFields: ['click_latency']
    };
    const fieldYieldByDomain = {
      'rtings.com': { attempts: 5, fields: { click_latency: { seen: 3, accepted: 2, yield: 3 } } }
    };
    const rows = emitArchetypeQueries(slot, makeIdentity(), 'Razer Viper V3 Pro', ['click_latency'], { fieldYieldByDomain });

    assert.ok(rows.some((r) => r.query.includes('rtings.com')), 'yielding host in query text');
    assert.ok(rows.some((r) => r.domain_hint === 'rtings.com'), 'domain_hint preserved');
  });

  it('new host (not in map): query includes host (given a chance)', () => {
    const slot = {
      archetype: 'lab_review',
      hosts: ['newsite.com'],
      slots: 3,
      coveredFields: ['click_latency']
    };
    const rows = emitArchetypeQueries(slot, makeIdentity(), 'Razer Viper V3 Pro', ['click_latency'], { fieldYieldByDomain: {} });

    assert.ok(rows.some((r) => r.query.includes('newsite.com')), 'new host gets bias');
  });

  it('null fieldYieldByDomain (backward compat): all hosts biased', () => {
    const slot = {
      archetype: 'lab_review',
      hosts: ['rtings.com'],
      slots: 3,
      coveredFields: ['click_latency']
    };
    const rows = emitArchetypeQueries(slot, makeIdentity(), 'Razer Viper V3 Pro', ['click_latency']);

    assert.ok(rows.some((r) => r.query.includes('rtings.com')), 'host biased when no yield data');
  });

  it('mixed: yielding host keeps bias, zero-yield host loses bias', () => {
    const slot = {
      archetype: 'lab_review',
      hosts: ['rtings.com', 'deadsite.com'],
      slots: 3,
      coveredFields: ['click_latency']
    };
    const fieldYieldByDomain = {
      'rtings.com': { attempts: 5, fields: { click_latency: { seen: 3, accepted: 2, yield: 3 } } },
      'deadsite.com': { attempts: 4, fields: {} }
    };
    const rows = emitArchetypeQueries(slot, makeIdentity(), 'Razer Viper V3 Pro', ['click_latency'], { fieldYieldByDomain });

    assert.ok(rows.some((r) => r.query.includes('rtings.com')), 'yielding host keeps bias');
    assert.ok(rows.every((r) => !r.query.includes('deadsite.com')), 'dead host loses bias');
  });
});
