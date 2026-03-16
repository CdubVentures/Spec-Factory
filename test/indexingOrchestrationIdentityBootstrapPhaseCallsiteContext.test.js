import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIdentityBootstrapPhaseCallsiteContext } from '../src/features/indexing/orchestration/index.js';

test('buildIdentityBootstrapPhaseCallsiteContext maps runProduct identity-bootstrap callsite inputs to context keys', () => {
  const job = { identityLock: { brand: 'Logitech' } };
  const config = { profile: 'test' };
  const resolveIdentityAmbiguitySnapshot = async () => ({ family_model_count: 1 });
  const normalizeAmbiguityLevel = () => 'low';
  const buildRunIdentityFingerprint = () => 'idfp';
  const resolveIdentityLockStatus = () => 'locked';

  const result = buildIdentityBootstrapPhaseCallsiteContext({
    job,
    config,
    category: 'mouse',
    productId: 'mouse-sample',
    resolveIdentityAmbiguitySnapshot,
    normalizeAmbiguityLevel,
    buildRunIdentityFingerprint,
    resolveIdentityLockStatus,
  });

  assert.equal(result.job, job);
  assert.equal(result.config, config);
  assert.equal(result.category, 'mouse');
  assert.equal(result.productId, 'mouse-sample');
  assert.equal(result.resolveIdentityAmbiguitySnapshot, resolveIdentityAmbiguitySnapshot);
  assert.equal(result.normalizeAmbiguityLevel, normalizeAmbiguityLevel);
  assert.equal(result.buildRunIdentityFingerprint, buildRunIdentityFingerprint);
  assert.equal(result.resolveIdentityLockStatus, resolveIdentityLockStatus);
});
