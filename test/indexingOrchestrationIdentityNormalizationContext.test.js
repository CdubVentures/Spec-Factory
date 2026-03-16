import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIdentityNormalizationContext } from '../src/features/indexing/orchestration/index.js';

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
    config: { identityGatePublishThreshold: 0.85 },
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
  assert.equal(result.identityPublishThreshold, 0.85);
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
