import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

const STUBS = {
  react: `
    export function memo(component) { return component; }
    export function useState(initial) { return [typeof initial === 'function' ? initial() : initial, () => {}]; }
  `,
  'react/jsx-runtime': `
    export function jsx(type, props) { return { type, props: props || {} }; }
    export const jsxs = jsx;
    export const Fragment = Symbol.for('fragment');
  `,
  '../../../shared/ui/feedback/ActionTooltip.tsx': `
    export function ActionTooltip(props) { return { type: 'ActionTooltip', props: { ...props, children: props.children } }; }
  `,
  '../helpers/pifFormatUtils.ts': `
    export function formatBytes(value) { return String(value); }
    export function formatDims(width, height) { return width && height ? width + 'x' + height : ''; }
  `,
};

async function loadSlotCard() {
  return loadBundledModule(
    'tools/gui-react/src/features/product-image-finder/components/SlotCard.tsx',
    { prefix: 'slot-card-image-url-', stubs: STUBS },
  );
}

function renderNode(node) {
  if (Array.isArray(node)) return node.map(renderNode);
  if (node == null || typeof node !== 'object') return node;
  if (node.type === Symbol.for('fragment')) return renderNode(node.props?.children);
  if (typeof node.type === 'function') return renderNode(node.type(node.props || {}));
  const children = Object.prototype.hasOwnProperty.call(node.props || {}, 'children')
    ? renderNode(node.props.children)
    : node.props?.children;
  return { ...node, props: { ...(node.props || {}), children } };
}

function collectImages(node, results = []) {
  if (Array.isArray(node)) {
    for (const child of node) collectImages(child, results);
    return results;
  }
  if (node == null || typeof node !== 'object') return results;
  if (node.type === 'img') results.push(node);
  collectImages(node.props?.children, results);
  return results;
}

test('SlotCard thumbnail URL is cache-busted by image bytes', async () => {
  const { SlotCard } = await loadSlotCard();
  const tree = renderNode(SlotCard({
    slot: { slot: 'top', filename: 'top-black.png', source: 'user' },
    img: {
      filename: 'top-black.png',
      view: 'top',
      bytes: 12345,
      width: 1000,
      height: 700,
      bg_removed: true,
    },
    source: 'user',
    category: 'mouse',
    productId: 'p1',
    onClear: () => {},
    onDrop: () => {},
    onOpen: () => {},
  }));

  const [image] = collectImages(tree);
  assert.ok(image, 'SlotCard should render an image');
  assert.match(image.props.src, /variant=thumb/);
  assert.match(image.props.src, /v=12345/);
});
