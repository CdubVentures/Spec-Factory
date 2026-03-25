import test from 'node:test';
import assert from 'node:assert/strict';

import {
  listQueueProducts,
  selectNextQueueProduct
} from '../queueState.js';
import {
  createSpecDb,
  withTempQueueStorage
} from './helpers/queueStateHarness.js';

test('selectNextQueueProduct skips paused and future-retry rows in memory', () => {
  const now = Date.now();
  const next = selectNextQueueProduct({
    products: {
      'mouse-a': {
        productId: 'mouse-a',
        status: 'pending',
        next_retry_at: new Date(now + 60_000).toISOString()
      },
      'mouse-b': {
        productId: 'mouse-b',
        status: 'pending',
        next_retry_at: ''
      },
      'mouse-c': {
        productId: 'mouse-c',
        status: 'paused',
        next_retry_at: ''
      }
    }
  });

  assert.equal(next?.productId, 'mouse-b');
});

test('listQueueProducts sorts specDb rows by priority then recency and filters by status', async () => {
  await withTempQueueStorage('spec-harvester-queue-ordering-', async ({ storage }) => {
    const specDb = createSpecDb('mouse');
    specDb.upsertQueueProduct({
      product_id: 'mouse-recent',
      status: 'pending',
      priority: 1,
      updated_at: '2026-02-13T00:00:00.000Z'
    });
    specDb.upsertQueueProduct({
      product_id: 'mouse-old',
      status: 'complete',
      priority: 1,
      updated_at: '2026-02-12T00:00:00.000Z'
    });
    specDb.upsertQueueProduct({
      product_id: 'mouse-low',
      status: 'pending',
      priority: 5,
      updated_at: '2026-02-14T00:00:00.000Z'
    });

    const all = await listQueueProducts({ storage, category: 'mouse', specDb });
    assert.deepEqual(
      all.map((row) => row.productId || row.product_id),
      ['mouse-recent', 'mouse-old', 'mouse-low']
    );

    const pendingOnly = await listQueueProducts({
      storage,
      category: 'mouse',
      status: 'pending',
      specDb
    });
    assert.deepEqual(
      pendingOnly.map((row) => row.productId || row.product_id),
      ['mouse-recent', 'mouse-low']
    );
  });
});
