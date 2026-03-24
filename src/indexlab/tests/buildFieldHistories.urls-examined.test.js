import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFieldHistories,
  emptyHistory,
  makeEvidence,
} from './helpers/buildFieldHistoriesHarness.js';

test('buildFieldHistories - urls_examined_count tracking', async (t) => {
  await t.test('counts unique evidence URLs per field', () => {
    const result = buildFieldHistories({
      previousFieldHistories: {},
      provenance: {
        sensor_brand: {
          value: 'HERO 2',
          evidence: [
            makeEvidence({ url: 'https://a.com/1' }),
            makeEvidence({ url: 'https://a.com/2' }),
            makeEvidence({ url: 'https://a.com/1' }),
          ]
        }
      },
      searchPlanQueries: [],
      duplicatesSuppressed: 0,
    });

    assert.equal(result.sensor_brand.urls_examined_count, 2);
  });

  await t.test('accumulates with previous count', () => {
    const result = buildFieldHistories({
      previousFieldHistories: {
        sensor_brand: {
          ...emptyHistory(),
          urls_examined_count: 3,
        }
      },
      provenance: {
        sensor_brand: {
          value: 'HERO 2',
          evidence: [makeEvidence({ url: 'https://new.com/1' })]
        }
      },
      searchPlanQueries: [],
      duplicatesSuppressed: 0,
    });

    assert.equal(result.sensor_brand.urls_examined_count, 4);
  });
});
