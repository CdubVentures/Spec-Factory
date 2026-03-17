import test from 'node:test';
import assert from 'node:assert/strict';
import { buildValidationGatePhaseCallsiteContext } from '../src/features/indexing/orchestration/index.js';

test('buildValidationGatePhaseCallsiteContext maps runProduct validation-gate callsite inputs to context keys', () => {
  const computeCompletenessRequiredFn = () => ({ completenessRequired: 0.8 });
  const computeCoverageOverallFn = () => ({ coverageOverall: 0.7 });
  const computeConfidenceFn = () => 0.9;
  const evaluateValidationGateFn = () => ({ validated: true, reasons: [] });

  const context = buildValidationGatePhaseCallsiteContext({
    normalized: { fields: { dpi: 240 }, quality: {} },
    requiredFields: ['dpi'],
    fieldOrder: ['dpi'],
    categoryConfig: { schema: { editorial_fields: [] } },
    identityConfidence: 0.9,
    provenance: { dpi: { source: 'a' } },
    allAnchorConflicts: [],
    consensus: { agreementScore: 1 },
    identityGate: { validated: true },
    config: {},
    targets: { targetCompleteness: 0.8, targetConfidence: 0.8 },
    anchorMajorConflictsCount: 0,
    criticalFieldsBelowPassTarget: [],
    identityFull: true,
    identityPublishThreshold: 0.75,
    computeCompletenessRequiredFn,
    computeCoverageOverallFn,
    computeConfidenceFn,
    evaluateValidationGateFn,
  });

  assert.deepEqual(context.requiredFields, ['dpi']);
  assert.deepEqual(context.fieldOrder, ['dpi']);
  assert.equal(context.identityConfidence, 0.9);
  assert.equal(context.identityFull, true);
  assert.equal(context.identityPublishThreshold, 0.75);
  assert.equal(context.computeCompletenessRequiredFn, computeCompletenessRequiredFn);
  assert.equal(context.computeCoverageOverallFn, computeCoverageOverallFn);
  assert.equal(context.computeConfidenceFn, computeConfidenceFn);
  assert.equal(context.evaluateValidationGateFn, evaluateValidationGateFn);
});
