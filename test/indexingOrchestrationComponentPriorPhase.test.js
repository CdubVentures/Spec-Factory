import test from 'node:test';
import assert from 'node:assert/strict';
import { runComponentPriorPhase } from '../src/features/indexing/orchestration/index.js';

test('runComponentPriorPhase is a no-op when identity gate is not validated', async () => {
  const result = await runComponentPriorPhase({
    identityGate: { validated: false },
    fieldsBelowPassTarget: ['dpi'],
    criticalFieldsBelowPassTarget: ['dpi'],
    loadComponentLibraryFn: async () => {
      throw new Error('should_not_be_called');
    },
  });

  assert.deepEqual(result.componentPriorFilledFields, []);
  assert.deepEqual(result.componentPriorMatches, []);
  assert.deepEqual(result.fieldsBelowPassTarget, ['dpi']);
  assert.deepEqual(result.criticalFieldsBelowPassTarget, ['dpi']);
});

test('runComponentPriorPhase applies component priors and refreshes deficit sets', async () => {
  const result = await runComponentPriorPhase({
    identityGate: { validated: true },
    storage: { marker: 'storage' },
    normalized: { fields: { dpi: null, weight_g: 60 } },
    provenance: { weight_g: { confidence: 0.9 } },
    fieldOrder: ['dpi', 'weight_g'],
    logger: { info() {} },
    fieldsBelowPassTarget: ['dpi', 'weight_g'],
    criticalFieldsBelowPassTarget: ['dpi'],
    loadComponentLibraryFn: async ({ storage }) => {
      assert.equal(storage.marker, 'storage');
      return { rows: [{ id: 1 }] };
    },
    applyComponentLibraryPriorsFn: (payload) => {
      assert.equal(payload.fieldOrder.length, 2);
      assert.equal(payload.library.rows.length, 1);
      assert.equal(typeof payload.logger.info, 'function');
      return {
        filled_fields: ['dpi'],
        matched_components: ['shell_v2'],
      };
    },
  });

  assert.deepEqual(result.componentPriorFilledFields, ['dpi']);
  assert.deepEqual(result.componentPriorMatches, ['shell_v2']);
  assert.deepEqual(result.fieldsBelowPassTarget, ['weight_g']);
  assert.deepEqual(result.criticalFieldsBelowPassTarget, []);
});
