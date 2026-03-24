import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFieldHistories,
  emptyHistory,
  makeEvidence,
} from './helpers/buildFieldHistoriesHarness.js';

test('buildFieldHistories - evidence_classes_tried classification', async (t) => {
  await t.test('derives evidence classes from evidence properties', () => {
    const result = buildFieldHistories({
      previousFieldHistories: {},
      provenance: {
        sensor_brand: {
          value: 'HERO 2',
          evidence: [
            makeEvidence({ tier: 1, tierName: 'manufacturer', method: 'dom', host: 'logitechg.com', rootDomain: 'logitechg.com' }),
            makeEvidence({ tier: 1, tierName: 'manufacturer', method: 'pdf_table', host: 'logitechg.com', rootDomain: 'logitechg.com', url: 'https://logitechg.com/spec.pdf' }),
          ]
        }
      },
      searchPlanQueries: [],
      duplicatesSuppressed: 0,
    });

    const evidenceClasses = result.sensor_brand.evidence_classes_tried;
    assert.ok(evidenceClasses.includes('manufacturer_html'));
    assert.ok(evidenceClasses.includes('manual_pdf'));
  });

  await t.test('merges with previous evidence classes', () => {
    const result = buildFieldHistories({
      previousFieldHistories: {
        sensor_brand: {
          ...emptyHistory(),
          evidence_classes_tried: ['retailer'],
        }
      },
      provenance: {
        sensor_brand: {
          value: 'HERO 2',
          evidence: [
            makeEvidence({ tier: 2, tierName: 'review', method: 'dom', host: 'rtings.com', rootDomain: 'rtings.com' }),
          ]
        }
      },
      searchPlanQueries: [],
      duplicatesSuppressed: 0,
    });

    const evidenceClasses = result.sensor_brand.evidence_classes_tried;
    assert.ok(evidenceClasses.includes('retailer'));
    assert.ok(evidenceClasses.includes('review'));
  });
});
