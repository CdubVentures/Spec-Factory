import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function loadWorkbenchHelpers() {
  const esbuild = await import('esbuild');
  const srcPath = path.resolve(
    __dirname,
    '..',
    'tools',
    'gui-react',
    'src',
    'pages',
    'studio',
    'workbench',
    'workbenchHelpers.ts',
  );
  const result = await esbuild.build({
    entryPoints: [srcPath],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    loader: { '.ts': 'ts' },
  });
  const code = result.outputFiles[0].text;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-helpers-'));
  const tmpFile = path.join(tmpDir, 'workbenchHelpers.mjs');
  fs.writeFileSync(tmpFile, code, 'utf8');
  const mod = await import(`file://${tmpFile.replace(/\\/g, '/')}`);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  return mod;
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
