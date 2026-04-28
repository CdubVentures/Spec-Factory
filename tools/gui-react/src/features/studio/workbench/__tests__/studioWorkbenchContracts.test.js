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
  assert.equal(columnIds.includes('effort'), false, 'effort column should be retired');

  // Key Navigator panel parity: every panel block has at least one column id present
  const newColumnIds = [
    'variantDependent', 'pifDependent', 'contractRange', 'listRulesSummary', 'roundingSummary',
    'variantInventoryUsage', 'pifPriorityImages', 'reasoningNoteFilled',
    'matchCfgSummary', 'belongsToComponent', 'propertyVariance',
    'tooltipMdFilled',
    'egLocked',
  ];
  for (const id of newColumnIds) {
    assert.equal(columnIds.includes(id), true, `${id} column should be registered`);
  }

  assert.equal(resolveWorkbenchInlineEditPath('unknownColumn'), '');
});

test('buildWorkbenchRows populates the new contract/ai-assist/tooltip/meta fields', async () => {
  const { buildWorkbenchRows } = await loadWorkbenchHelpers();

  const rows = buildWorkbenchRows(
    ['weight'],
    {
      weight: {
        ui: { label: 'Weight', group: 'specs', tooltip_md: 'Mass of the device.' },
        variant_dependent: false,
        product_image_dependent: true,
        contract: {
          type: 'number',
          shape: 'list',
          unit: 'g',
          range: { min: 0, max: 999 },
          rounding: { decimals: 1, mode: 'nearest' },
          list_rules: { dedupe: true, sort: 'asc', item_union: 'set_union' },
        },
        ai_assist: {
          variant_inventory_usage: true,
          pif_priority_images: false,
          reasoning_note: 'Authoritative spec sheet only.',
        },
      },
    },
    null,
    {},
    ['weight'],
  );

  const row = rows[0];
  assert.equal(row.variantDependent, false);
  assert.equal(row.pifDependent, true);
  assert.equal(row.contractRange, '0\u2013999');
  assert.equal(row.listRulesSummary, 'dedup\u00b7asc\u00b7set_union');
  assert.equal(row.roundingSummary, '1\u00b7nearest');
  assert.equal(row.variantInventoryUsage, true);
  assert.equal(row.pifPriorityImages, false);
  assert.equal(row.reasoningNoteFilled, true);
  assert.equal(row.tooltipMdFilled, true);
  assert.equal(row.egLocked, true);
});

test('buildWorkbenchRows leaves contract summaries empty when not applicable', async () => {
  const { buildWorkbenchRows } = await loadWorkbenchHelpers();

  const rows = buildWorkbenchRows(
    ['name'],
    {
      name: {
        ui: { label: 'Name', group: 'identity' },
        contract: { type: 'string', shape: 'scalar' },
      },
    },
    null,
    {},
  );

  const row = rows[0];
  assert.equal(row.contractRange, '');
  assert.equal(row.listRulesSummary, '');
  assert.equal(row.roundingSummary, '');
  assert.equal(row.tooltipMdFilled, false);
  assert.equal(row.reasoningNoteFilled, false);
  assert.equal(row.egLocked, false);
});

test('buildWorkbenchRows surfaces reverse component ownership for property fields', async () => {
  const { buildWorkbenchRows } = await loadWorkbenchHelpers();

  const rows = buildWorkbenchRows(
    ['dpi', 'sensor_type', 'unrelated'],
    {
      dpi: {
        ui: { label: 'DPI', group: 'specs' },
        contract: { type: 'number', shape: 'scalar' },
      },
      sensor_type: {
        ui: { label: 'Sensor Type', group: 'specs' },
        contract: { type: 'string', shape: 'scalar' },
      },
      unrelated: {
        ui: { label: 'Unrelated', group: 'specs' },
      },
    },
    null,
    {},
    [],
    [
      {
        component_type: 'sensor',
        roles: {
          properties: [
            { field_key: 'dpi', variance_policy: 'upper_bound' },
            { field_key: 'sensor_type', variance_policy: 'authoritative' },
          ],
        },
      },
    ],
  );

  const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
  // dpi is numeric, so upper_bound stays
  assert.equal(byKey.dpi.belongsToComponent, 'sensor');
  assert.equal(byKey.dpi.propertyVariance, 'upper_bound');
  // sensor_type is string → numeric-only policies collapse to authoritative,
  // but 'authoritative' is already authoritative — passes through
  assert.equal(byKey.sensor_type.belongsToComponent, 'sensor');
  assert.equal(byKey.sensor_type.propertyVariance, 'authoritative');
  // unrelated has no component owner
  assert.equal(byKey.unrelated.belongsToComponent, '');
  assert.equal(byKey.unrelated.propertyVariance, '');
});

test('buildWorkbenchRows collapses numeric-only variance policies to authoritative for non-numeric fields', async () => {
  const { buildWorkbenchRows } = await loadWorkbenchHelpers();

  const rows = buildWorkbenchRows(
    ['sensor_type'],
    {
      sensor_type: {
        ui: { label: 'Sensor Type', group: 'specs' },
        contract: { type: 'string' },
      },
    },
    null,
    {},
    [],
    [
      {
        component_type: 'sensor',
        roles: {
          properties: [
            // upper_bound on a string field should collapse to authoritative
            { field_key: 'sensor_type', variance_policy: 'upper_bound' },
          ],
        },
      },
    ],
  );

  assert.equal(rows[0].propertyVariance, 'authoritative');
});

test('the contract preset includes only Contract-block columns (no priority axes, no effort)', async () => {
  const { getPresetVisibility } = await loadWorkbenchColumns();
  const vis = getPresetVisibility('contract');
  assert.ok(vis, 'contract preset should resolve to a visibility map');
  // Contract-block columns are visible
  assert.equal(vis.variantDependent, true);
  assert.equal(vis.contractType, true);
  assert.equal(vis.contractRange, true);
  assert.equal(vis.roundingSummary, true);
  // Priority axes should NOT be in the contract preset
  assert.equal(vis.requiredLevel, false);
  assert.equal(vis.availability, false);
  assert.equal(vis.difficulty, false);
});

test('studio workbench rows display boolean fields as closed yes_no even from stale rule payloads', async () => {
  const { buildWorkbenchRows } = await loadWorkbenchHelpers();

  const rows = buildWorkbenchRows(
    ['discontinued'],
    {
      discontinued: {
        ui: { label: 'Discontinued', group: 'lifecycle' },
        contract: { type: 'boolean', shape: 'list' },
        enum: { policy: 'open_prefer_known', source: 'data_lists.discontinued' },
        enum_policy: 'open_prefer_known',
        enum_source: 'data_lists.discontinued',
      },
    },
    null,
    {},
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].contractType, 'boolean');
  assert.equal(rows[0].contractShape, 'scalar');
  assert.equal(rows[0].enumPolicy, 'closed');
  assert.equal(rows[0].enumSource, 'yes_no');
});
