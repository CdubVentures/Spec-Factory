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

test('P03 judge handles specs without a nested fields key', async () => {
  const storage = createMockStorage({
    'mouse/p1/final/spec.json': {
      weight: '54',
      sensor: 'unk',
    },
  });
  const result = await runQaJudge({ storage, config: {}, category: 'mouse', productId: 'p1' });
  assert.equal(result.ok, true);
  assert.ok(result.summary.total_fields >= 1);
});
