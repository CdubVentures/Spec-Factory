import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  RUNTIME_STEP_IDS,
  RUNTIME_STEPS,
  RUNTIME_SUB_STEPS,
  type RuntimeStepEntry,
} from '../RuntimeFlowStepRegistry';

const EXPECTED_STEP_IDS = [
  'run-setup',
  'run-output',
  'automation',
  'observability-trace',
  'fetch-network',
  'browser-rendering',
  'parsing',
] as const;

describe('RuntimeFlowStepRegistry', () => {
  it('RUNTIME_STEPS has exactly 7 entries', () => {
    assert.equal(RUNTIME_STEPS.length, 7);
  });

  it('each step has id, phase, label, tip as non-empty strings', () => {
    for (const step of RUNTIME_STEPS) {
      assert.ok(typeof step.id === 'string' && step.id.length > 0, `step.id missing`);
      assert.ok(typeof step.phase === 'string' && step.phase.length > 0, `${step.id}: phase missing`);
      assert.ok(typeof step.label === 'string' && step.label.length > 0, `${step.id}: label missing`);
      assert.ok(typeof step.tip === 'string' && step.tip.length > 0, `${step.id}: tip missing`);
    }
  });

  it('RUNTIME_STEP_IDS has 7 entries matching step IDs in order', () => {
    assert.equal(RUNTIME_STEP_IDS.length, 7);
    const stepIds = RUNTIME_STEPS.map((s) => s.id);
    assert.deepStrictEqual([...RUNTIME_STEP_IDS], stepIds);
  });

  it('RUNTIME_SUB_STEPS has an entry for every step ID', () => {
    for (const id of EXPECTED_STEP_IDS) {
      assert.ok(id in RUNTIME_SUB_STEPS, `RUNTIME_SUB_STEPS missing key: ${id}`);
      assert.ok(Array.isArray(RUNTIME_SUB_STEPS[id]), `RUNTIME_SUB_STEPS[${id}] is not an array`);
    }
  });

  it('step IDs are exactly the expected set in order', () => {
    const actual = RUNTIME_STEPS.map((s) => s.id);
    assert.deepStrictEqual(actual, [...EXPECTED_STEP_IDS]);
  });

  it('RuntimeStepEntry does not have an options field', () => {
    for (const step of RUNTIME_STEPS) {
      assert.ok(
        !('options' in step),
        `step ${step.id} still has an options field — options is dead code and should be removed`,
      );
    }
  });
});
