import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFieldHistories,
  makeQuery,
} from './helpers/buildFieldHistoriesHarness.js';

test('buildFieldHistories - round 0 produces empty histories', async (t) => {
  await t.test('returns empty map when no provenance or queries', () => {
    const result = buildFieldHistories({
      previousFieldHistories: {},
      provenance: {},
      searchPlanQueries: [],
      duplicatesSuppressed: 0,
    });

    assert.deepStrictEqual(result, {});
  });

  await t.test('creates entries for fields targeted by queries even with no evidence', () => {
    const result = buildFieldHistories({
      previousFieldHistories: {},
      provenance: { sensor_brand: { value: 'unk', evidence: [] } },
      searchPlanQueries: [
        makeQuery({ query: 'logitech sensor specs', query_hash: 'h1', target_fields: ['sensor_brand', 'sensor_model'] })
      ],
      duplicatesSuppressed: 0,
    });

    assert.ok(result.sensor_brand);
    assert.ok(result.sensor_model);
    assert.deepStrictEqual(result.sensor_brand.existing_queries, ['logitech sensor specs']);
    assert.equal(result.sensor_brand.query_count, 1);
  });
});
