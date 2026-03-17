import test from 'node:test';
import assert from 'node:assert/strict';
import { runDedicatedSyntheticSourceIngestionPhase } from '../src/features/indexing/orchestration/index.js';

test('runDedicatedSyntheticSourceIngestionPhase appends adapter artifacts and enriches synthetic sources', async () => {
  const callOrder = [];
  const adapterArtifacts = [{ name: 'existing-artifact' }];
  const sourceResults = [{ url: 'https://existing.example/spec' }];
  const dedicatedSyntheticSource = {
    url: 'helper://dedicated/1',
    title: 'Dedicated source',
    identityCandidates: { brand: 'Logitech' },
    fieldCandidates: [{ field: 'shape', value: 'ambidextrous' }],
  };
  const helperSyntheticSource = {
    url: 'helper://supportive/1',
    title: 'Supportive source',
    identityCandidates: { brand: 'Razer' },
    fieldCandidates: [{ field: 'weight_g', value: '54' }],
  };

  const result = await runDedicatedSyntheticSourceIngestionPhase({
    adapterManager: {
      async runDedicatedAdapters(payload) {
        callOrder.push('runDedicatedAdapters');
        assert.deepEqual(payload, {
          job: { identityLock: { brand: 'Logitech' } },
          runId: 'run-1',
          storage: { id: 'storage' },
        });
        return {
          adapterArtifacts: [{ name: 'dedicated-artifact' }],
          syntheticSources: [dedicatedSyntheticSource],
        };
      },
    },
    job: { identityLock: { brand: 'Logitech' } },
    runId: 'run-1',
    storage: { id: 'storage' },
    helperSupportiveSyntheticSources: [helperSyntheticSource],
    adapterArtifacts,
    sourceResults,
    anchors: { shape: 'shape' },
    config: {},
    buildCandidateFieldMapFn: (rows) => {
      callOrder.push('buildCandidateFieldMap');
      assert.equal(Array.isArray(rows), true);
      return { connection: 'wired' };
    },
    evaluateAnchorConflictsFn: (anchors, candidateMap) => {
      callOrder.push('evaluateAnchorConflicts');
      assert.deepEqual(anchors, { shape: 'shape' });
      assert.deepEqual(candidateMap, { connection: 'wired' });
      return callOrder.filter((step) => step === 'evaluateAnchorConflicts').length === 1
        ? { majorConflicts: [{ field: 'shape' }], conflicts: [{ field: 'shape' }] }
        : { majorConflicts: [], conflicts: [{ field: 'weight_g' }] };
    },
    evaluateSourceIdentityFn: (sourceLike, identityLock, options) => {
      callOrder.push('evaluateSourceIdentity');
      assert.equal(sourceLike.connectionHint, 'wired');
      assert.deepEqual(identityLock, { brand: 'Logitech' });
      assert.deepEqual(options, {});
      return { match: true, score: 0.88 };
    },
  });

  assert.deepEqual(callOrder, [
    'runDedicatedAdapters',
    'buildCandidateFieldMap',
    'evaluateAnchorConflicts',
    'evaluateSourceIdentity',
    'buildCandidateFieldMap',
    'evaluateAnchorConflicts',
    'evaluateSourceIdentity',
  ]);
  assert.deepEqual(adapterArtifacts, [
    { name: 'existing-artifact' },
    { name: 'dedicated-artifact' },
  ]);
  assert.equal(sourceResults.length, 3);
  assert.equal(sourceResults[1].url, 'helper://dedicated/1');
  assert.equal(sourceResults[1].anchorStatus, 'failed_major_conflict');
  assert.equal(sourceResults[2].url, 'helper://supportive/1');
  assert.equal(sourceResults[2].anchorStatus, 'minor_conflicts');
  assert.deepEqual(result, {
    dedicated: {
      adapterArtifacts: [{ name: 'dedicated-artifact' }],
      syntheticSources: [dedicatedSyntheticSource],
    },
    allSyntheticSources: [dedicatedSyntheticSource, helperSyntheticSource],
    appendedSyntheticSourceCount: 2,
  });
});
