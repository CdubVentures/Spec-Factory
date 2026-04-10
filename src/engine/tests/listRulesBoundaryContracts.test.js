import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRuntimeFieldRules } from '../runtimeGate.js';
import {
  createListRulesHarness,
  createListRulesNoConfigHarness
} from './helpers/listRulesHarness.js';

const listHarness = await createListRulesHarness();
const noConfigHarness = await createListRulesNoConfigHarness();

test.after(async () => {
  await Promise.all([
    listHarness.cleanup(),
    noConfigHarness.cleanup()
  ]);
});

test('list_rules pipeline applies dedupe before sort', () => {
  const result = applyRuntimeFieldRules({
    engine: listHarness.engine,
    fields: {
      features: 'Zebra, Apple, Mango, apple, Banana, Cherry, mango, Date'
    },
    fieldOrder: ['features']
  });

  assert.deepEqual(result.fields.features, ['Apple', 'Banana', 'Cherry', 'Date', 'Mango', 'Zebra']);
});

test('list_rules enforcement is opt-in for scalar fields and list fields without list_rules', () => {
  const scalarResult = applyRuntimeFieldRules({
    engine: listHarness.engine,
    fields: { weight: '54' },
    fieldOrder: ['weight']
  });
  assert.equal(scalarResult.fields.weight, 54);
  assert.equal(
    scalarResult.failures.some((row) => row.stage === 'list_rules'),
    false
  );

  const noConfigResult = applyRuntimeFieldRules({
    engine: noConfigHarness.engine,
    fields: { labels: 'a, b, a, c' },
    fieldOrder: ['labels']
  });
  assert.deepEqual(noConfigResult.fields.labels, ['a', 'b', 'a', 'c']);
});
