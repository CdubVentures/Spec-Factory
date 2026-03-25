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

test('P03 judge returns error when category is missing', async () => {
  const storage = createMockStorage();
  const result = await runQaJudge({ storage, config: {}, category: '', productId: 'p1' });
  assert.equal(result.ok, false);
});

test('P03 judge returns error when spec is not found', async () => {
  const storage = createMockStorage();
  const result = await runQaJudge({ storage, config: {}, category: 'mouse', productId: 'nonexistent' });
  assert.equal(result.ok, false);
  assert.ok(result.error.includes('not found'));
});
