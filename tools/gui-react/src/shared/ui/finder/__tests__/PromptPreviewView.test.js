import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

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

function textContent(node) {
  if (Array.isArray(node)) return node.map(textContent).join('');
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node !== 'object') return String(node);
  return textContent(node.props?.children);
}

async function loadPromptPreviewView() {
  return loadBundledModule(
    'tools/gui-react/src/shared/ui/finder/PromptPreviewView.tsx',
    {
      prefix: 'prompt-preview-view-',
      stubs: {
        'react/jsx-runtime': `
          export function jsx(type, props) { return { type, props: props || {} }; }
          export const jsxs = jsx;
          export const Fragment = Symbol.for('fragment');
        `,
        '../../../stores/collapseStore.ts': `
          export function usePersistedToggle() { return [true, () => {}]; }
        `,
        '../button/CopyButton.tsx': `
          export function CopyButton(props) { return { type: 'CopyButton', props }; }
        `,
      },
    },
  );
}

test('PromptPreviewView renders prompt images at the bottom when provided', async () => {
  const { PromptPreviewView } = await loadPromptPreviewView();
  const tree = renderNode(PromptPreviewView({
    storageKeyPrefix: 'key-preview',
    prompt: {
      label: 'design',
      system: 'system prompt',
      user: '{}',
      schema: {},
      model: { id: 'gpt-5.4', web_search: true, json_strict: true },
      notes: ['note'],
      images: [
        {
          url: '/api/v1/product-image-finder/mouse/p1/images/top.png?v=123',
          label: 'top view',
          caption: 'PIF top view for default/base variant',
        },
      ],
    },
  }));

  assert.ok(textContent(tree).includes('Prompt Images'));
  const images = collectNodes(tree, (node) => node.type === 'img');
  assert.equal(images.length, 1);
  assert.equal(images[0].props.src, '/api/v1/product-image-finder/mouse/p1/images/top.png?v=123');
  assert.equal(images[0].props.alt, 'PIF top view for default/base variant');

  const sectionLabels = collectNodes(tree, (node) => node.type === 'button')
    .map((node) => textContent(node).replace(/^[▾▸]\s*/, ''));
  assert.deepEqual(sectionLabels.slice(-2), ['Notes', 'Prompt Images']);
});

test('PromptPreviewView omits prompt images section when no images are provided', async () => {
  const { PromptPreviewView } = await loadPromptPreviewView();
  const tree = renderNode(PromptPreviewView({
    storageKeyPrefix: 'key-preview',
    prompt: {
      label: 'design',
      system: 'system prompt',
      user: '{}',
      schema: {},
      model: { id: 'gpt-5.4', web_search: true, json_strict: true },
      notes: [],
    },
  }));

  assert.equal(textContent(tree).includes('Prompt Images'), false);
  assert.equal(collectNodes(tree, (node) => node.type === 'img').length, 0);
});
