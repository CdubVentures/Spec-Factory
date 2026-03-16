import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIdentityBootstrapContext } from '../src/features/indexing/orchestration/index.js';

test('buildIdentityBootstrapContext maps runProduct identity bootstrap inputs to phase contract keys', () => {
  const resolveIdentityAmbiguitySnapshot = async () => ({ family_model_count: 1 });
  const normalizeAmbiguityLevel = () => 'low';
  const buildRunIdentityFingerprint = () => 'idfp';
  const resolveIdentityLockStatus = () => 'locked';

  const context = buildIdentityBootstrapContext({
    job: { identityLock: { brand: 'Logitech' } },
    config: { profile: 'test' },
    category: 'mouse',
    productId: 'mouse-sample',
    resolveIdentityAmbiguitySnapshot,
    normalizeAmbiguityLevel,
    buildRunIdentityFingerprint,
    resolveIdentityLockStatus,
  });

  assert.deepEqual(context.job, { identityLock: { brand: 'Logitech' } });
  assert.deepEqual(context.config, { profile: 'test' });
  assert.equal(context.category, 'mouse');
  assert.equal(context.productId, 'mouse-sample');
  assert.equal(
    context.resolveIdentityAmbiguitySnapshotFn,
    resolveIdentityAmbiguitySnapshot,
  );
  assert.equal(context.normalizeAmbiguityLevelFn, normalizeAmbiguityLevel);
  assert.equal(context.buildRunIdentityFingerprintFn, buildRunIdentityFingerprint);
  assert.equal(context.resolveIdentityLockStatusFn, resolveIdentityLockStatus);
});
