import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFieldHistories,
  emptyHistory,
  makeQuery,
} from './helpers/buildFieldHistoriesHarness.js';

test('buildFieldHistories - duplicates_suppressed', async (t) => {
  await t.test('distributes global suppression count across targeted fields', () => {
    const result = buildFieldHistories({
      previousFieldHistories: {},
      provenance: {},
      searchPlanQueries: [
        makeQuery({ target_fields: ['sensor_brand', 'sensor_model'] }),
      ],
      duplicatesSuppressed: 4,
    });

    assert.equal(result.sensor_brand.duplicate_attempts_suppressed, 4);
    assert.equal(result.sensor_model.duplicate_attempts_suppressed, 4);
  });

  await t.test('accumulates with previous suppression count', () => {
    const result = buildFieldHistories({
      previousFieldHistories: {
        sensor_brand: {
          ...emptyHistory(),
          duplicate_attempts_suppressed: 2,
        }
      },
      provenance: {},
      searchPlanQueries: [
        makeQuery({ target_fields: ['sensor_brand'] }),
      ],
      duplicatesSuppressed: 3,
    });

    assert.equal(result.sensor_brand.duplicate_attempts_suppressed, 5);
  });
});
