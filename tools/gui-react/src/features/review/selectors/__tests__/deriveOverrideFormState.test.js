// RED (WS-4): Pure selector that decides what override UI to render for a
// given field (suppressed for variant generators, variant dropdown for
// variant-dependent, single input for scalars).
//
// Runs via root `node --test` using loadBundledModule to compile the TS
// source on-the-fly. tools/gui-react has no test runner of its own.

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

async function load() {
  return loadBundledModule(
    'tools/gui-react/src/features/review/selectors/overrideFormState.ts',
    { prefix: 'override-form-state-' },
  );
}

test('variantGenerator module class (colors/editions) → mode=suppressed', async () => {
  const { deriveOverrideFormState } = await load();
  const result = deriveOverrideFormState({
    fieldKey: 'colors',
    fieldRule: { type: 'array', variant_dependent: false },
    moduleClass: 'variantGenerator',
    variants: [],
  });
  assert.equal(result.mode, 'suppressed');
});

test('variant-dependent field → mode=variant, variantOptions populated', async () => {
  const { deriveOverrideFormState } = await load();
  const result = deriveOverrideFormState({
    fieldKey: 'release_date',
    fieldRule: { type: 'string', variant_dependent: true },
    moduleClass: 'variantFieldProducer',
    variants: [
      { variant_id: 'v_black', variant_label: 'Black' },
      { variant_id: 'v_white', variant_label: 'White' },
    ],
  });
  assert.equal(result.mode, 'variant');
  assert.deepEqual(result.variantOptions, [
    { id: 'v_black', label: 'Black' },
    { id: 'v_white', label: 'White' },
  ]);
});

test('scalar field → mode=scalar, no variantOptions', async () => {
  const { deriveOverrideFormState } = await load();
  const result = deriveOverrideFormState({
    fieldKey: 'name',
    fieldRule: { type: 'string', variant_dependent: false },
    moduleClass: null,
    variants: [],
  });
  assert.equal(result.mode, 'scalar');
  assert.equal(result.variantOptions.length, 0);
});

test('variantGenerator wins over variant_dependent flag (defensive)', async () => {
  // Never possible in practice, but lock the precedence.
  const { deriveOverrideFormState } = await load();
  const result = deriveOverrideFormState({
    fieldKey: 'colors',
    fieldRule: { type: 'array', variant_dependent: true },
    moduleClass: 'variantGenerator',
    variants: [{ variant_id: 'v_x', variant_label: 'X' }],
  });
  assert.equal(result.mode, 'suppressed');
});

test('variant-dependent without variants (edge case) → mode=variant with empty options', async () => {
  const { deriveOverrideFormState } = await load();
  const result = deriveOverrideFormState({
    fieldKey: 'release_date',
    fieldRule: { type: 'string', variant_dependent: true },
    moduleClass: 'variantFieldProducer',
    variants: [],
  });
  assert.equal(result.mode, 'variant');
  assert.equal(result.variantOptions.length, 0);
});
