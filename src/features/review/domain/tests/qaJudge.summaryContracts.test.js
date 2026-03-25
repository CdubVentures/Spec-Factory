import test from 'node:test';
import assert from 'node:assert/strict';
import { runQaJudge } from '../qaJudge.js';

function createMockStorage(files = {}) {
  return {
    resolveOutputKey: (...parts) => parts.filter(Boolean).join('/'),
    async readJsonOrNull(key) {
      return files[key] || null;
    },
  };
}

test('P03 judge audits a complete product spec and reports summary counts', async () => {
  const storage = createMockStorage({
    'mouse/p1/final/spec.json': {
      fields: {
        weight: '54',
        sensor: 'Focus Pro 4K',
        dpi: 'unk',
        polling_rate: '4000',
      },
    },
    'mouse/p1/final/provenance.json': {
      weight: { url: 'https://rtings.com', snippet_id: 's1', quote: '54g', source_id: 'rtings' },
      sensor: { url: 'https://razer.com', snippet_id: 's2', quote: 'Focus Pro', source_id: 'razer' },
      polling_rate: { url: 'https://razer.com', snippet_id: 's3', quote: '4000 Hz', source_id: 'razer' },
    },
  });
  const result = await runQaJudge({ storage, config: {}, category: 'mouse', productId: 'p1' });
  assert.equal(result.ok, true);
  assert.equal(result.summary.total_fields, 4);
  assert.equal(result.summary.known_fields, 3);
  assert.equal(result.summary.unknown_fields, 1);
  assert.ok(result.summary.coverage_ratio > 0.5);
  assert.equal(result.unknown_field_list.length, 1);
  assert.ok(result.unknown_field_list.includes('dpi'));
});

test('P03 judge reports zero coverage when all fields are unknown', async () => {
  const storage = createMockStorage({
    'mouse/p1/final/spec.json': {
      fields: { weight: 'unk', sensor: 'unk' },
    },
  });
  const result = await runQaJudge({ storage, config: {}, category: 'mouse', productId: 'p1' });
  assert.equal(result.ok, true);
  assert.equal(result.summary.coverage_ratio, 0);
  assert.equal(result.summary.known_fields, 0);
  assert.equal(result.evidence_issues.length, 0);
});
