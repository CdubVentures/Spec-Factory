import test from 'node:test';
import assert from 'node:assert/strict';

import {
  markQueueRunning,
  recordQueueRunResult
} from '../queueState.js';
import {
  createSpecDb,
  withTempQueueStorage
} from './helpers/queueStateHarness.js';

test('queueState stamps running rows and records validated run results in specDb', async () => {
  await withTempQueueStorage('spec-harvester-queue-specdb-lifecycle-', async ({ storage }) => {
    const specDb = createSpecDb('mouse');
    specDb.upsertQueueProduct({
      product_id: 'mouse-run',
      s3key: 'k/run.json',
      status: 'pending',
      cost_usd_total: 0.5,
      rounds_completed: 1,
      attempts_total: 1,
    });

    const started = await markQueueRunning({
      storage,
      category: 'mouse',
      productId: 'mouse-run',
      s3key: 'k/run.json',
      specDb,
    });

    assert.equal(started.product.status, 'running');
    assert.ok(started.product.last_started_at);

    const result = await recordQueueRunResult({
      storage,
      category: 'mouse',
      s3key: 'k/run.json',
      result: {
        productId: 'mouse-run',
        runId: 'run-002',
        summary: {
          validated: true,
          confidence: 0.85,
          llm: { cost_usd_run: 0.25 }
        },
      },
      roundResult: {},
      specDb,
    });

    assert.equal(result.product.status, 'complete');
    assert.equal(result.product.attempts_total, 2);
    assert.equal(result.product.rounds_completed, 2);
    assert.equal(result.product.last_run_id, 'run-002');
    assert.equal(result.product.last_summary.confidence, 0.85);
    assert.ok(result.product.cost_usd_total_for_product > 0.5);
    assert.ok(result.product.last_completed_at);
  });
});
