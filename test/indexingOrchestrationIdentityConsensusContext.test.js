import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIdentityConsensusContext } from '../src/features/indexing/orchestration/index.js';

test('buildIdentityConsensusContext assembles identity/consensus bootstrap payloads with stable derivation', () => {
  const callOrder = [];
  const sourceResults = [{ url: 'https://example.com', anchorCheck: { majorConflicts: [] } }];
  const identityGate = { validated: true, certainty: 0.82 };
  const identityReport = { status: 'ok' };
  const extractedIdentity = { brand: 'Logitech', model: 'G Pro' };
  const identity = { brand: 'Logitech', model: 'G Pro', derived: true };
  const sourceSummary = { source_count: 1 };
  const allAnchorConflicts = [
    { severity: 'MAJOR', field: 'shape' },
    { severity: 'MINOR', field: 'weight_g' },
  ];
  const consensus = { fields: { shape: 'symmetrical' } };

  const result = buildIdentityConsensusContext({
    sourceResults,
    productId: 'mouse-1',
    runId: 'run-1',
    job: { identityLock: { brand: 'Logitech' } },
    categoryConfig: { id: 'mouse-config' },
    fieldOrder: ['shape', 'weight_g'],
    anchors: { shape: 'symmetrical' },
    category: 'mouse',
    config: { strict: true },
    runtimeFieldRulesEngine: { id: 'engine' },
    evaluateIdentityGateFn: (rows) => {
      callOrder.push('evaluateIdentityGate');
      assert.equal(rows, sourceResults);
      return identityGate;
    },
    buildIdentityReportFn: (payload) => {
      callOrder.push('buildIdentityReport');
      assert.deepEqual(payload, {
        productId: 'mouse-1',
        runId: 'run-1',
        sourceResults,
        identityGate,
      });
      return identityReport;
    },
    bestIdentityFromSourcesFn: (rows, identityLock) => {
      callOrder.push('bestIdentityFromSources');
      assert.equal(rows, sourceResults);
      assert.deepEqual(identityLock, { brand: 'Logitech' });
      return extractedIdentity;
    },
    buildIdentityObjectFn: (job, extractedIdentityArg, options) => {
      callOrder.push('buildIdentityObject');
      assert.deepEqual(job, { identityLock: { brand: 'Logitech' } });
      assert.equal(extractedIdentityArg, extractedIdentity);
      assert.deepEqual(options, { allowDerivedVariant: true });
      return identity;
    },
    buildSourceSummaryFn: (rows) => {
      callOrder.push('buildSourceSummary');
      assert.equal(rows, sourceResults);
      return sourceSummary;
    },
    mergeAnchorConflictListsFn: (rows) => {
      callOrder.push('mergeAnchorConflictLists');
      assert.deepEqual(rows, [sourceResults[0].anchorCheck]);
      return allAnchorConflicts;
    },
    executeConsensusPhaseFn: (payload) => {
      callOrder.push('executeConsensusPhase');
      assert.deepEqual(payload, {
        sourceResults,
        categoryConfig: { id: 'mouse-config' },
        fieldOrder: ['shape', 'weight_g'],
        anchors: { shape: 'symmetrical' },
        identityLock: { brand: 'Logitech' },
        productId: 'mouse-1',
        category: 'mouse',
        config: { strict: true },
        fieldRulesEngine: { id: 'engine' },
      });
      return consensus;
    },
  });

  assert.deepEqual(callOrder, [
    'evaluateIdentityGate',
    'buildIdentityReport',
    'bestIdentityFromSources',
    'buildIdentityObject',
    'buildSourceSummary',
    'mergeAnchorConflictLists',
    'executeConsensusPhase',
  ]);
  assert.deepEqual(result, {
    identityGate,
    identityConfidence: 0.82,
    identityReport,
    extractedIdentity,
    identity,
    sourceSummary,
    allAnchorConflicts,
    anchorMajorConflictsCount: 1,
    consensus,
  });
});
