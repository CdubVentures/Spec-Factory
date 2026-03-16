import test from 'node:test';
import assert from 'node:assert/strict';
import { runDeterministicCriticPhase } from '../src/features/indexing/orchestration/index.js';

test('runDeterministicCriticPhase applies critic decisions and refreshes deficit lists', () => {
  const result = runDeterministicCriticPhase({
    normalized: { fields: { dpi: 32000 } },
    provenance: { dpi: { confidence: 0.7 } },
    categoryConfig: { criticalFieldSet: new Set(['dpi']) },
    learnedConstraints: { maxDpi: 26000 },
    fieldsBelowPassTarget: [],
    criticalFieldsBelowPassTarget: [],
    runDeterministicCriticFn: (payload) => {
      assert.equal(payload.normalized.fields.dpi, 32000);
      assert.equal(payload.provenance.dpi.confidence, 0.7);
      assert.equal(payload.fieldReasoning != null, true);
      assert.equal(payload.constraints.maxDpi, 26000);
      return {
        accept: [],
        reject: [{ field: 'dpi', reason: 'max_exceeded' }],
        unknown: [],
      };
    },
  });

  assert.deepEqual(result.criticDecisions, {
    accept: [],
    reject: [{ field: 'dpi', reason: 'max_exceeded' }],
    unknown: [],
  });
  assert.deepEqual(result.fieldsBelowPassTarget, ['dpi']);
  assert.deepEqual(result.criticalFieldsBelowPassTarget, ['dpi']);
});

test('runDeterministicCriticPhase ignores invalid reject rows and preserves existing deficits', () => {
  const result = runDeterministicCriticPhase({
    normalized: { fields: {} },
    provenance: {},
    categoryConfig: { criticalFieldSet: new Set(['weight_g']) },
    learnedConstraints: {},
    fieldsBelowPassTarget: ['dpi'],
    criticalFieldsBelowPassTarget: [],
    runDeterministicCriticFn: () => ({
      reject: [{ reason: 'missing_field' }, null, { field: '' }],
    }),
  });

  assert.deepEqual(result.fieldsBelowPassTarget, ['dpi']);
  assert.deepEqual(result.criticalFieldsBelowPassTarget, []);
});
