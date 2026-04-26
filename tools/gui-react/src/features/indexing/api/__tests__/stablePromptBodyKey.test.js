import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

test('stablePromptBodyKey produces the same key for objects with different key insertion order', async () => {
  const { stablePromptBodyKey } = await loadBundledModule(
    'tools/gui-react/src/features/indexing/api/promptPreviewQueries.ts',
    { prefix: 'stable-prompt-body-key-' },
  );

  const a = { variant_key: 'black', mode: 'view', view: 'top' };
  const b = { view: 'top', mode: 'view', variant_key: 'black' };

  assert.equal(stablePromptBodyKey(a), stablePromptBodyKey(b));
});

test('stablePromptBodyKey preserves array order (snapshots are order-sensitive)', async () => {
  const { stablePromptBodyKey } = await loadBundledModule(
    'tools/gui-react/src/features/indexing/api/promptPreviewQueries.ts',
    { prefix: 'stable-prompt-body-key-arr-' },
  );

  const a = { passenger_field_keys_snapshot: ['k1', 'k2'] };
  const b = { passenger_field_keys_snapshot: ['k2', 'k1'] };

  assert.notEqual(stablePromptBodyKey(a), stablePromptBodyKey(b));
});

test('stablePromptBodyKey distinguishes bodies that differ in content', async () => {
  const { stablePromptBodyKey } = await loadBundledModule(
    'tools/gui-react/src/features/indexing/api/promptPreviewQueries.ts',
    { prefix: 'stable-prompt-body-key-diff-' },
  );

  const a = { variant_key: 'black', mode: 'view' };
  const b = { variant_key: 'red', mode: 'view' };

  assert.notEqual(stablePromptBodyKey(a), stablePromptBodyKey(b));
});
