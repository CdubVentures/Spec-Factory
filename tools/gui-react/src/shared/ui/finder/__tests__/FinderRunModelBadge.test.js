import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

async function loadBadge() {
  return loadBundledModule(
    'tools/gui-react/src/shared/ui/finder/FinderRunModelBadge.tsx',
    {
      prefix: 'finder-run-model-badge-',
      stubs: {
        react: 'export function memo(component) { return component; }',
        'react/jsx-runtime': `
          export function jsx(type, props) { return { type, props: props || {} }; }
          export const jsxs = jsx;
          export const Fragment = Symbol.for('fragment');
        `,
      },
    },
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

function flattenText(node) {
  if (Array.isArray(node)) return node.map(flattenText).join('');
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (typeof node !== 'object') return '';
  return flattenText(node.props?.children);
}

test('FinderRunModelBadge can show access mode text for command-console badges', async () => {
  const { FinderRunModelBadge } = await loadBadge();
  const labTree = renderNode(FinderRunModelBadge({
    model: 'lab-openai:gpt-5.4',
    accessMode: 'lab',
    showAccessModeText: true,
  }));
  const apiTree = renderNode(FinderRunModelBadge({
    model: 'default-openai:gpt-5.4',
    accessMode: 'api',
    showAccessModeText: true,
  }));

  assert.match(flattenText(labTree), /LAB/);
  assert.match(flattenText(apiTree), /API/);
});
