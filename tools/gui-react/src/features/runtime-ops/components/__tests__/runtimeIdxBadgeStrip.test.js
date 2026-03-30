import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

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

function findText(nodes, text) {
  return nodes.some((n) => {
    if (typeof n === 'string' || typeof n === 'number') return String(n).includes(text);
    if (typeof n?.props?.children === 'string') return n.props.children.includes(text);
    return false;
  });
}

test('RuntimeIdxBadgeStrip renders collapsed header with counts', async () => {
  const { RuntimeIdxBadgeStrip } = await loadRuntimeIdxBadgeStripModule();

  const tree = RuntimeIdxBadgeStrip({
    badges: [
      { field_path: 'contract.range', label: 'idx.contract.range', state: 'active', tooltip: 'Range contract is active.' },
      { field_path: 'ui.tooltip_md', label: 'idx.ui.tooltip_md', state: 'off', tooltip: 'Tooltip guidance is off.' },
      { field_path: 'extract.sensor', label: 'idx.extract.sensor', state: 'active', tooltip: 'Sensor extraction active.' },
    ],
  });

  assert.equal(tree?.type, 'div');

  const nodes = flattenNodes(tree?.props?.children);

  // WHY: Collapsed header shows "IDX Runtime" label
  assert.ok(findText(nodes, 'IDX Runtime'), 'should show IDX Runtime label');

  // WHY: Shows total badge count
  assert.ok(findText(nodes, '3'), 'should show total count of 3');

  // WHY: Shows active count — rendered as "{count} active" in a single span
  const activeNode = nodes.find((n) => {
    const c = n?.props?.children;
    if (Array.isArray(c)) return c.some((ch) => String(ch).includes('active'));
    return typeof c === 'string' && c.includes('active');
  });
  assert.ok(activeNode, 'should show active count chip');
  const activeChildren = [].concat(activeNode?.props?.children ?? []);
  assert.ok(activeChildren.some((ch) => String(ch).includes('2')), 'active chip should contain count 2');
  assert.ok(activeChildren.some((ch) => String(ch).includes('active')), 'active chip should contain "active"');
});

test('RuntimeIdxBadgeStrip renders nothing when no runtime idx badges are present', async () => {
  const { RuntimeIdxBadgeStrip } = await loadRuntimeIdxBadgeStripModule();

  assert.equal(RuntimeIdxBadgeStrip({ badges: [] }), null);
});

test('RuntimeIdxBadgeStrip shows chevron for expand/collapse', async () => {
  const { RuntimeIdxBadgeStrip } = await loadRuntimeIdxBadgeStripModule();

  const tree = RuntimeIdxBadgeStrip({
    badges: [
      { field_path: 'a', label: 'a', state: 'active', tooltip: 'tip' },
    ],
  });

  const nodes = flattenNodes(tree?.props?.children);

  // WHY: Chevron indicator present for expand/collapse
  assert.ok(findText(nodes, '\u25BC'), 'should show chevron');
});

test('RuntimeIdxBadgeStrip shows zero active when all badges are off', async () => {
  const { RuntimeIdxBadgeStrip } = await loadRuntimeIdxBadgeStripModule();

  const tree = RuntimeIdxBadgeStrip({
    badges: [
      { field_path: 'a', label: 'a', state: 'off', tooltip: 'tip' },
      { field_path: 'b', label: 'b', state: 'off', tooltip: 'tip' },
    ],
  });

  const nodes = flattenNodes(tree?.props?.children);

  // WHY: When no badges are active, the active count chip should not appear
  assert.ok(findText(nodes, '2'), 'should show total count');
  assert.ok(!findText(nodes, 'active'), 'should not show active count when none active');
});
