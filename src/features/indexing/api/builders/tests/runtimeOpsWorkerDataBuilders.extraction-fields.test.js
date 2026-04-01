import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildExtractionFields,
  makeEvent,
} from './helpers/runtimeOpsWorkerDataBuildersHarness.js';

test('buildExtractionFields: returns empty array for no events', () => {
  const result = buildExtractionFields([], {});
  assert.ok(result && typeof result === 'object');
  assert.ok(Array.isArray(result.fields));
  assert.equal(result.fields.length, 0);
});

test('buildExtractionFields: aggregates llm_finished candidates into field rows', () => {
  const events = [
    makeEvent('llm_finished', {
      batch_id: 'b1',
      worker_id: 'w1',
      round: 1,
      candidates: [
        { field: 'weight', value: '58g', confidence: 0.92, method: 'llm_extract', source_url: 'https://mfr.com/mouse', source_tier: 1, snippet_id: 's1', quote: 'weighs 58g' },
      ],
    }),
  ];
  const result = buildExtractionFields(events, {});
  assert.ok(result.fields.length >= 1);
  const row = result.fields.find((f) => f.field === 'weight');
  assert.ok(row);
  assert.equal(row.value, '58g');
  assert.equal(row.confidence, 0.92);
  assert.equal(row.method, 'llm_extract');
  assert.equal(row.source_tier, 1);
  assert.equal(row.batch_id, 'b1');
  assert.equal(row.round, 1);
});

test('buildExtractionFields: aggregates source_processed candidates', () => {
  const events = [
    makeEvent('source_processed', {
      url: 'https://mfr.com/specs',
      parse_method: 'html_spec_table',
      round: 1,
      candidates: [
        { field: 'sensor', value: 'PAW3950', confidence: 0.85, method: 'html_spec_table', source_url: 'https://mfr.com/specs', source_tier: 1 },
      ],
    }),
  ];
  const result = buildExtractionFields(events, {});
  assert.ok(result.fields.length >= 1);
  const row = result.fields.find((f) => f.field === 'sensor');
  assert.ok(row);
  assert.equal(row.value, 'PAW3950');
  assert.equal(row.method, 'html_spec_table');
});

test('buildExtractionFields: deduplicates fields keeping highest confidence', () => {
  const events = [
    makeEvent('source_processed', {
      url: 'https://a.com',
      round: 1,
      candidates: [
        { field: 'dpi', value: '30000', confidence: 0.7, method: 'html_table', source_url: 'https://a.com', source_tier: 2 },
      ],
    }),
    makeEvent('llm_finished', {
      batch_id: 'b1',
      round: 1,
      candidates: [
        { field: 'dpi', value: '30000', confidence: 0.95, method: 'llm_extract', source_url: 'https://b.com', source_tier: 1 },
      ],
    }),
  ];
  const result = buildExtractionFields(events, {});
  const dpiRows = result.fields.filter((f) => f.field === 'dpi');
  assert.equal(dpiRows.length, 1);
  assert.equal(dpiRows[0].confidence, 0.95);
});

test('buildExtractionFields: marks accepted when fields_filled_from_source present', () => {
  const events = [
    makeEvent('source_processed', {
      url: 'https://mfr.com',
      round: 1,
      candidates: [
        { field: 'weight', value: '58g', confidence: 0.9, method: 'html_spec_table', source_url: 'https://mfr.com', source_tier: 1 },
      ],
    }),
    makeEvent('fields_filled_from_source', {
      url: 'https://mfr.com',
      fields: ['weight'],
    }),
  ];
  const result = buildExtractionFields(events, {});
  const row = result.fields.find((f) => f.field === 'weight');
  assert.ok(row);
  assert.equal(row.status, 'accepted');
});

test('buildExtractionFields: marks conflict when multiple different values exist', () => {
  const events = [
    makeEvent('source_processed', {
      url: 'https://a.com',
      round: 1,
      candidates: [
        { field: 'weight', value: '58g', confidence: 0.85, method: 'html_table', source_url: 'https://a.com', source_tier: 1 },
      ],
    }),
    makeEvent('source_processed', {
      url: 'https://b.com',
      round: 1,
      candidates: [
        { field: 'weight', value: '62g', confidence: 0.9, method: 'html_table', source_url: 'https://b.com', source_tier: 2 },
      ],
    }),
  ];
  const result = buildExtractionFields(events, {});
  const row = result.fields.find((f) => f.field === 'weight');
  assert.ok(row);
  assert.equal(row.status, 'conflict');
});

test('buildExtractionFields: marks unknown when value is unk', () => {
  const events = [
    makeEvent('llm_finished', {
      batch_id: 'b1',
      round: 1,
      candidates: [
        { field: 'weight', value: 'unk', confidence: 0.1, method: 'llm_extract', source_url: 'https://x.com', source_tier: 3 },
      ],
    }),
  ];
  const result = buildExtractionFields(events, {});
  const row = result.fields.find((f) => f.field === 'weight');
  assert.ok(row);
  assert.equal(row.status, 'unknown');
});

test('buildExtractionFields: populates refs_count from candidates array length', () => {
  const events = [
    makeEvent('source_processed', {
      url: 'https://a.com',
      round: 1,
      candidates: [
        { field: 'sensor', value: 'PAW3950', confidence: 0.8, method: 'html_table', source_url: 'https://a.com', source_tier: 1 },
      ],
    }),
    makeEvent('source_processed', {
      url: 'https://b.com',
      round: 1,
      candidates: [
        { field: 'sensor', value: 'PAW3950', confidence: 0.85, method: 'html_table', source_url: 'https://b.com', source_tier: 2 },
      ],
    }),
  ];
  const result = buildExtractionFields(events, {});
  const row = result.fields.find((f) => f.field === 'sensor');
  assert.ok(row);
  assert.equal(row.refs_count, 2);
});

test('buildExtractionFields: includes batch_id and worker_id from payload', () => {
  const events = [
    makeEvent('llm_finished', {
      batch_id: 'batch-42',
      worker_id: 'w7',
      round: 2,
      candidates: [
        { field: 'buttons', value: '5', confidence: 0.88, method: 'llm_extract', source_url: 'https://x.com', source_tier: 2 },
      ],
    }),
  ];
  const result = buildExtractionFields(events, {});
  const row = result.fields.find((f) => f.field === 'buttons');
  assert.ok(row);
  assert.equal(row.batch_id, 'batch-42');
});

test('buildExtractionFields: filters by round when option provided', () => {
  const events = [
    makeEvent('llm_finished', {
      batch_id: 'b1',
      round: 1,
      candidates: [
        { field: 'weight', value: '58g', confidence: 0.9, method: 'llm_extract', source_url: 'https://x.com', source_tier: 1 },
      ],
    }),
    makeEvent('llm_finished', {
      batch_id: 'b2',
      round: 2,
      candidates: [
        { field: 'dpi', value: '30000', confidence: 0.95, method: 'llm_extract', source_url: 'https://x.com', source_tier: 1 },
      ],
    }),
  ];
  const result = buildExtractionFields(events, { round: 2 });
  assert.equal(result.fields.length, 1);
  assert.equal(result.fields[0].field, 'dpi');
});

test('buildExtractionFields: sorts conflicts first then by confidence desc then alphabetical', () => {
  const events = [
    makeEvent('source_processed', {
      round: 1,
      candidates: [
        { field: 'dpi', value: '30000', confidence: 0.95, method: 'html_table', source_url: 'https://a.com', source_tier: 1 },
      ],
    }),
    makeEvent('source_processed', {
      round: 1,
      candidates: [
        { field: 'weight', value: '58g', confidence: 0.9, method: 'html_table', source_url: 'https://a.com', source_tier: 1 },
        { field: 'weight', value: '60g', confidence: 0.85, method: 'html_table', source_url: 'https://b.com', source_tier: 2 },
      ],
    }),
  ];
  const result = buildExtractionFields(events, {});
  assert.ok(result.fields.length >= 2);
  assert.equal(result.fields[0].field, 'weight');
  assert.equal(result.fields[0].status, 'conflict');
});

test('buildExtractionFields: candidates array contains all raw candidates for a field', () => {
  const events = [
    makeEvent('llm_finished', {
      batch_id: 'b1',
      round: 1,
      candidates: [
        { field: 'sensor', value: 'PAW3950', confidence: 0.9, method: 'llm_extract', source_url: 'https://a.com', source_tier: 1, snippet_id: 's1', quote: 'sensor is PAW3950' },
        { field: 'sensor', value: 'PAW3950', confidence: 0.8, method: 'llm_extract', source_url: 'https://b.com', source_tier: 2, snippet_id: 's2', quote: 'uses PAW3950' },
      ],
    }),
  ];
  const result = buildExtractionFields(events, {});
  const row = result.fields.find((f) => f.field === 'sensor');
  assert.ok(row);
  assert.ok(Array.isArray(row.candidates));
  assert.equal(row.candidates.length, 2);
  assert.equal(row.candidates[0].snippet_id, 's1');
});

test('buildExtractionFields: fills from sourcePackets when events lack candidates', () => {
  // Events with no candidates (mimics real source_processed events that have stripped payload)
  const events = [
    makeEvent('fields_filled_from_source', { url: 'https://mfr.com', fields: ['sensor'] }),
  ];
  const sourcePackets = [
    {
      canonical_url: 'https://mfr.com/product',
      source_key: 'https://mfr.com/product',
      source_metadata: { source_url: 'https://mfr.com/product' },
      field_key_map: {
        sensor: {
          contexts: [{
            assertions: [{
              field_key: 'sensor',
              value_raw: 'PAW3950',
              value_normalized: 'PAW3950',
              confidence: 0.92,
              extraction_method: 'spec_table_match',
              parser_phase: 'extract:html-table',
            }],
          }],
        },
        dpi: {
          contexts: [{
            assertions: [{
              field_key: 'dpi',
              value_raw: '30000',
              value_normalized: '30000',
              confidence: 0.88,
              extraction_method: 'dom',
              parser_phase: 'extract:static-html',
            }],
          }],
        },
      },
    },
  ];
  const result = buildExtractionFields(events, { sourcePackets });
  assert.ok(result.fields.length >= 2, `expected >= 2 fields, got ${result.fields.length}`);

  const sensor = result.fields.find((f) => f.field === 'sensor');
  assert.ok(sensor, 'sensor field should exist');
  assert.equal(sensor.value, 'PAW3950');
  assert.equal(sensor.method, 'spec_table_match');
  assert.equal(sensor.status, 'accepted'); // because fields_filled_from_source has 'sensor'

  const dpi = result.fields.find((f) => f.field === 'dpi');
  assert.ok(dpi, 'dpi field should exist');
  assert.equal(dpi.value, '30000');
  assert.equal(dpi.method, 'dom');
});

test('buildExtractionFields: prefers event candidates over sourcePacket data for same field', () => {
  const events = [
    makeEvent('source_processed', {
      url: 'https://mfr.com',
      round: 1,
      candidates: [
        { field: 'weight', value: '55g', confidence: 0.95, method: 'html_spec_table', source_url: 'https://mfr.com' },
      ],
    }),
  ];
  const sourcePackets = [
    {
      canonical_url: 'https://mfr.com',
      source_key: 'https://mfr.com',
      source_metadata: { source_url: 'https://mfr.com' },
      field_key_map: {
        weight: {
          contexts: [{
            assertions: [{
              field_key: 'weight',
              value_raw: '58g',
              confidence: 0.88,
              extraction_method: 'dom',
            }],
          }],
        },
      },
    },
  ];
  const result = buildExtractionFields(events, { sourcePackets });
  const row = result.fields.find((f) => f.field === 'weight');
  assert.ok(row, 'weight field should exist');
  // Event candidate has higher confidence and same host, so it wins
  assert.equal(row.value, '55g');
  assert.equal(row.confidence, 0.95);
});
