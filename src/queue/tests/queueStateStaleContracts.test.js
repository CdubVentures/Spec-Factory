import test from 'node:test';
import assert from 'node:assert/strict';

import {
  loadQueueState,
  markStaleQueueProducts,
  upsertQueueProduct
} from '../queueState.js';
import {
  createSpecDb,
  withTempQueueStorage
} from './helpers/queueStateHarness.js';

const CATEGORY = 'mouse';
const NOW_ISO = '2026-02-13T00:00:00.000Z';

test('markStaleQueueProducts only marks sufficiently old complete rows across adapters', async () => {
  const cases = [
    {
      label: 'json',
      seed: async ({ storage }) => {
        await upsertQueueProduct({
          storage,
          category: CATEGORY,
          productId: 'mouse-old',
          s3key: 'specs/inputs/mouse/products/mouse-old.json',
          patch: {
            status: 'complete',
            last_completed_at: '2025-01-01T00:00:00.000Z'
          }
        });
        await upsertQueueProduct({
          storage,
          category: CATEGORY,
          productId: 'mouse-new',
          s3key: 'specs/inputs/mouse/products/mouse-new.json',
          patch: {
            status: 'complete',
            last_completed_at: '2026-02-12T00:00:00.000Z'
          }
        });
        return null;
      }
    },
    {
      label: 'specDb',
      seed: async () => {
        const specDb = createSpecDb(CATEGORY);
        specDb.upsertQueueProduct({
          product_id: 'mouse-old',
          s3key: 'k/old.json',
          status: 'complete',
          last_completed_at: '2025-01-01T00:00:00.000Z'
        });
        specDb.upsertQueueProduct({
          product_id: 'mouse-new',
          s3key: 'k/new.json',
          status: 'complete',
          last_completed_at: '2026-02-12T00:00:00.000Z'
        });
        return specDb;
      }
    }
  ];

  for (const testCase of cases) {
    await withTempQueueStorage(`spec-harvester-queue-stale-${testCase.label}-`, async ({ storage }) => {
      const specDb = await testCase.seed({ storage });

      const result = await markStaleQueueProducts({
        storage,
        category: CATEGORY,
        staleAfterDays: 30,
        nowIso: NOW_ISO,
        specDb
      });
      assert.equal(result.stale_marked, 1, `${testCase.label} should mark exactly one stale row`);
      assert.deepEqual(result.products, ['mouse-old'], `${testCase.label} should only report the old row`);

      const loaded = await loadQueueState({ storage, category: CATEGORY, specDb });
      assert.equal(
        loaded.state.products['mouse-old'].status,
        'stale',
        `${testCase.label} should patch the old row to stale`
      );
      assert.equal(
        loaded.state.products['mouse-new'].status,
        'complete',
        `${testCase.label} should leave fresh rows alone`
      );
    });
  }
});
