import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRunBootstrapLogPayloadPhaseCallsiteContext } from '../src/features/indexing/orchestration/index.js';

test('buildRunBootstrapLogPayloadPhaseCallsiteContext maps runProduct bootstrap-log callsite inputs to context keys', () => {
  const config = { runProfile: 'thorough' };
  const roundContext = { round: 1 };
  const identityLock = { family_model_count: 2 };

  const result = buildRunBootstrapLogPayloadPhaseCallsiteContext({
    s3Key: 'specs/inputs/mouse/products/sample.json',
    runId: 'run.abc123',
    roundContext,
    category: 'mouse',
    productId: 'mouse-sample',
    config,
    runtimeMode: 'balanced',
    identityFingerprint: 'idfp',
    identityLockStatus: 'locked',
    identityLock,
    dedupeMode: 'serp_url+content_hash',
  });

  assert.equal(result.s3Key, 'specs/inputs/mouse/products/sample.json');
  assert.equal(result.runId, 'run.abc123');
  assert.equal(result.roundContext, roundContext);
  assert.equal(result.category, 'mouse');
  assert.equal(result.productId, 'mouse-sample');
  assert.equal(result.config, config);
  assert.equal(result.runtimeMode, 'balanced');
  assert.equal(result.identityFingerprint, 'idfp');
  assert.equal(result.identityLockStatus, 'locked');
  assert.equal(result.identityLock, identityLock);
  assert.equal(result.dedupeMode, 'serp_url+content_hash');
});
