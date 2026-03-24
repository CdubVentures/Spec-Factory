import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFieldHistories,
  emptyHistory,
  makeEvidence,
  makeQuery,
} from './helpers/buildFieldHistoriesHarness.js';

test('buildFieldHistories - integration: multi-field multi-query round', async () => {
  const result = buildFieldHistories({
    previousFieldHistories: {
      sensor_brand: {
        ...emptyHistory(),
        existing_queries: ['old sensor query'],
        domains_tried: ['logitechg.com'],
        host_classes_tried: ['official'],
        evidence_classes_tried: ['manufacturer_html'],
        query_count: 1,
        urls_examined_count: 2,
        no_value_attempts: 0,
        duplicate_attempts_suppressed: 0,
      },
      dpi_max: {
        ...emptyHistory(),
        existing_queries: ['old dpi query'],
        query_count: 1,
        no_value_attempts: 1,
      }
    },
    provenance: {
      sensor_brand: {
        value: 'HERO 2',
        evidence: [
          makeEvidence({ tier: 2, tierName: 'review', host: 'rtings.com', rootDomain: 'rtings.com', url: 'https://rtings.com/mouse/review' }),
        ]
      },
      dpi_max: {
        value: 'unk',
        evidence: []
      },
      weight: {
        value: '63g',
        evidence: [
          makeEvidence({ tier: 1, tierName: 'manufacturer', host: 'logitechg.com', rootDomain: 'logitechg.com', url: 'https://logitechg.com/specs' }),
        ]
      }
    },
    searchPlanQueries: [
      makeQuery({ query: 'logitech sensor review', query_hash: 'h1', target_fields: ['sensor_brand', 'dpi_max'] }),
      makeQuery({ query: 'logitech gpx2 weight', query_hash: 'h2', target_fields: ['weight'] }),
    ],
    duplicatesSuppressed: 2,
  });

  assert.ok(result.sensor_brand.existing_queries.includes('old sensor query'));
  assert.ok(result.sensor_brand.existing_queries.includes('logitech sensor review'));
  assert.equal(result.sensor_brand.query_count, 2);
  assert.ok(result.sensor_brand.domains_tried.includes('logitechg.com'));
  assert.ok(result.sensor_brand.domains_tried.includes('rtings.com'));
  assert.ok(result.sensor_brand.host_classes_tried.includes('official'));
  assert.ok(result.sensor_brand.host_classes_tried.includes('review'));
  assert.ok(result.sensor_brand.evidence_classes_tried.includes('manufacturer_html'));
  assert.ok(result.sensor_brand.evidence_classes_tried.includes('review'));
  assert.equal(result.sensor_brand.no_value_attempts, 0);

  assert.ok(result.dpi_max.existing_queries.includes('old dpi query'));
  assert.ok(result.dpi_max.existing_queries.includes('logitech sensor review'));
  assert.equal(result.dpi_max.query_count, 2);
  assert.equal(result.dpi_max.no_value_attempts, 2);

  assert.ok(result.weight.existing_queries.includes('logitech gpx2 weight'));
  assert.equal(result.weight.query_count, 1);
  assert.ok(result.weight.domains_tried.includes('logitechg.com'));
  assert.equal(result.weight.no_value_attempts, 0);
});
