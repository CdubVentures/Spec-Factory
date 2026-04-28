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

function renderNode(node) {
  if (Array.isArray(node)) return node.map(renderNode);
  if (node == null || typeof node !== 'object') return node;
  if (node.type === Symbol.for('fragment')) return renderNode(node.props?.children);
  if (typeof node.type === 'function') return renderNode(node.type(node.props || {}));
  const children = Object.prototype.hasOwnProperty.call(node.props || {}, 'children')
    ? renderNode(node.props.children)
    : node.props?.children;
  return {
    ...node,
    props: {
      ...(node.props || {}),
      children,
    },
  };
}

function collectNodes(node, predicate, results = []) {
  if (Array.isArray(node)) {
    for (const child of node) collectNodes(child, predicate, results);
    return results;
  }
  if (node == null || typeof node !== 'object') return results;
  if (predicate(node)) results.push(node);
  collectNodes(node.props?.children, predicate, results);
  return results;
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
    'colorEditionContext', 'pifPriorityImages', 'reasoningNoteFilled',
    'componentLocked', 'belongsToComponent', 'propertyVariance',
    'tooltipMdFilled',
    'egLocked',
  ];
  assert.equal(columnIds.includes('matchCfgSummary'), false, 'matchCfgSummary column should be retired');
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
          color_edition_context: true,
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
  assert.equal(row.colorEditionContext, true);
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

test('studio workbench rows hide enum source for open policy', async () => {
  const { buildWorkbenchRows } = await loadWorkbenchHelpers();

  const rows = buildWorkbenchRows(
    ['color'],
    {
      color: {
        ui: { label: 'Color', group: 'design' },
        contract: { type: 'string', shape: 'scalar' },
        enum: { policy: 'open', source: 'data_lists.colors' },
      },
    },
    null,
    {},
  );

  assert.equal(rows[0].enumPolicy, 'open');
  assert.equal(rows[0].enumSource, '');
});

test('studio workbench rows force key-matched source for known enum policies', async () => {
  const { buildWorkbenchRows } = await loadWorkbenchHelpers();

  const rows = buildWorkbenchRows(
    ['color'],
    {
      color: {
        ui: { label: 'Color', group: 'design' },
        contract: { type: 'string', shape: 'scalar' },
        enum: { policy: 'open_prefer_known', source: 'data_lists.colors' },
      },
    },
    null,
    {},
  );

  assert.equal(rows[0].enumPolicy, 'open_prefer_known');
  assert.equal(rows[0].enumSource, 'data_lists.color');
});

test('studio workbench rows normalize component-locked open policy to known-preferred', async () => {
  const { buildWorkbenchRows } = await loadWorkbenchHelpers();

  const rows = buildWorkbenchRows(
    ['sensor'],
    {
      sensor: {
        ui: { label: 'Sensor', group: 'components' },
        contract: { type: 'string', shape: 'scalar' },
        enum: { policy: 'open', source: 'component_db.sensor' },
      },
    },
    null,
    {},
  );

  assert.equal(rows[0].componentLocked, true);
  assert.equal(rows[0].enumPolicy, 'open_prefer_known');
  assert.equal(rows[0].enumSource, 'component_db.sensor');
});

test('studio workbench rows mark generated component identity projections as locked', async () => {
  const { buildWorkbenchRows } = await loadWorkbenchHelpers();

  const rows = buildWorkbenchRows(
    ['sensor_brand', 'sensor_link'],
    {
      sensor_brand: {
        ui: { label: 'Sensor Brand', group: 'sensor identity' },
        component_identity_projection: { component_type: 'sensor', facet: 'brand' },
        variant_dependent: false,
        product_image_dependent: false,
        contract: { type: 'string', shape: 'scalar' },
        enum: { policy: 'open_prefer_known', source: 'data_lists.mouse_sensor_brand' },
      },
      sensor_link: {
        ui: { label: 'Sensor Link', group: 'sensor identity' },
        component_identity_projection: { component_type: 'sensor', facet: 'link' },
        variant_dependent: false,
        product_image_dependent: false,
        contract: { type: 'url', shape: 'scalar' },
        enum: { policy: 'open', source: null },
      },
    },
    null,
    {},
  );

  const byKey = Object.fromEntries(rows.map((row) => [row.key, row]));

  assert.equal(byKey.sensor_brand.componentLocked, true);
  assert.equal(byKey.sensor_brand.componentLockKind, 'identity_projection');
  assert.equal(byKey.sensor_brand.componentType, 'sensor');
  assert.equal(byKey.sensor_brand.identityProjectionFacet, 'brand');
  assert.equal(byKey.sensor_brand.contractLocked, true);
  assert.equal(byKey.sensor_brand.enumPolicy, 'open_prefer_known');
  assert.equal(byKey.sensor_brand.enumSource, 'data_lists.sensor_brand');

  assert.equal(byKey.sensor_link.componentLocked, true);
  assert.equal(byKey.sensor_link.componentLockKind, 'identity_projection');
  assert.equal(byKey.sensor_link.componentType, 'sensor');
  assert.equal(byKey.sensor_link.identityProjectionFacet, 'link');
  assert.equal(byKey.sensor_link.contractLocked, true);
  assert.equal(byKey.sensor_link.enumPolicy, 'open');
  assert.equal(byKey.sensor_link.enumSource, '');
});

test('studio workbench enum policy editor excludes open for component-locked rows', async () => {
  const { buildColumns } = await loadWorkbenchColumns();
  const columns = buildColumns(
    { key: 'sensor', column: 'enumPolicy' },
    () => {},
    () => {},
    {},
    () => {},
    () => {},
    false,
  );
  const enumPolicyColumn = columns.find((column) => column.accessorKey === 'enumPolicy');
  assert.ok(enumPolicyColumn, 'enum policy column should exist');

  const tree = renderNode(enumPolicyColumn.cell({
    row: {
      original: {
        key: 'sensor',
        enumPolicy: 'open_prefer_known',
        componentLocked: true,
      },
    },
  }));

  const options = collectNodes(tree, (node) => node.type === 'option')
    .map((node) => node.props.value);
  assert.equal(options.includes('open'), false);
  assert.equal(options.includes('open_prefer_known'), true);
  assert.equal(options.includes('closed'), true);
});

test('studio workbench enum policy cell is read-only for generated identity projections', async () => {
  const { buildColumns } = await loadWorkbenchColumns();
  const startedEdits = [];
  const columns = buildColumns(
    { key: 'sensor_link', column: 'enumPolicy' },
    (cell) => startedEdits.push(cell),
    () => {},
    {},
    () => {},
    () => {},
    false,
  );
  const enumPolicyColumn = columns.find((column) => column.accessorKey === 'enumPolicy');
  assert.ok(enumPolicyColumn, 'enum policy column should exist');

  const tree = renderNode(enumPolicyColumn.cell({
    row: {
      original: {
        key: 'sensor_link',
        enumPolicy: 'open',
        componentLocked: true,
        componentLockKind: 'identity_projection',
        identityProjectionFacet: 'link',
      },
    },
  }));

  assert.equal(collectNodes(tree, (node) => node.type === 'select').length, 0);
  assert.equal(collectNodes(tree, (node) => node.type === 'button').length, 0);
  assert.deepEqual(startedEdits, []);
});
