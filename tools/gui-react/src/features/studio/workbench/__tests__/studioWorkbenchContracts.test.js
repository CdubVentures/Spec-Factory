import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

function createJsxRuntimeStub() {
  return `
    export function jsx(type, props) {
      return { type, props: props || {} };
    }
    export const jsxs = jsx;
    export const Fragment = Symbol.for('fragment');
  `;
}

async function loadWorkbenchHelpers() {
  return loadBundledModule('tools/gui-react/src/features/studio/workbench/workbenchHelpers.ts', {
    prefix: 'studio-workbench-helper-contracts-',
  });
}

async function loadWorkbenchColumns() {
  return loadBundledModule('tools/gui-react/src/features/studio/workbench/workbenchColumns.tsx', {
    prefix: 'studio-workbench-column-contracts-',
    stubs: {
      'react/jsx-runtime': createJsxRuntimeStub(),
    },
  });
}

async function loadWorkbenchInlineEditContracts() {
  return loadBundledModule('tools/gui-react/src/features/studio/workbench/workbenchInlineEditContracts.ts', {
    prefix: 'studio-workbench-inline-contracts-',
  });
}

test('studio workbench contracts preserve core field metadata after publish-gate retirement', async () => {
  const [
    { buildWorkbenchRows },
    { ALL_COLUMN_IDS_WITH_LABELS, getPresetVisibility },
    { resolveWorkbenchInlineEditPath },
  ] = await Promise.all([
    loadWorkbenchHelpers(),
    loadWorkbenchColumns(),
    loadWorkbenchInlineEditContracts(),
  ]);

  const rows = buildWorkbenchRows(
    ['weight'],
    {
      weight: {
        ui: { label: 'Weight', group: 'specs' },
        contract: { unit: 'g' },
        priority: { required_level: 'identity' },
      },
    },
    null,
    {},
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].contractUnit, 'g');

  const columnIds = ALL_COLUMN_IDS_WITH_LABELS.map((entry) => entry.id);
  assert.equal(columnIds.includes('contractUnit'), true);
  assert.equal(columnIds.includes('publishGate'), false, 'publishGate column should be retired');
  assert.equal(columnIds.includes('blockPublishWhenUnk'), false, 'blockPublishWhenUnk column should be retired');

  assert.equal(resolveWorkbenchInlineEditPath('unknownColumn'), '');
});
