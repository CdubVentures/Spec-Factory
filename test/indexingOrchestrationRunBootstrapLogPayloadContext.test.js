import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRunBootstrapLogPayloadContext } from '../src/features/indexing/orchestration/index.js';

test('buildRunBootstrapLogPayloadContext maps runProduct bootstrap log inputs to payload contract keys', () => {
  const context = buildRunBootstrapLogPayloadContext({
    s3Key: 'specs/inputs/mouse/products/sample.json',
    runId: 'run.abc123',
    roundContext: { round: 1 },
    category: 'mouse',
    productId: 'mouse-sample',
    config: { runProfile: 'thorough' },
    runtimeMode: 'balanced',
    identityFingerprint: 'idfp',
    identityLockStatus: 'locked',
    identityLock: { family_model_count: 2 },
    dedupeMode: 'serp_url+content_hash',
  });

  assert.equal(context.s3Key, 'specs/inputs/mouse/products/sample.json');
  assert.equal(context.runId, 'run.abc123');
  assert.deepEqual(context.roundContext, { round: 1 });
  assert.equal(context.category, 'mouse');
  assert.equal(context.productId, 'mouse-sample');
  assert.deepEqual(context.config, { runProfile: 'thorough' });
  assert.equal(context.runtimeMode, 'balanced');
  assert.equal(context.identityFingerprint, 'idfp');
  assert.equal(context.identityLockStatus, 'locked');
  assert.deepEqual(context.identityLock, { family_model_count: 2 });
  assert.equal(context.dedupeMode, 'serp_url+content_hash');
});
