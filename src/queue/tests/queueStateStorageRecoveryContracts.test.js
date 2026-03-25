import test from 'node:test';
import assert from 'node:assert/strict';

import {
  loadQueueState,
  upsertQueueProduct
} from '../queueState.js';
import { withTempQueueStorage } from './helpers/queueStateHarness.js';

test('loadQueueState recovers from corrupt queue state json and rewrites clean state on upsert', async () => {
  await withTempQueueStorage('spec-harvester-queue-corrupt-', async ({ storage }) => {
    const category = 'mouse';
    const modernKey = `_queue/${category}/state.json`;
    const legacyKey = storage.resolveOutputKey('_queue', category, 'state.json');

    await storage.writeObject(modernKey, Buffer.from('{"category":"mouse","products":{}}}', 'utf8'));
    await storage.writeObject(legacyKey, Buffer.from('{"category":"mouse","products":{}}}', 'utf8'));

    const loaded = await loadQueueState({ storage, category });
    assert.equal(loaded.recovered_from_corrupt_state, true);
    assert.deepEqual(loaded.state.products, {});

    await upsertQueueProduct({
      storage,
      category,
      productId: 'mouse-recovery-check',
      s3key: 'specs/inputs/mouse/products/mouse-recovery-check.json',
      patch: { status: 'pending' }
    });

    const after = await loadQueueState({ storage, category });
    assert.equal(Boolean(after.state.products['mouse-recovery-check']), true);
  });
});
