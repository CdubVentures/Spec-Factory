import test from 'node:test';
import assert from 'node:assert/strict';

import {
  recordQueueFailure,
  upsertQueueProduct
} from '../queueState.js';
import {
  createSpecDb,
  withTempQueueStorage
} from './helpers/queueStateHarness.js';

const CATEGORY = 'mouse';
const PRODUCT_ID = 'mouse-logitech-g-pro-x-superlight-2';
const S3KEY = `specs/inputs/${CATEGORY}/products/${PRODUCT_ID}.json`;

test('recordQueueFailure applies retry backoff and hard-fails at max attempts across adapters', async () => {
  const cases = [
    {
      label: 'json',
      seed: async ({ storage }) => {
        await upsertQueueProduct({
          storage,
          category: CATEGORY,
          productId: PRODUCT_ID,
          s3key: S3KEY,
          patch: {
            status: 'pending',
            max_attempts: 2
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
          product_id: PRODUCT_ID,
          s3key: S3KEY,
          status: 'running',
          max_attempts: 2
        });
        return specDb;
      }
    }
  ];

  for (const testCase of cases) {
    await withTempQueueStorage(`spec-harvester-queue-failure-${testCase.label}-`, async ({ storage }) => {
      const specDb = await testCase.seed({ storage });

      const first = await recordQueueFailure({
        storage,
        category: CATEGORY,
        productId: PRODUCT_ID,
        s3key: S3KEY,
        error: new Error('network timeout'),
        specDb
      });
      assert.equal(first.product.status, 'pending', `${testCase.label} first failure should stay retryable`);
      assert.equal(first.product.retry_count, 1, `${testCase.label} retry count should increment`);
      assert.equal(Boolean(first.product.next_retry_at), true, `${testCase.label} should schedule a retry`);
      assert.equal(
        String(first.product.last_error || '').includes('network timeout'),
        true,
        `${testCase.label} should persist the failure reason`
      );

      const second = await recordQueueFailure({
        storage,
        category: CATEGORY,
        productId: PRODUCT_ID,
        s3key: S3KEY,
        error: new Error('network timeout'),
        specDb
      });
      assert.equal(second.product.status, 'failed', `${testCase.label} should hard-fail at max attempts`);
      assert.equal(second.product.retry_count, 2, `${testCase.label} retry count should keep accumulating`);
      assert.equal(second.product.next_retry_at, '', `${testCase.label} should clear the retry window on hard-fail`);
    });
  }
});
