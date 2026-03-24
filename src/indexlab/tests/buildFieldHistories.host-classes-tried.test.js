import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFieldHistories,
  emptyHistory,
  makeEvidence,
} from './helpers/buildFieldHistoriesHarness.js';

test('buildFieldHistories - host_classes_tried classification', async (t) => {
  await t.test('derives host classes from evidence tier and host', () => {
    const result = buildFieldHistories({
      previousFieldHistories: {},
      provenance: {
        sensor_brand: {
          value: 'HERO 2',
          evidence: [
            makeEvidence({ tier: 1, tierName: 'manufacturer', host: 'logitechg.com', rootDomain: 'logitechg.com' }),
            makeEvidence({ tier: 2, tierName: 'review', host: 'rtings.com', rootDomain: 'rtings.com' }),
          ]
        }
      },
      searchPlanQueries: [],
      duplicatesSuppressed: 0,
    });

    const hostClasses = result.sensor_brand.host_classes_tried;
    assert.ok(hostClasses.includes('official'));
    assert.ok(hostClasses.includes('review'));
  });

  await t.test('deduplicates host classes', () => {
    const result = buildFieldHistories({
      previousFieldHistories: {
        sensor_brand: {
          ...emptyHistory(),
          host_classes_tried: ['official'],
        }
      },
      provenance: {
        sensor_brand: {
          value: 'HERO 2',
          evidence: [
            makeEvidence({ tier: 1, tierName: 'manufacturer', host: 'logitechg.com', rootDomain: 'logitechg.com' }),
          ]
        }
      },
      searchPlanQueries: [],
      duplicatesSuppressed: 0,
    });

    const hostClasses = result.sensor_brand.host_classes_tried;
    assert.equal(hostClasses.filter((name) => name === 'official').length, 1);
  });
});
