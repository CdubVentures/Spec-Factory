import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from './helpers/loadBundledModule.js';

async function loadStudioDisplayLabel() {
  return loadBundledModule(
    'tools/gui-react/src/features/studio/state/studioDisplayLabel.ts',
    {
      prefix: 'studio-display-label-',
    },
  );
}

async function loadStudioConstraintGroups() {
  return loadBundledModule(
    'tools/gui-react/src/features/studio/state/studioConstraintGroups.ts',
    {
      prefix: 'studio-constraint-groups-',
    },
  );
}

test('displayLabel keeps ui-label, label, and humanized fallback precedence stable', async () => {
  const { displayLabel } = await loadStudioDisplayLabel();

  assert.equal(
    displayLabel('max_dpi', {
      ui: { label: 'Max DPI (UI)' },
      label: 'Max DPI',
    }),
    'Max DPI (UI)',
  );

  assert.equal(
    displayLabel('max_dpi', {
      label: 'Max DPI',
    }),
    'Max DPI',
  );

  assert.equal(displayLabel('max_dpi', null), 'Max Dpi');
});

test('deriveTypeGroup and areTypesCompatible keep key-constraint type classification stable', async () => {
  const { deriveTypeGroup, areTypesCompatible } =
    await loadStudioConstraintGroups();

  assert.equal(
    deriveTypeGroup({
      contract: { type: 'integer' },
    }),
    'numeric',
  );
  assert.equal(
    deriveTypeGroup({
      parse: { template: 'date_field' },
    }),
    'date',
  );
  assert.equal(
    deriveTypeGroup({
      parse: { template: 'boolean_yes_no_unk' },
    }),
    'boolean',
  );
  assert.equal(deriveTypeGroup({}), 'string');

  assert.equal(areTypesCompatible('numeric', 'numeric'), true);
  assert.equal(areTypesCompatible('numeric', 'date'), false);
  assert.equal(areTypesCompatible('boolean', 'string'), false);
});

test('groupRangeConstraints pairs numeric bounds for the current key and keeps unmatched expressions as singles', async () => {
  const { groupRangeConstraints } = await loadStudioConstraintGroups();

  assert.deepEqual(
    groupRangeConstraints(
      [
        'weight >= 10',
        'weight <= 20',
        'height <= 50',
        'weight requires grams',
      ],
      'weight',
    ),
    {
      ranges: [
        {
          lowerIdx: 0,
          upperIdx: 1,
          lower: 'weight >= 10',
          upper: 'weight <= 20',
          display: '10 ≤ weight ≤ 20',
        },
      ],
      singles: [
        { idx: 2, expr: 'height <= 50' },
        { idx: 3, expr: 'weight requires grams' },
      ],
    },
  );

  assert.deepEqual(
    groupRangeConstraints(
      [
        'weight >= 20',
        'weight <= 10',
      ],
      'weight',
    ),
    {
      ranges: [],
      singles: [
        { idx: 0, expr: 'weight >= 20' },
        { idx: 1, expr: 'weight <= 10' },
      ],
    },
  );
});
