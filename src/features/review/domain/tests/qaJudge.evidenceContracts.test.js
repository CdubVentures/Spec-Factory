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

test('P03 judge detects fields without provenance', async () => {
  const storage = createMockStorage({
    'mouse/p1/final/spec.json': {
      fields: {
        weight: '54',
        sensor: 'Focus Pro 4K',
      },
    },
    'mouse/p1/final/provenance.json': {
      weight: { url: 'https://rtings.com', snippet_id: 's1', quote: '54g', source_id: 'rtings' },
    },
  });
  const result = await runQaJudge({ storage, config: {}, category: 'mouse', productId: 'p1' });
  assert.equal(result.ok, true);
  assert.ok(result.evidence_issues.length >= 1);
  assert.ok(result.evidence_issues.some((issue) => issue.field === 'sensor' && issue.issue === 'no_provenance'));
});

test('P03 judge detects provenance without source URL', async () => {
  const storage = createMockStorage({
    'mouse/p1/final/spec.json': {
      fields: { weight: '54' },
    },
    'mouse/p1/final/provenance.json': {
      weight: { quote: '54g' },
    },
  });
  const result = await runQaJudge({ storage, config: {}, category: 'mouse', productId: 'p1' });
  assert.equal(result.ok, true);
  assert.ok(result.evidence_issues.some((issue) => issue.field === 'weight' && issue.issue === 'no_source_url'));
});
