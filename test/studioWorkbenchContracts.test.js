import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from './helpers/loadBundledModule.js';

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

test('studio workbench contracts keep parse-unit and publish-gate authorable after IDX-only retirement', async () => {
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
        parse: { unit: 'g' },
        priority: { publish_gate: true },
      },
    },
    null,
    {},
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].parseUnit, 'g');
  assert.equal(rows[0].publishGate, true);

  const columnIds = ALL_COLUMN_IDS_WITH_LABELS.map((entry) => entry.id);
  assert.equal(columnIds.includes('parseUnit'), true);
  assert.equal(columnIds.includes('publishGate'), true);

  const parsingPreset = getPresetVisibility('parsing');
  const minimalPreset = getPresetVisibility('minimal');
  const evidencePreset = getPresetVisibility('evidence');
  assert.equal(parsingPreset.parseUnit, true);
  assert.equal(minimalPreset.publishGate, true);
  assert.equal(evidencePreset.publishGate, true);

  assert.equal(resolveWorkbenchInlineEditPath('publishGate'), 'priority.publish_gate');
  assert.equal(resolveWorkbenchInlineEditPath('parseTemplate'), 'parse.template');
  assert.equal(resolveWorkbenchInlineEditPath('unknownColumn'), '');
});
