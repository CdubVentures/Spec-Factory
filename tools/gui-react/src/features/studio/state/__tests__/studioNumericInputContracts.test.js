import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

async function loadNumericHelpers() {
  return loadBundledModule('tools/gui-react/src/features/studio/state/numericInputHelpers.ts', {
    prefix: 'studio-numeric-helpers-',
  });
}

async function loadNestedValueHelpers() {
  return loadBundledModule('tools/gui-react/src/features/studio/state/nestedValueHelpers.ts', {
    prefix: 'studio-nested-value-helpers-',
  });
}

async function loadWorkbenchHelpers() {
  return loadBundledModule('tools/gui-react/src/features/studio/workbench/workbenchHelpers.ts', {
    prefix: 'studio-workbench-helpers-',
  });
}

async function loadStudioNumericBounds() {
  return loadBundledModule('tools/gui-react/src/features/studio/state/studioNumericKnobBounds.ts', {
    prefix: 'studio-numeric-bounds-',
  });
}

test('studio numeric parsers clamp invalid values without losing explicit zero values', async () => {
  const {
    parseBoundedFloatInput,
    parseBoundedIntInput,
    parseOptionalPositiveIntInput,
  } = await loadNumericHelpers();

  assert.equal(parseBoundedIntInput('0', 0, 10, 5), 0);
  assert.equal(parseBoundedIntInput('', 0, 10, 5), 5);
  assert.equal(parseBoundedIntInput('99', 0, 10, 5), 10);

  assert.equal(parseBoundedFloatInput('0', 0, 1, 0.75), 0);
  assert.equal(parseBoundedFloatInput('', 0, 1, 0.75), 0.75);
  assert.equal(parseBoundedFloatInput('1.4', 0, 1, 0.75), 1);

  assert.equal(parseOptionalPositiveIntInput(''), null);
  assert.equal(parseOptionalPositiveIntInput('0'), null);
  assert.equal(parseOptionalPositiveIntInput('-4'), null);
  assert.equal(parseOptionalPositiveIntInput('7'), 7);
});

test('studio nested-value helpers and workbench rows preserve explicit zero evidence thresholds', async () => {
  const [{ numN }, { buildWorkbenchRows }, { STUDIO_NUMERIC_KNOB_BOUNDS }] = await Promise.all([
    loadNestedValueHelpers(),
    loadWorkbenchHelpers(),
    loadStudioNumericBounds(),
  ]);

  assert.deepEqual(STUDIO_NUMERIC_KNOB_BOUNDS.evidenceMinRefs, {
    min: 0,
    max: 10,
    fallback: 0,
  });
  assert.equal('componentMatch' in STUDIO_NUMERIC_KNOB_BOUNDS, false, 'componentMatch bounds retired');

  assert.equal(
    numN({ evidence: { min_evidence_refs: 0 } }, 'evidence.min_evidence_refs', 3),
    0,
  );
  assert.equal(
    numN({ min_evidence_refs: '0' }, 'min_evidence_refs', 3),
    0,
  );
  assert.equal(
    numN({}, 'evidence.min_evidence_refs', STUDIO_NUMERIC_KNOB_BOUNDS.evidenceMinRefs.fallback),
    0,
  );

  const rows = buildWorkbenchRows(
    ['weight'],
    {
      weight: {
        ui: { label: 'Weight', group: 'specs' },
        evidence: { min_evidence_refs: 0 },
      },
    },
    null,
    {},
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].minEvidenceRefs, 0);
});
