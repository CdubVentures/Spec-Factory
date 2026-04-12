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
      '@tanstack/react-query': `
        export function useQuery() {
          return { data: undefined, isLoading: false, isFetching: false };
        }
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
              ...(isActive ? { 'aria-current': 'page' } : {}),
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
      '../../hooks/useSerperCreditQuery.ts': `
        export function useSerperCreditQuery() {
          return { data: undefined, isLoading: false, isFetching: false };
        }
        export function creditChipClass() { return ''; }
        export function formatCredit() { return ''; }
      `,
      '../../hooks/llmKeyGateHelpers.js': `
        export function hasLlmKeyGateErrors() { return false; }
        export function deriveSerperKeyGateError() { return null; }
      `,
      '../../api/client.ts': `
        export const api = { get: async () => ({}) };
      `,
      '../../shared/ui/feedback/Chip.tsx': `
        export function Chip(props) {
          return { type: 'span', props: { className: props.className, children: props.label } };
        }
      `,
    },
    });
  }
  return tabNavModulePromise;
}

test('TabNav exposes the active route through link semantics instead of relying on visual-only state', async () => {
  globalThis.__tabNavHarness = { category: 'mouse', currentPath: '/' };
  const { TabNav } = await loadTabNavModule();
  const tree = renderElement(TabNav());

  const anchors = collectNodes(tree, (node) => node.type === 'a');
  const overviewLink = anchors.find((node) => node.props?.children === 'Overview');

  assert.ok(overviewLink, 'expected Overview nav link');
  assert.equal(overviewLink?.props?.href, '/');
  assert.equal(overviewLink?.props?.['aria-current'], 'page');
});

test('TabNav renders Categories, Brands, and Billing as navigable links in the global group', async () => {
  globalThis.__tabNavHarness = { category: 'mouse', currentPath: '/categories' };
  const { TabNav } = await loadTabNavModule();
  const tree = renderElement(TabNav());

  const anchors = collectNodes(tree, (node) => node.type === 'a');
  const categoriesLink = anchors.find((node) => node.props?.children === 'Categories');
  const brandsLink = anchors.find((node) => node.props?.children === 'Brands');
  const billingLink = anchors.find((node) => node.props?.children === 'Billing');

  assert.ok(categoriesLink, 'expected Categories nav link in global group');
  assert.equal(categoriesLink?.props?.href, '/categories');
  assert.ok(brandsLink, 'expected Brands nav link in global group');
  assert.equal(brandsLink?.props?.href, '/brands');
  assert.ok(billingLink, 'expected Billing nav link in global group');
  assert.equal(billingLink?.props?.href, '/billing');
});
