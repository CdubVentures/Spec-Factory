// Characterization test: proves Pass 1.5 sort output is identical with and without min_items/max_items.
// Temporary — prune after list-items retirement is verified green.
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRuntimeFieldRules } from '../runtimeGate.js';
import { createListRulesHarness, createListRulesNoLimitsHarness } from './helpers/listRulesHarness.js';

const withLimits = await createListRulesHarness();
const noLimits = await createListRulesNoLimitsHarness();

test.after(async () => {
  await Promise.all([withLimits.cleanup(), noLimits.cleanup()]);
});

const cases = [
  { label: 'string dedupe (Pass 1), no sort (Pass 1.5)', field: 'colors', input: 'Red, Blue, Red, Green' },
  { label: 'string dedupe + asc sort', field: 'features', input: 'Cherry, Apple, Banana' },
  { label: 'numeric dedupe + desc sort', field: 'sizes', input: '50, 30, 10, 40, 20' },
  { label: 'no dedupe, no sort (passthrough)', field: 'tags', input: 'alpha, beta, alpha, gamma' },
  { label: 'case-insensitive dedupe (Pass 1)', field: 'colors', input: 'Black, White, black, WHITE' }
];

for (const { label, field, input } of cases) {
  test(`field values identical: ${label}`, () => {
    const rWith = applyRuntimeFieldRules({
      engine: withLimits.engine,
      fields: { [field]: input },
      fieldOrder: [field]
    });
    const rNo = applyRuntimeFieldRules({
      engine: noLimits.engine,
      fields: { [field]: input },
      fieldOrder: [field]
    });

    assert.deepStrictEqual(rWith.fields[field], rNo.fields[field], `field values diverged for: ${label}`);
  });

  test(`no limit artifacts in no-limits run: ${label}`, () => {
    const rNo = applyRuntimeFieldRules({
      engine: noLimits.engine,
      fields: { [field]: input },
      fieldOrder: [field]
    });

    const limitFailures = rNo.failures.filter(f => f.reason_code === 'min_items_not_met');
    const limitChanges = rNo.changes.filter(c => c.rule === 'max_items_truncated');
    assert.equal(limitFailures.length, 0, `unexpected min_items failure for: ${label}`);
    assert.equal(limitChanges.length, 0, `unexpected max_items change for: ${label}`);
  });
}
