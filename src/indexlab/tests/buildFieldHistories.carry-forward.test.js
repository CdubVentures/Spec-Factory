import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFieldHistories,
  emptyHistory,
  makeEvidence,
  makeQuery,
} from './helpers/buildFieldHistoriesHarness.js';

test('buildFieldHistories - carry forward preserves previous history', async (t) => {
  await t.test('merges previous queries with new queries', () => {
    const result = buildFieldHistories({
      previousFieldHistories: {
        sensor_brand: {
          ...emptyHistory(),
          existing_queries: ['old query'],
          query_count: 1,
        }
      },
      provenance: { sensor_brand: { value: 'unk', evidence: [] } },
      searchPlanQueries: [
        makeQuery({ query: 'new query', query_hash: 'h2', target_fields: ['sensor_brand'] })
      ],
      duplicatesSuppressed: 0,
    });

    assert.deepStrictEqual(result.sensor_brand.existing_queries, ['new query', 'old query']);
    assert.equal(result.sensor_brand.query_count, 2);
  });

  await t.test('deduplicates queries', () => {
    const result = buildFieldHistories({
      previousFieldHistories: {
        sensor_brand: {
          ...emptyHistory(),
          existing_queries: ['logitech sensor specs'],
          query_count: 1,
        }
      },
      provenance: {},
      searchPlanQueries: [
        makeQuery({ query: 'logitech sensor specs', query_hash: 'h1', target_fields: ['sensor_brand'] })
      ],
      duplicatesSuppressed: 0,
    });

    assert.deepStrictEqual(result.sensor_brand.existing_queries, ['logitech sensor specs']);
    assert.equal(result.sensor_brand.query_count, 2);
  });

  await t.test('merges domains_tried from evidence', () => {
    const result = buildFieldHistories({
      previousFieldHistories: {
        sensor_brand: {
          ...emptyHistory(),
          domains_tried: ['logitechg.com'],
        }
      },
      provenance: {
        sensor_brand: {
          value: 'HERO 2',
          evidence: [
            makeEvidence({ rootDomain: 'rtings.com', tier: 2, tierName: 'review' }),
            makeEvidence({ rootDomain: 'logitechg.com', tier: 1, tierName: 'manufacturer' }),
          ]
        }
      },
      searchPlanQueries: [],
      duplicatesSuppressed: 0,
    });

    const domains = result.sensor_brand.domains_tried;
    assert.ok(domains.includes('logitechg.com'));
    assert.ok(domains.includes('rtings.com'));
    assert.equal(domains.length, 2);
  });
});
