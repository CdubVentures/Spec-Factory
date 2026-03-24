import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

test('buildRequestedRunId emits a punctuation-free UTC timestamp prefix plus hex suffix', async () => {
  const { buildRequestedRunId } = await loadBundledModule(
    'tools/gui-react/src/features/indexing/api/indexingRunId.ts',
    { prefix: 'indexing-run-id-' },
  );

  const runId = buildRequestedRunId(new Date('2026-03-10T11:22:33.456Z'));
  const [prefix, suffix] = String(runId).split('-');

  assert.equal(prefix, '20260310112233');
  assert.match(suffix, /^[0-9a-f]{6}$/);
  assert.match(runId, /^[0-9]{14}-[0-9a-f]{6}$/);
  assert.equal(/[T:.\-Z]/.test(prefix), false);
});
