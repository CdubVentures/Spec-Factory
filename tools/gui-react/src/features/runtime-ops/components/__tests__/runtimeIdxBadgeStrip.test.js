import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBundledModule } from '../../../../../../../test/helpers/loadBundledModule.js';

function loadRuntimeIdxBadgeStripModule() {
  return loadBundledModule('tools/gui-react/src/features/runtime-ops/components/RuntimeIdxBadgeStrip.tsx', {
    prefix: 'runtime-idx-badge-strip-',
  });
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
