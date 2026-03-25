import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRuntimeFieldRules } from '../runtimeGate.js';
import { createListRulesHarness } from './helpers/listRulesHarness.js';

const harness = await createListRulesHarness();
const { engine } = harness;

test.after(async () => {
  await harness.cleanup();
});

test('list_rules sort honors configured asc, desc, and none ordering contracts', () => {
  const cases = [
    {
      field: 'features',
      input: 'Cherry, Apple, Banana',
      expected: ['Apple', 'Banana', 'Cherry']
    },
    {
      field: 'sizes',
      input: '10, 30, 20, 50, 40',
      expected: [50, 40, 30, 20, 10]
    },
    {
      field: 'colors',
      input: 'Red, Blue, Green',
      expected: ['Red', 'Blue', 'Green']
    }
  ];

  for (const { field, input, expected } of cases) {
    const result = applyRuntimeFieldRules({
      engine,
      fields: { [field]: input },
      fieldOrder: [field]
    });
    assert.deepEqual(result.fields[field], expected, `unexpected ${field} ordering`);
  }
});
