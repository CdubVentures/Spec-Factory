import test from 'node:test';
import assert from 'node:assert/strict';

import {
  loadQueueState,
  upsertQueueProduct
} from '../queueState.js';
import {
  createSpecDb,
  withTempQueueStorage
} from './helpers/queueStateHarness.js';

test('queueState reads normalized specDb products and merges writes back through upsert', async () => {
  await withTempQueueStorage('spec-harvester-queue-specdb-facade-', async ({ storage }) => {
    const specDb = createSpecDb('mouse');
    specDb.upsertQueueProduct({ product_id: 'mouse-a', s3key: 'k/a.json', status: 'pending', priority: 2 });
    specDb.upsertQueueProduct({ product_id: 'mouse-b', s3key: 'k/b.json', status: 'complete', priority: 1 });

    const before = await loadQueueState({ storage, category: 'mouse', specDb });
    assert.equal(before.recovered_from_corrupt_state, false);
    assert.deepEqual(Object.keys(before.state.products).sort(), ['mouse-a', 'mouse-b']);
    assert.equal(before.state.products['mouse-a'].status, 'pending');
    assert.equal(before.state.products['mouse-a'].priority, 2);
    assert.equal(before.state.products['mouse-b'].status, 'complete');

    const result = await upsertQueueProduct({
      storage,
      category: 'mouse',
      productId: 'mouse-a',
      patch: { status: 'running', priority: 1 },
      specDb,
    });

    assert.equal(result.product.status, 'running');
    assert.equal(result.product.priority, 1);
    assert.equal(result.product.s3key, 'k/a.json');

    const after = await loadQueueState({ storage, category: 'mouse', specDb });
    assert.equal(after.state.products['mouse-a'].status, 'running');
    assert.equal(after.state.products['mouse-a'].priority, 1);
    assert.equal(after.state.products['mouse-b'].status, 'complete');
  });
});
