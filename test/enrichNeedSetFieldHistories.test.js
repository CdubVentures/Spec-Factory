import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { enrichNeedSetFieldHistories } from '../src/features/indexing/orchestration/finalize/enrichNeedSetFieldHistories.js';

describe('enrichNeedSetFieldHistories', () => {
  it('enriches fields with history from provenance and queries', () => {
    const fields = [
      { field_key: 'sensor_brand', state: 'missing', history: { existing_queries: [], domains_tried: [], host_classes_tried: [], evidence_classes_tried: [], query_count: 0, urls_examined_count: 0, no_value_attempts: 0, duplicate_attempts_suppressed: 0 } },
      { field_key: 'dpi_max', state: 'missing', history: { existing_queries: [], domains_tried: [], host_classes_tried: [], evidence_classes_tried: [], query_count: 0, urls_examined_count: 0, no_value_attempts: 0, duplicate_attempts_suppressed: 0 } },
    ];

    const provenance = {
      sensor_brand: {
        value: 'HERO 2',
        evidence: [{ url: 'https://logitech.com/spec', rootDomain: 'logitech.com', tier: 1, tierName: 'manufacturer' }],
      },
      dpi_max: { value: 'unk', evidence: [] },
    };

    const searchPlanQueries = [
      { query: 'logitech g pro sensor specs', target_fields: ['sensor_brand', 'dpi_max'] },
    ];

    const result = enrichNeedSetFieldHistories({ fields, provenance, searchPlanQueries });

    // sensor_brand: found value, has query and domain
    assert.deepStrictEqual(result[0].history.existing_queries, ['logitech g pro sensor specs']);
    assert.equal(result[0].history.query_count, 1);
    assert.deepStrictEqual(result[0].history.domains_tried, ['logitech.com']);
    assert.equal(result[0].history.no_value_attempts, 0); // found value

    // dpi_max: targeted but no value
    assert.deepStrictEqual(result[1].history.existing_queries, ['logitech g pro sensor specs']);
    assert.equal(result[1].history.query_count, 1);
    assert.equal(result[1].history.no_value_attempts, 1); // targeted, no value
  });

  it('returns fields unchanged when no provenance or queries', () => {
    const fields = [
      { field_key: 'weight', state: 'missing', history: { existing_queries: [], domains_tried: [], host_classes_tried: [], evidence_classes_tried: [], query_count: 0, urls_examined_count: 0, no_value_attempts: 0, duplicate_attempts_suppressed: 0 } },
    ];

    const result = enrichNeedSetFieldHistories({ fields, provenance: {}, searchPlanQueries: [] });

    // No queries or provenance — history should be empty still
    assert.deepStrictEqual(result[0].history.existing_queries, []);
    assert.equal(result[0].history.query_count, 0);
  });

  it('preserves previous-round history and merges current round', () => {
    const fields = [
      {
        field_key: 'weight',
        state: 'missing',
        history: {
          existing_queries: ['mouse weight grams'],
          domains_tried: ['amazon.com'],
          host_classes_tried: ['marketplace'],
          evidence_classes_tried: ['marketplace'],
          query_count: 1,
          urls_examined_count: 1,
          no_value_attempts: 1,
          duplicate_attempts_suppressed: 0,
        },
      },
    ];

    const provenance = {
      weight: {
        value: '63g',
        evidence: [{ url: 'https://rtings.com/mouse', rootDomain: 'rtings.com', tier: 2, tierName: 'review' }],
      },
    };

    const searchPlanQueries = [
      { query: 'gpx2 weight rtings', target_fields: ['weight'] },
    ];

    const result = enrichNeedSetFieldHistories({ fields, provenance, searchPlanQueries });

    // Previous queries preserved, new query added
    assert.deepStrictEqual(result[0].history.existing_queries, ['gpx2 weight rtings', 'mouse weight grams']);
    assert.equal(result[0].history.query_count, 2);
    // Previous domains + new domain
    assert.deepStrictEqual(result[0].history.domains_tried, ['amazon.com', 'rtings.com']);
    // No increment — value found this round
    assert.equal(result[0].history.no_value_attempts, 1);
  });

  it('handles fields without history gracefully', () => {
    const fields = [
      { field_key: 'connection_type', state: 'accepted' },
    ];

    const provenance = {
      connection_type: {
        value: 'wireless',
        evidence: [{ url: 'https://example.com', rootDomain: 'example.com', tier: 3 }],
      },
    };

    const result = enrichNeedSetFieldHistories({ fields, provenance, searchPlanQueries: [] });

    // Should have history even though field had none initially
    assert.ok(result[0].history, 'history should be added to field');
    assert.deepStrictEqual(result[0].history.domains_tried, ['example.com']);
  });

  it('returns empty array for null/undefined fields', () => {
    assert.deepStrictEqual(enrichNeedSetFieldHistories({ fields: null }), []);
    assert.deepStrictEqual(enrichNeedSetFieldHistories({ fields: undefined }), []);
    assert.deepStrictEqual(enrichNeedSetFieldHistories({}), []);
  });

  it('does not mutate original fields array', () => {
    const original = [
      { field_key: 'weight', state: 'missing', history: { existing_queries: [], domains_tried: [], host_classes_tried: [], evidence_classes_tried: [], query_count: 0, urls_examined_count: 0, no_value_attempts: 0, duplicate_attempts_suppressed: 0 } },
    ];
    const provenance = {
      weight: { value: '63g', evidence: [{ url: 'https://rtings.com', rootDomain: 'rtings.com', tier: 2, tierName: 'review' }] },
    };
    const queries = [{ query: 'weight query', target_fields: ['weight'] }];

    const result = enrichNeedSetFieldHistories({ fields: original, provenance, searchPlanQueries: queries });

    // Original should be unchanged
    assert.deepStrictEqual(original[0].history.existing_queries, []);
    // Result should have enriched data
    assert.ok(result[0].history.existing_queries.length > 0);
  });
});
