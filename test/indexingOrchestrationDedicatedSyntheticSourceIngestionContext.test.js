import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDedicatedSyntheticSourceIngestionContext } from '../src/features/indexing/orchestration/index.js';

test('buildDedicatedSyntheticSourceIngestionContext maps dedicated ingestion inputs to phase contract keys', () => {
  const adapterManager = { id: 'adapter-manager' };
  const job = { identityLock: { brand: 'Logitech' } };
  const storage = { id: 'storage' };
  const helperSupportiveSyntheticSources = [{ url: 'helper://supportive/1' }];
  const adapterArtifacts = [{ key: 'artifact-1' }];
  const sourceResults = [{ url: 'https://existing.example/spec' }];
  const anchors = { brand: 'brand' };
  const config = { identityGateBaseMatchThreshold: 0.7 };
  const buildCandidateFieldMap = () => ({ connection: 'wired' });
  const evaluateAnchorConflicts = () => ({ conflicts: [], majorConflicts: [] });
  const evaluateSourceIdentity = () => ({ match: true, score: 0.9 });

  const context = buildDedicatedSyntheticSourceIngestionContext({
    adapterManager,
    job,
    runId: 'run-1',
    storage,
    helperSupportiveSyntheticSources,
    adapterArtifacts,
    sourceResults,
    anchors,
    config,
    buildCandidateFieldMap,
    evaluateAnchorConflicts,
    evaluateSourceIdentity,
  });

  assert.equal(context.adapterManager, adapterManager);
  assert.equal(context.job, job);
  assert.equal(context.runId, 'run-1');
  assert.equal(context.storage, storage);
  assert.equal(context.helperSupportiveSyntheticSources, helperSupportiveSyntheticSources);
  assert.equal(context.adapterArtifacts, adapterArtifacts);
  assert.equal(context.sourceResults, sourceResults);
  assert.equal(context.anchors, anchors);
  assert.equal(context.config, config);
  assert.equal(context.buildCandidateFieldMapFn, buildCandidateFieldMap);
  assert.equal(context.evaluateAnchorConflictsFn, evaluateAnchorConflicts);
  assert.equal(context.evaluateSourceIdentityFn, evaluateSourceIdentity);
});
