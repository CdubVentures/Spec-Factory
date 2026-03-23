import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildIdentityConsensusContext,
  buildIdentityNormalizationContext,
  runIdentityReportPersistencePhase,
} from '../src/features/indexing/orchestration/index.js';

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

test('buildIdentityNormalizationContext preserves consensus when confidence is below provisional floor (label-only refactor)', () => {
  const consensus = {
    fields: { shape: 'symmetrical' },
    provenance: { shape: { value: 'symmetrical' } },
    candidates: { shape: [{ value: 'symmetrical' }] },
    fieldsBelowPassTarget: ['weight_g'],
    criticalFieldsBelowPassTarget: ['weight_g'],
    newValuesProposed: [{ field: 'shape', value: 'symmetrical' }],
  };
  const identity = {
    brand: 'Logitech',
    model: 'G Pro X Superlight 2',
    base_model: 'G Pro X Superlight',
    sku: '910-006628',
  };
  const sourceSummary = { source_count: 4 };
  const fieldOrder = ['id', 'shape', 'weight_g'];
  const categoryConfig = { criticalFieldSet: new Set(['weight_g']) };
  let buildValidatedCalls = 0;

  const result = buildIdentityNormalizationContext({
    config: {},
    identityConfidence: 0.42,
    allowHelperProvisionalFill: true,
    productId: 'mouse-1',
    runId: 'run-1',
    category: 'mouse',
    identity,
    sourceSummary,
    fieldOrder,
    consensus,
    categoryConfig,
    buildAbortedNormalizedFn: () => {
      throw new Error('abort branch should not be called in label-only refactor');
    },
    buildValidatedNormalizedFn: (payload) => {
      buildValidatedCalls += 1;
      assert.equal(payload.productId, 'mouse-1');
      assert.equal(payload.fields.shape, 'symmetrical');
      assert.equal(payload.fields.brand, 'Logitech');
      assert.equal(payload.fields.model, 'G Pro X Superlight 2');
      return {
        fields: payload.fields,
        quality: payload.quality,
      };
    },
    createEmptyProvenanceFn: () => {
      throw new Error('empty provenance should not be called in label-only refactor');
    },
    passTargetExemptFields: new Set(['id']),
  });

  assert.equal(buildValidatedCalls, 1, 'always uses validated path now');
  assert.equal(result.identityPublishThreshold, 0.75);
  assert.equal(result.identityProvisionalFloor, 0.5);
  assert.equal(result.identityAbort, true, 'flag still computed');
  assert.equal(result.identityProvisional, false);
  assert.equal(result.identityFull, false);

  // Consensus fields PRESERVED (not wiped)
  assert.equal(result.normalized.fields.shape, 'symmetrical');
  assert.equal(result.normalized.fields.brand, 'Logitech');

  // review_required added
  assert.equal(result.normalized.review_required, true);

  // Provenance from consensus
  assert.deepEqual(result.provenance, consensus.provenance);

  // Candidates from consensus
  assert.deepEqual(result.candidates, consensus.candidates);
  assert.deepEqual(result.fieldsBelowPassTarget, consensus.fieldsBelowPassTarget);
  assert.deepEqual(result.criticalFieldsBelowPassTarget, consensus.criticalFieldsBelowPassTarget);
  assert.deepEqual(result.newValuesProposed, consensus.newValuesProposed);
});

test('buildIdentityNormalizationContext uses the 0.75 default publish threshold for provisional output when config omits an override', () => {
  const identity = {
    brand: 'Logitech',
    model: 'G Pro X Superlight 2',
    base_model: 'G Pro X Superlight',
    sku: '910-006628',
  };
  const normalizedBase = {
    fields: {},
    quality: {
      notes: ['existing-note'],
    },
  };
  const consensus = {
    fields: { shape: 'symmetrical' },
    provenance: { shape: { confirmations: 2 } },
    candidates: { shape: [{ value: 'symmetrical', score: 0.9 }] },
    fieldsBelowPassTarget: ['weight_g'],
    criticalFieldsBelowPassTarget: ['weight_g'],
    newValuesProposed: [{ field: 'shape', value: 'symmetrical' }],
  };
  let buildValidatedCalls = 0;

  const result = buildIdentityNormalizationContext({
    config: {},
    identityConfidence: 0.72,
    allowHelperProvisionalFill: false,
    productId: 'mouse-2',
    runId: 'run-2',
    category: 'mouse',
    identity,
    sourceSummary: { source_count: 3 },
    fieldOrder: ['shape', 'weight_g'],
    consensus,
    categoryConfig: { criticalFieldSet: new Set(['weight_g']) },
    buildAbortedNormalizedFn: () => {
      throw new Error('abort branch should not run in provisional mode');
    },
    buildValidatedNormalizedFn: (payload) => {
      buildValidatedCalls += 1;
      assert.equal(payload.productId, 'mouse-2');
      assert.equal(payload.runId, 'run-2');
      assert.equal(payload.category, 'mouse');
      assert.equal(payload.identity, identity);
      assert.equal(payload.fields.id, 'mouse-2');
      assert.equal(payload.fields.brand, 'Logitech');
      assert.equal(payload.fields.model, 'G Pro X Superlight 2');
      assert.equal(payload.fields.base_model, 'G Pro X Superlight');
      assert.equal(payload.fields.category, 'mouse');
      assert.equal(payload.fields.sku, '910-006628');
      assert.equal(payload.fields.shape, 'symmetrical');
      return normalizedBase;
    },
    createEmptyProvenanceFn: () => {
      throw new Error('empty provenance should not run in provisional mode');
    },
    passTargetExemptFields: new Set(['id']),
  });

  assert.equal(buildValidatedCalls, 1);
  assert.equal(result.identityPublishThreshold, 0.75);
  assert.equal(result.identityAbort, false);
  assert.equal(result.identityProvisional, true);
  assert.equal(result.identityFull, false);
  assert.equal(result.normalized, normalizedBase);
  assert.equal(result.normalized.identity_provisional, true);
  assert.equal(result.normalized.review_required, true);
  assert.match(result.normalized.quality.notes[1], /Identity provisional \(72%\)/);
  assert.equal(result.provenance, consensus.provenance);
  assert.equal(result.candidates, consensus.candidates);
  assert.equal(result.fieldsBelowPassTarget, consensus.fieldsBelowPassTarget);
  assert.equal(result.criticalFieldsBelowPassTarget, consensus.criticalFieldsBelowPassTarget);
  assert.equal(result.newValuesProposed, consensus.newValuesProposed);
});

test('runIdentityReportPersistencePhase stamps identity_report key and persists identity report JSON', async () => {
  const writes = [];
  const summary = {
    identity_report: {
      status: 'computed',
    },
  };
  const identityReport = {
    score: 0.93,
  };
  const storage = {
    async writeObject(key, buffer, meta) {
      writes.push({ key, buffer, meta });
    },
  };

  const identityReportKey = await runIdentityReportPersistencePhase({
    storage,
    runBase: 'runs/r1',
    summary,
    identityReport,
  });

  assert.equal(identityReportKey, 'runs/r1/identity_report.json');
  assert.deepEqual(summary.identity_report, {
    status: 'computed',
    key: 'runs/r1/identity_report.json',
  });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].key, 'runs/r1/identity_report.json');
  assert.equal(writes[0].buffer.toString('utf8'), JSON.stringify(identityReport, null, 2));
  assert.deepEqual(writes[0].meta, { contentType: 'application/json' });
});
