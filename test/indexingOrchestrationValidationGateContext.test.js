import test from 'node:test';
import assert from 'node:assert/strict';
import { buildValidationGateContext } from '../src/features/indexing/orchestration/index.js';

test('buildValidationGateContext computes gate/publishability context and stamps normalized quality fields', () => {
  const callOrder = [];
  const normalized = {
    fields: {
      shape: 'symmetrical',
      weight_g: 63,
    },
    quality: {
      notes: [],
    },
  };
  const requiredFields = ['shape', 'weight_g'];
  const fieldOrder = ['shape', 'weight_g', 'battery_life_h'];
  const categoryConfig = {
    schema: {
      editorial_fields: ['notes'],
    },
  };
  const provenance = {
    shape: { confidence: 0.8 },
    weight_g: { confidence: 0.9 },
  };
  const consensus = { agreementScore: 0.77 };
  const identityGate = {
    validated: true,
    needsReview: false,
    reasonCodes: ['identity_ok'],
  };
  const targets = {
    targetCompleteness: 0.85,
    targetConfidence: 0.8,
  };

  const result = buildValidationGateContext({
    normalized,
    requiredFields,
    fieldOrder,
    categoryConfig,
    identityConfidence: 0.88,
    provenance,
    allAnchorConflicts: [{ severity: 'MINOR' }, { severity: 'MAJOR' }],
    consensus,
    identityGate,
    config: {},
    targets,
    anchorMajorConflictsCount: 1,
    criticalFieldsBelowPassTarget: ['battery_life_h'],
    computeCompletenessRequiredFn: (normalizedArg, requiredFieldsArg) => {
      callOrder.push('computeCompletenessRequired');
      assert.equal(normalizedArg, normalized);
      assert.equal(requiredFieldsArg, requiredFields);
      return { completenessRequired: 0.75 };
    },
    computeCoverageOverallFn: (payload) => {
      callOrder.push('computeCoverageOverall');
      assert.deepEqual(payload, {
        fields: normalized.fields,
        fieldOrder,
        editorialFields: ['notes'],
      });
      return { coverageOverall: 0.65 };
    },
    computeConfidenceFn: (payload) => {
      callOrder.push('computeConfidence');
      assert.deepEqual(payload, {
        identityConfidence: 0.88,
        provenance,
        anchorConflictsCount: 2,
        agreementScore: 0.77,
      });
      return 0.82;
    },
    evaluateValidationGateFn: (payload) => {
      callOrder.push('evaluateValidationGate');
      assert.deepEqual(payload, {
        identityGateValidated: true,
        identityConfidence: 0.88,
        anchorMajorConflictsCount: 1,
        completenessRequired: 0.75,
        targetCompleteness: 0.85,
        confidence: 0.82,
        targetConfidence: 0.8,
        criticalFieldsBelowPassTarget: ['battery_life_h'],
      });
      return {
        validated: false,
        reasons: ['coverage_low'],
        validatedReason: 'COVERAGE_LOW',
      };
    },
  });

  assert.deepEqual(callOrder, [
    'computeCompletenessRequired',
    'computeCoverageOverall',
    'computeConfidence',
    'evaluateValidationGate',
  ]);
  assert.deepEqual(result.completenessStats, { completenessRequired: 0.75 });
  assert.deepEqual(result.coverageStats, { coverageOverall: 0.65 });
  assert.equal(result.confidence, 0.82);
  assert.equal(result.gate.coverageOverallPercent, 65);
  assert.equal(result.publishable, false);
  assert.deepEqual(result.publishBlockers, ['coverage_low', 'identity_ok']);
  assert.equal(normalized.quality.completeness_required, 0.75);
  assert.equal(normalized.quality.coverage_overall, 0.65);
  assert.equal(normalized.quality.confidence, 0.82);
  assert.equal(normalized.quality.validated, false);
  assert.deepEqual(normalized.quality.notes, ['coverage_low']);
});

test('buildValidationGateContext sets fallback publish blocker when gate has no reasons and identity reason codes are empty', () => {
  const normalized = { fields: {}, quality: {} };
  const result = buildValidationGateContext({
    normalized,
    requiredFields: [],
    fieldOrder: [],
    categoryConfig: { schema: { editorial_fields: [] } },
    identityConfidence: 0.55,
    provenance: {},
    allAnchorConflicts: [],
    consensus: { agreementScore: 0 },
    identityGate: {
      validated: false,
      needsReview: true,
      reasonCodes: [],
    },
    config: {},
    targets: {
      targetCompleteness: 0.8,
      targetConfidence: 0.8,
    },
    anchorMajorConflictsCount: 0,
    criticalFieldsBelowPassTarget: [],
    computeCompletenessRequiredFn: () => ({ completenessRequired: 0 }),
    computeCoverageOverallFn: () => ({ coverageOverall: 0 }),
    computeConfidenceFn: () => 0,
    evaluateValidationGateFn: () => ({
      validated: false,
      reasons: [],
      validatedReason: '',
    }),
  });

  assert.deepEqual(result.publishBlockers, ['MODEL_AMBIGUITY_ALERT']);
});

test('buildValidationGateContext defaults the publish threshold to 0.75 when the callsite omits it', () => {
  const normalized = { fields: { shape: 'symmetrical' }, quality: {} };
  const result = buildValidationGateContext({
    normalized,
    requiredFields: ['shape'],
    fieldOrder: ['shape'],
    categoryConfig: { schema: { editorial_fields: [] } },
    identityConfidence: 0.74,
    provenance: { shape: { confirmations: 2 } },
    allAnchorConflicts: [],
    consensus: { agreementScore: 0.9 },
    identityGate: {
      validated: true,
      needsReview: false,
      reasonCodes: [],
    },
    config: {},
    targets: {
      targetCompleteness: 0.8,
      targetConfidence: 0.8,
    },
    anchorMajorConflictsCount: 0,
    criticalFieldsBelowPassTarget: [],
    identityFull: true,
    computeCompletenessRequiredFn: () => ({ completenessRequired: 1 }),
    computeCoverageOverallFn: () => ({ coverageOverall: 1 }),
    computeConfidenceFn: () => 0.95,
    evaluateValidationGateFn: () => ({
      validated: true,
      reasons: [],
      validatedReason: 'OK',
    }),
  });

  assert.equal(result.publishable, false);
  assert.deepEqual(result.publishBlockers, ['OK']);
});
