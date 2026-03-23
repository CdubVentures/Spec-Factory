import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBundledModule } from './helpers/loadBundledModule.js';

function loadWorkbenchHelpers() {
  return loadBundledModule('tools/gui-react/src/features/studio/workbench/workbenchHelpers.ts', {
    prefix: 'workbench-helpers-',
  });
}

test('buildWorkbenchRows exposes constraint count and variables for table audit', async () => {
  const { buildWorkbenchRows } = await loadWorkbenchHelpers();

  const rows = buildWorkbenchRows(
    ['sensor_date'],
    {
      sensor_date: {
        ui: { label: 'Sensor Date', group: 'specs' },
        constraints: [
          'sensor_date <= release_date',
          'sensor_date >= launch_date',
          'sensor requires sensor_brand',
        ],
      },
    },
    null,
    {},
  );

  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(row.constraintsCount, 3);
  assert.deepEqual(
    String(row.constraintVariables || '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean),
    ['launch_date', 'release_date', 'sensor', 'sensor_brand'],
  );
});

test('buildWorkbenchRows handles missing constraints without crashing', async () => {
  const { buildWorkbenchRows } = await loadWorkbenchHelpers();

  const rows = buildWorkbenchRows(
    ['dpi'],
    {
      dpi: {
        ui: { label: 'DPI', group: 'specs' },
      },
    },
    null,
    {},
  );

  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(row.constraintsCount, 0);
  assert.equal(row.constraintVariables, '');
});
