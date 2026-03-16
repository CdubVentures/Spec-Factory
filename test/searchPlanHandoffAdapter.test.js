// WHY: Test the pure adapter that converts Schema 4 search_plan_handoff
// into the shape executeSearchQueries() expects.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { convertHandoffToExecutionPlan } from '../src/features/indexing/discovery/searchPlanHandoffAdapter.js';

// --- fixtures ---

const HANDOFF_3_QUERIES = {
  queries: [
    {
      q: 'Pulsar X2V2 Mini sensor specs',
      query_hash: 'abc123',
      family: 'manufacturer_html',
      group_key: 'sensor_performance',
      target_fields: ['sensor_model', 'max_dpi', 'tracking_speed'],
      preferred_domains: ['pulsar.gg'],
      exact_match_required: false,
    },
    {
      q: 'Pulsar X2V2 Mini weight dimensions',
      query_hash: 'def456',
      family: 'manual_pdf',
      group_key: 'physical',
      target_fields: ['weight', 'length', 'width', 'height'],
      preferred_domains: [],
      exact_match_required: false,
    },
    {
      q: 'Pulsar X2V2 Mini switch type',
      query_hash: 'ghi789',
      family: 'review_lookup',
      group_key: 'buttons_switches',
      target_fields: ['switch_type', 'switch_lifecycle'],
      preferred_domains: ['rtings.com'],
      exact_match_required: true,
    },
  ],
  query_hashes: ['abc123', 'def456', 'ghi789'],
  total: 3,
};

describe('convertHandoffToExecutionPlan', () => {
  // --- happy path ---

  it('converts 3-query handoff into execution plan', () => {
    const result = convertHandoffToExecutionPlan(HANDOFF_3_QUERIES);

    assert.equal(result.source, 'schema4');
    assert.equal(result.queries.length, 3);
    assert.deepStrictEqual(result.queries, [
      'Pulsar X2V2 Mini sensor specs',
      'Pulsar X2V2 Mini weight dimensions',
      'Pulsar X2V2 Mini switch type',
    ]);
    assert.equal(result.queryRows.length, 3);
    assert.ok(result.selectedQueryRowMap instanceof Map);
    assert.equal(result.selectedQueryRowMap.size, 3);
  });

  it('builds RowObject with correct shape for each query', () => {
    const result = convertHandoffToExecutionPlan(HANDOFF_3_QUERIES);
    const row = result.queryRows[0];

    assert.equal(row.query, 'Pulsar X2V2 Mini sensor specs');
    assert.equal(row.source, 'schema4_planner');
    assert.deepStrictEqual(row.target_fields, ['sensor_model', 'max_dpi', 'tracking_speed']);
    assert.equal(row.domain_hint, 'pulsar.gg');
    assert.equal(row.doc_hint, '');
    assert.equal(row.hint_source, 'schema4_search_plan');
    assert.equal(row.family, 'manufacturer_html');
    assert.equal(row.group_key, 'sensor_performance');
    assert.equal(row.query_hash, 'abc123');
  });

  it('uses first preferred_domain as domain_hint', () => {
    const result = convertHandoffToExecutionPlan(HANDOFF_3_QUERIES);
    assert.equal(result.queryRows[0].domain_hint, 'pulsar.gg');
    assert.equal(result.queryRows[2].domain_hint, 'rtings.com');
  });

  it('uses empty string domain_hint when preferred_domains empty', () => {
    const result = convertHandoffToExecutionPlan(HANDOFF_3_QUERIES);
    assert.equal(result.queryRows[1].domain_hint, '');
  });

  it('selectedQueryRowMap keyed by lowercase query', () => {
    const handoff = {
      queries: [{ q: 'UPPER Case Query', query_hash: 'x', family: 'f', group_key: 'g', target_fields: [], preferred_domains: [], exact_match_required: false }],
      query_hashes: ['x'],
      total: 1,
    };
    const result = convertHandoffToExecutionPlan(handoff);
    assert.ok(result.selectedQueryRowMap.has('upper case query'));
    assert.ok(!result.selectedQueryRowMap.has('UPPER Case Query'));
  });

  // --- edge cases ---

  it('returns empty plan for null handoff', () => {
    const result = convertHandoffToExecutionPlan(null);
    assert.equal(result.source, 'schema4');
    assert.equal(result.queries.length, 0);
    assert.equal(result.queryRows.length, 0);
    assert.equal(result.selectedQueryRowMap.size, 0);
  });

  it('returns empty plan for undefined handoff', () => {
    const result = convertHandoffToExecutionPlan(undefined);
    assert.equal(result.queries.length, 0);
    assert.equal(result.selectedQueryRowMap.size, 0);
  });

  it('returns empty plan for handoff with empty queries array', () => {
    const result = convertHandoffToExecutionPlan({ queries: [], query_hashes: [], total: 0 });
    assert.equal(result.queries.length, 0);
    assert.equal(result.queryRows.length, 0);
  });

  it('returns empty plan for handoff with no queries property', () => {
    const result = convertHandoffToExecutionPlan({ query_hashes: [], total: 0 });
    assert.equal(result.queries.length, 0);
  });

  it('deduplicates queries with same q value', () => {
    const handoff = {
      queries: [
        { q: 'same query', query_hash: 'h1', family: 'f1', group_key: 'g1', target_fields: ['a'], preferred_domains: [], exact_match_required: false },
        { q: 'same query', query_hash: 'h2', family: 'f2', group_key: 'g2', target_fields: ['b'], preferred_domains: [], exact_match_required: false },
        { q: 'different query', query_hash: 'h3', family: 'f3', group_key: 'g3', target_fields: ['c'], preferred_domains: [], exact_match_required: false },
      ],
      query_hashes: ['h1', 'h2', 'h3'],
      total: 3,
    };
    const result = convertHandoffToExecutionPlan(handoff);
    assert.equal(result.queries.length, 2, 'duplicate q removed');
    assert.equal(result.queryRows.length, 2);
    assert.equal(result.selectedQueryRowMap.size, 2);
  });

  it('handles missing fields on query objects gracefully', () => {
    const handoff = {
      queries: [
        { q: 'minimal query' },
      ],
      query_hashes: [],
      total: 1,
    };
    const result = convertHandoffToExecutionPlan(handoff);
    assert.equal(result.queries.length, 1);
    const row = result.queryRows[0];
    assert.equal(row.query, 'minimal query');
    assert.equal(row.source, 'schema4_planner');
    assert.deepStrictEqual(row.target_fields, []);
    assert.equal(row.domain_hint, '');
    assert.equal(row.doc_hint, '');
    assert.equal(row.hint_source, 'schema4_search_plan');
    assert.equal(row.family, '');
    assert.equal(row.group_key, '');
    assert.equal(row.query_hash, '');
  });

  it('skips query objects with falsy q value', () => {
    const handoff = {
      queries: [
        { q: '', query_hash: 'h1', family: 'f', group_key: 'g', target_fields: [], preferred_domains: [], exact_match_required: false },
        { q: null, query_hash: 'h2', family: 'f', group_key: 'g', target_fields: [], preferred_domains: [], exact_match_required: false },
        { q: 'valid query', query_hash: 'h3', family: 'f', group_key: 'g', target_fields: [], preferred_domains: [], exact_match_required: false },
      ],
      query_hashes: ['h1', 'h2', 'h3'],
      total: 3,
    };
    const result = convertHandoffToExecutionPlan(handoff);
    assert.equal(result.queries.length, 1);
    assert.equal(result.queries[0], 'valid query');
  });
});
