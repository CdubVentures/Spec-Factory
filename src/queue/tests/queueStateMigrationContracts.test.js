import test from 'node:test';
import assert from 'node:assert/strict';

import {
  loadQueueState,
  migrateQueueEntry
} from '../queueState.js';
import {
  createSpecDb,
  withTempQueueStorage
} from './helpers/queueStateHarness.js';

test('migrateQueueEntry renames specDb-backed queue rows and removes the old id', async () => {
  await withTempQueueStorage('spec-harvester-queue-migrate-db-', async ({ storage }) => {
    const category = 'mouse';
    const oldProductId = 'mouse-razer-viper-v3-pro';
    const newProductId = 'mouse-razer-viper-v3-pro-se';
    const specDb = createSpecDb(category);

    specDb.upsertQueueProduct({
      product_id: oldProductId,
      s3key: `specs/inputs/${category}/products/${oldProductId}.json`,
      status: 'queued',
    });

    const migrated = await migrateQueueEntry({
      storage,
      category,
      oldProductId,
      newProductId,
      specDb,
    });

    assert.equal(migrated, true);

    const loaded = await loadQueueState({ storage, category, specDb });
    assert.equal(Boolean(loaded.state.products[newProductId]), true);
    assert.equal(Boolean(loaded.state.products[oldProductId]), false);
  });
});
