// WHY: Contract tests for configurable Tier 3 key search enrichment order.
// The keySearchEnrichmentOrder setting controls which enrichment (aliases,
// domain_hints, content_types) is applied at each repeat level.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildTier3Queries, parseEnrichmentOrder } from '../queryBuilder.js';

function makeJob() {
  return {
    productId: 'test-prod',
    brand: 'Razer',
    base_model: 'Viper V3 Pro',
    model: 'Viper V3 Pro',
    category: 'mouse',
    identityLock: { brand: 'Razer', base_model: 'Viper V3 Pro', model: 'Viper V3 Pro', variant: '' },
  };
}

function makeFocusGroupsWithKeys(repeatCount = 0) {
  return [
    {
      key: 'connectivity',
      label: 'Connectivity',
      group_description_long: 'Wireless specs',
      group_search_worthy: false,
      productivity_score: 40,
      unresolved_field_keys: ['polling_rate'],
      normalized_key_queue: [
        {
          normalized_key: 'polling_rate',
          repeat_count: repeatCount,
          all_aliases: ['report rate', 'Hz'],
          domain_hints: ['razer.com', 'rtings.com'],
          domains_tried_for_key: [],
          content_types: ['spec_sheet', 'review'],
          content_types_tried_for_key: [],
        },
      ],
    },
  ];
}

describe('parseEnrichmentOrder', () => {
  it('parses a valid CSV into an array', () => {
    const result = parseEnrichmentOrder('aliases,domain_hints,content_types');
    assert.deepEqual(result, ['aliases', 'domain_hints', 'content_types']);
  });

  it('filters out unknown enrichment IDs', () => {
    const result = parseEnrichmentOrder('aliases,bogus,content_types');
    assert.deepEqual(result, ['aliases', 'content_types']);
  });

  it('falls back to default for empty/null', () => {
    const defaultOrder = ['aliases', 'domain_hints', 'content_types'];
    assert.deepEqual(parseEnrichmentOrder(''), defaultOrder);
    assert.deepEqual(parseEnrichmentOrder(null), defaultOrder);
  });

  it('deduplicates', () => {
    const result = parseEnrichmentOrder('aliases,aliases,domain_hints');
    assert.deepEqual(result, ['aliases', 'domain_hints']);
  });

  it('handles reversed order', () => {
    const result = parseEnrichmentOrder('content_types,domain_hints,aliases');
    assert.deepEqual(result, ['content_types', 'domain_hints', 'aliases']);
  });
});

describe('buildTier3Queries enrichment order', () => {
  it('default order: repeat=1 adds aliases', () => {
    const rows = buildTier3Queries(makeJob(), makeFocusGroupsWithKeys(1), {}, null);
    assert.ok(rows.length > 0);
    const query = rows[0].query;
    assert.ok(query.includes('report rate') || query.includes('Hz'),
      `repeat=1 should add aliases. Got: ${query}`);
    assert.ok(!query.includes('razer.com'), 'repeat=1 should NOT add domain hints yet');
  });

  it('default order: repeat=2 adds aliases + domain hints', () => {
    const rows = buildTier3Queries(makeJob(), makeFocusGroupsWithKeys(2), {}, null);
    const query = rows[0].query;
    assert.ok(query.includes('report rate') || query.includes('Hz'),
      `repeat=2 should include aliases. Got: ${query}`);
    assert.ok(query.includes('razer.com') || query.includes('rtings.com'),
      `repeat=2 should include domain hint. Got: ${query}`);
  });

  it('reordered: domain_hints first — repeat=1 adds domain hint, not alias', () => {
    const enrichmentOrder = ['domain_hints', 'aliases', 'content_types'];
    const rows = buildTier3Queries(makeJob(), makeFocusGroupsWithKeys(1), {}, null, { enrichmentOrder });
    const query = rows[0].query;
    assert.ok(query.includes('razer.com') || query.includes('rtings.com'),
      `reordered repeat=1 should add domain hint. Got: ${query}`);
    assert.ok(!query.includes('report rate') && !query.includes('Hz'),
      `reordered repeat=1 should NOT add aliases yet. Got: ${query}`);
  });

  it('reordered: content_types first — repeat=1 adds content type', () => {
    const enrichmentOrder = ['content_types', 'domain_hints', 'aliases'];
    const rows = buildTier3Queries(makeJob(), makeFocusGroupsWithKeys(1), {}, null, { enrichmentOrder });
    const query = rows[0].query;
    assert.ok(query.includes('spec_sheet') || query.includes('review'),
      `repeat=1 with content_types first should add content type. Got: ${query}`);
  });

  it('repeat=0 always produces bare query regardless of enrichment order', () => {
    const enrichmentOrder = ['domain_hints', 'content_types', 'aliases'];
    const rows = buildTier3Queries(makeJob(), makeFocusGroupsWithKeys(0), {}, null, { enrichmentOrder });
    const query = rows[0].query;
    assert.equal(query, 'Razer Viper V3 Pro gaming mouse polling rate',
      `repeat=0 should be bare query (with category context). Got: ${query}`);
  });

  it('backward compatible: no options produces default behavior', () => {
    const withOpts = buildTier3Queries(makeJob(), makeFocusGroupsWithKeys(2), {}, null, {});
    const without = buildTier3Queries(makeJob(), makeFocusGroupsWithKeys(2), {}, null);
    assert.deepEqual(
      withOpts.map(r => r.query),
      without.map(r => r.query),
    );
  });
});
