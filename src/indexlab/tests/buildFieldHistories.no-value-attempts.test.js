import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFieldHistories,
  emptyHistory,
  makeEvidence,
  makeQuery,
} from './helpers/buildFieldHistoriesHarness.js';

test('buildFieldHistories - no-value attempt tracking', async (t) => {
  await t.test('increments no_value_attempts when field was targeted but value stayed unknown', () => {
    const result = buildFieldHistories({
      previousFieldHistories: {
        sensor_brand: {
          ...emptyHistory(),
          no_value_attempts: 1,
        }
      },
      provenance: {
        sensor_brand: { value: 'unk', evidence: [] }
      },
      searchPlanQueries: [
        makeQuery({ target_fields: ['sensor_brand'] })
      ],
      duplicatesSuppressed: 0,
    });

    assert.equal(result.sensor_brand.no_value_attempts, 2);
  });

  await t.test('does not increment when field gets a real value', () => {
    const result = buildFieldHistories({
      previousFieldHistories: {
        sensor_brand: {
          ...emptyHistory(),
          no_value_attempts: 1,
        }
      },
      provenance: {
        sensor_brand: { value: 'HERO 2', evidence: [makeEvidence()] }
      },
      searchPlanQueries: [
        makeQuery({ target_fields: ['sensor_brand'] })
      ],
      duplicatesSuppressed: 0,
    });

    assert.equal(result.sensor_brand.no_value_attempts, 1);
  });

  await t.test('does not increment when the field was not targeted', () => {
    const result = buildFieldHistories({
      previousFieldHistories: {
        sensor_brand: {
          ...emptyHistory(),
          no_value_attempts: 0,
        }
      },
      provenance: {
        sensor_brand: { value: 'unk', evidence: [] }
      },
      searchPlanQueries: [],
      duplicatesSuppressed: 0,
    });

    assert.equal(result.sensor_brand.no_value_attempts, 0);
  });
});
