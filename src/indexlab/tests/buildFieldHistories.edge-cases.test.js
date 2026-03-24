import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFieldHistories,
  makeEvidence,
  makeQuery,
} from './helpers/buildFieldHistoriesHarness.js';

test('buildFieldHistories - edge cases', async (t) => {
  await t.test('handles null and undefined inputs gracefully', () => {
    const result = buildFieldHistories({
      previousFieldHistories: null,
      provenance: null,
      searchPlanQueries: null,
      duplicatesSuppressed: null,
    });

    assert.deepStrictEqual(result, {});
  });

  await t.test('handles evidence with missing properties', () => {
    const result = buildFieldHistories({
      previousFieldHistories: {},
      provenance: {
        sensor_brand: {
          value: 'HERO 2',
          evidence: [{ url: 'https://x.com' }]
        }
      },
      searchPlanQueries: [],
      duplicatesSuppressed: 0,
    });

    assert.ok(result.sensor_brand);
    assert.ok(Array.isArray(result.sensor_brand.domains_tried));
  });

  await t.test('handles queries with empty target_fields', () => {
    const result = buildFieldHistories({
      previousFieldHistories: {},
      provenance: {},
      searchPlanQueries: [makeQuery({ target_fields: [] })],
      duplicatesSuppressed: 0,
    });

    assert.deepStrictEqual(result, {});
  });

  await t.test('matches the Schema 1 field.history shape exactly', () => {
    const result = buildFieldHistories({
      previousFieldHistories: {},
      provenance: {
        sensor_brand: { value: 'HERO 2', evidence: [makeEvidence()] }
      },
      searchPlanQueries: [makeQuery({ target_fields: ['sensor_brand'] })],
      duplicatesSuppressed: 1,
    });

    const history = result.sensor_brand;
    const requiredKeys = [
      'existing_queries', 'domains_tried', 'host_classes_tried',
      'evidence_classes_tried', 'query_count', 'urls_examined_count',
      'no_value_attempts', 'duplicate_attempts_suppressed'
    ];

    for (const key of requiredKeys) {
      assert.ok(key in history, `missing key: ${key}`);
    }
    assert.equal(Object.keys(history).length, requiredKeys.length, 'no extra keys');
  });
});
