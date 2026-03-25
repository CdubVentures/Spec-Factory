import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from '../../../../../../src/shared/tests/helpers/loadBundledModule.js';
import { PAGE_REGISTRY_MODULE_STUBS } from '../../../registries/__tests__/pageRegistryModuleStubs.js';

function renderElement(node) {
  if (Array.isArray(node)) {
    return node.map(renderElement);
  }
  if (node == null || typeof node !== 'object') {
    return node;
  }
  if (typeof node.type === 'function') {
    return renderElement(node.type(node.props || {}));
  }
  const nextChildren = Object.prototype.hasOwnProperty.call(node.props || {}, 'children')
    ? renderElement(node.props.children)
    : node.props?.children;
  return {
    ...node,
    props: {
      ...(node.props || {}),
      children: nextChildren,
    },
  };
}

function collectTextTokens(node, acc = []) {
  if (Array.isArray(node)) {
    for (const child of node) collectTextTokens(child, acc);
    return acc;
  }
  if (node == null || typeof node === 'boolean') {
    return acc;
  }
  if (typeof node !== 'object') {
    const token = String(node).trim();
    if (token) acc.push(token);
    return acc;
  }
  collectTextTokens(node.props?.children, acc);
  return acc;
}

function collectNodes(node, predicate, acc = []) {
  if (Array.isArray(node)) {
    for (const child of node) collectNodes(child, predicate, acc);
    return acc;
  }
  if (node == null || typeof node !== 'object') {
    return acc;
  }
  if (predicate(node)) {
    acc.push(node);
  }
  collectNodes(node.props?.children, predicate, acc);
  return acc;
}

let tabNavModulePromise;

async function loadTabNavModule() {
  if (!tabNavModulePromise) {
    tabNavModulePromise = loadBundledModule('tools/gui-react/src/pages/layout/TabNav.tsx', {
    prefix: 'tab-nav-contract-',
    stubs: {
      ...PAGE_REGISTRY_MODULE_STUBS,
      'react/jsx-runtime': `
        export function jsx(type, props) {
          return { type, props: props || {} };
        }
        export const jsxs = jsx;
        export const Fragment = Symbol.for('fragment');
      `,
      'react-router-dom': `
        export function NavLink(props) {
          const harness = globalThis.__tabNavHarness || {};
          const currentPath = String(harness.currentPath || '/');
          const isActive = props.end ? currentPath === props.to : currentPath.startsWith(props.to);
          const className = typeof props.className === 'function'
            ? props.className({ isActive })
            : props.className;
          return {
            type: 'a',
            props: {
              ...props,
              className,
              href: props.to,
              children: props.children,
            },
          };
        }
      `,
      '../../stores/uiStore': `
        export function useUiStore(selector) {
          const harness = globalThis.__tabNavHarness || {};
          return selector({ category: harness.category || 'mouse' });
        }
      `,
      '../../utils/testMode': `
        export function isTestCategory(category) {
          const harness = globalThis.__tabNavHarness || {};
          return harness.isTestMode === true || String(category || '').startsWith('_test_');
        }
      `,
    },
    });
  }
  return tabNavModulePromise;
}

test('TabNav keeps overview/product and categories/catalog grouped in rendered order', async () => {
  globalThis.__tabNavHarness = { category: 'mouse', currentPath: '/' };
  const { TabNav } = await loadTabNavModule();
  const tree = renderElement(TabNav());
  const tokens = collectTextTokens(tree);

  const overviewIndex = tokens.indexOf('Overview');
  const selectedProductIndex = tokens.indexOf('Selected Product');
  const firstDividerAfterProduct = tokens.indexOf('|', selectedProductIndex + 1);
  const categoriesIndex = tokens.indexOf('Categories');
  const catalogIndex = tokens.indexOf('Catalog');
  const firstDividerAfterCatalog = tokens.indexOf('|', catalogIndex + 1);

  assert.notEqual(overviewIndex, -1);
  assert.notEqual(selectedProductIndex, -1);
  assert.notEqual(categoriesIndex, -1);
  assert.notEqual(catalogIndex, -1);

  assert.equal(overviewIndex < selectedProductIndex, true);
  assert.equal(selectedProductIndex < categoriesIndex, true);
  assert.equal(categoriesIndex < catalogIndex, true);
  assert.equal(firstDividerAfterProduct, selectedProductIndex + 1);
  assert.equal(firstDividerAfterCatalog, catalogIndex + 1);
});

test('TabNav renders the accent active state and shared bottom-border contract', async () => {
  globalThis.__tabNavHarness = { category: 'mouse', currentPath: '/' };
  const { TabNav } = await loadTabNavModule();
  const tree = renderElement(TabNav());

  assert.equal(String(tree?.props?.className || '').includes('border-b sf-border-default'), true);

  const anchors = collectNodes(tree, (node) => node.type === 'a');
  const overviewLink = anchors.find((node) => node.props?.children === 'Overview');
  const productLink = anchors.find((node) => node.props?.children === 'Selected Product');

  assert.equal(String(overviewLink?.props?.className || '').includes('border-accent text-accent'), true);
  assert.equal(String(productLink?.props?.className || '').includes('border-accent text-accent'), false);
});
