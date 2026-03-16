import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function loadRuntimeIdxBadgeStripModule() {
  const esbuild = await import('esbuild');
  const srcPath = path.resolve(
    __dirname,
    '..',
    'tools',
    'gui-react',
    'src',
    'features',
    'runtime-ops',
    'components',
    'RuntimeIdxBadgeStrip.tsx',
  );
  const result = await esbuild.build({
    entryPoints: [srcPath],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    loader: { '.ts': 'ts', '.tsx': 'tsx' },
  });
  const code = result.outputFiles[0].text;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-idx-badge-strip-'));
  const tmpFile = path.join(tmpDir, 'runtimeIdxBadgeStrip.mjs');
  fs.writeFileSync(tmpFile, code, 'utf8');
  const mod = await import(`file://${tmpFile.replace(/\\/g, '/')}?v=${Date.now()}-${Math.random()}`);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  return mod;
}

function flattenNodes(node, acc = []) {
  if (Array.isArray(node)) {
    for (const child of node) {
      flattenNodes(child, acc);
    }
    return acc;
  }

  if (node == null || typeof node === 'boolean') {
    return acc;
  }

  acc.push(node);

  if (typeof node === 'object' && node?.props?.children !== undefined) {
    flattenNodes(node.props.children, acc);
  }

  return acc;
}

test('RuntimeIdxBadgeStrip renders the shared IDX runtime label and badge states', async () => {
  const { RuntimeIdxBadgeStrip } = await loadRuntimeIdxBadgeStripModule();

  const tree = RuntimeIdxBadgeStrip({
    badges: [
      {
        field_path: 'contract.range',
        label: 'idx.contract.range',
        state: 'active',
        tooltip: 'Range contract is active.',
      },
      {
        field_path: 'ui.tooltip_md',
        label: 'idx.ui.tooltip_md',
        state: 'off',
        tooltip: 'Tooltip guidance is off.',
      },
    ],
  });

  assert.equal(tree?.type, 'div');

  const nodes = flattenNodes(tree?.props?.children);
  const activeBadge = nodes.find((node) => String(node?.props?.className || '').includes('sf-chip-info'));
  const offBadge = nodes.find((node) => String(node?.props?.className || '').includes('sf-chip-neutral opacity-70'));

  assert.ok(nodes.some((node) => node?.props?.children === 'IDX Runtime'));
  assert.equal(activeBadge?.props?.children, 'idx.contract.range');
  assert.equal(offBadge?.props?.children, 'idx.ui.tooltip_md');
});

test('RuntimeIdxBadgeStrip renders nothing when no runtime idx badges are present', async () => {
  const { RuntimeIdxBadgeStrip } = await loadRuntimeIdxBadgeStripModule();

  assert.equal(RuntimeIdxBadgeStrip({ badges: [] }), null);
});
