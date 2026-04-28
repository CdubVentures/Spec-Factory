import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadBundledModule } from '../../../../../../src/shared/tests/helpers/loadBundledModule.js';

function renderElement(element) {
  if (Array.isArray(element)) return element.map(renderElement);
  if (element == null || typeof element !== 'object') return element;
  if (typeof element.type === 'function') return renderElement(element.type(element.props || {}));
  const nextChildren = element.props && Object.prototype.hasOwnProperty.call(element.props, 'children')
    ? renderElement(element.props.children)
    : element.props?.children;
  return {
    ...element,
    props: {
      ...(element.props || {}),
      children: nextChildren,
    },
  };
}

function findAll(element, predicate) {
  const results = [];
  function visit(node) {
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    if (node == null || typeof node !== 'object') return;
    if (predicate(node)) results.push(node);
    visit(node.props?.children);
  }
  visit(element);
  return results;
}

function firstByRegion(tree, region) {
  return findAll(tree, (node) => node.props?.['data-region'] === region)[0] ?? null;
}

function classNameOf(node) {
  return String(node?.props?.className ?? '');
}

async function loadSkeletonModule() {
  return loadBundledModule('tools/gui-react/src/pages/layout/AppShellLoadingSkeleton.tsx', {
    prefix: 'app-shell-loading-skeleton-',
  });
}

describe('AppShellLoadingSkeleton', () => {
  it('fills the shell main content with a stable loaded-page placeholder', async () => {
    const { AppShellLoadingSkeleton } = await loadSkeletonModule();
    const tree = renderElement(AppShellLoadingSkeleton({}));

    assert.equal(findAll(tree, (node) => node.props?.['data-testid'] === 'app-shell-loading-skeleton').length, 1);
    assert.match(classNameOf(firstByRegion(tree, 'app-shell-loading-page')), /space-y-3/);
    assert.equal(findAll(tree, (node) => node.props?.['data-region'] === 'app-shell-loading-metric-card').length, 4);
    assert.match(classNameOf(firstByRegion(tree, 'app-shell-loading-toolbar')), /sf-surface-elevated rounded-lg border sf-border-default/);
    assert.match(classNameOf(firstByRegion(tree, 'app-shell-loading-table')), /sf-table-shell sf-primitive-table-shell overflow-auto max-h-\[calc\(100vh-340px\)\]/);
    assert.equal(findAll(tree, (node) => node.props?.['data-skeleton-row']).length, 8);
  });
});
