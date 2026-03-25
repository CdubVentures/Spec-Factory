import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRuntimeFieldRules } from '../runtimeGate.js';
import { createListRulesHarness } from './helpers/listRulesHarness.js';

const harness = await createListRulesHarness();
const { engine } = harness;

test.after(async () => {
  await harness.cleanup();
});

test('list_rules max_items truncates the normalized list and records a list_rules change', () => {
  const result = applyRuntimeFieldRules({
    engine,
    fields: { features: 'G, F, E, D, C, B, A' },
    fieldOrder: ['features']
  });

  assert.deepEqual(result.fields.features, ['A', 'B', 'C', 'D', 'E']);
  assert.equal(
    result.changes.some(
      (change) => change.field === 'features'
        && change.stage === 'list_rules'
        && change.rule === 'max_items_truncated'
    ),
    true
  );
});

test('list_rules min_items enforces both the happy boundary and post-dedupe failure boundary', () => {
  const cases = [
    {
      input: '42',
      expectedField: 'unk',
      expectFailure: true,
      expectedActual: 1
    },
    {
      input: '42, 84',
      expectedField: [84, 42],
      expectFailure: false
    },
    {
      input: '42, 42',
      expectedField: 'unk',
      expectFailure: true,
      expectedActual: 1
    }
  ];

  for (const { input, expectedField, expectFailure, expectedActual } of cases) {
    const result = applyRuntimeFieldRules({
      engine,
      fields: { sizes: input },
      fieldOrder: ['sizes']
    });

    assert.deepEqual(result.fields.sizes, expectedField, `unexpected min_items outcome for ${input}`);
    const failure = result.failures.find(
      (row) => row.field === 'sizes' && row.reason_code === 'min_items_not_met'
    );

    if (expectFailure) {
      assert.ok(failure, `expected min_items failure for ${input}`);
      assert.equal(failure.stage, 'list_rules');
      assert.equal(failure.actual, expectedActual);
    } else {
      assert.equal(failure, undefined, `did not expect min_items failure for ${input}`);
    }
  }
});
