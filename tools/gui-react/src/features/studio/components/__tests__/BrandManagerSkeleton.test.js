import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

function renderElement(element) {
  if (Array.isArray(element)) {
    return element.map(renderElement);
  }
  if (element == null || typeof element !== 'object') {
    return element;
  }
  if (typeof element.type === 'function') {
    return renderElement(element.type(element.props || {}));
  }
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
  return loadBundledModule('tools/gui-react/src/features/studio/components/BrandManagerSkeleton.tsx', {
    prefix: 'brand-manager-skeleton-',
  });
}

describe('BrandManagerSkeleton', () => {
  it('matches the closed brand registry page shape while brands load', async () => {
    const { BrandManagerSkeleton } = await loadSkeletonModule();
    const tree = renderElement(BrandManagerSkeleton({ drawerOpen: false }));

    assert.equal(findAll(tree, (node) => node.props?.['data-testid'] === 'brand-manager-loading-skeleton').length, 1);
    assert.match(classNameOf(findAll(tree, (node) => node.props?.['data-testid'] === 'brand-manager-loading-skeleton')[0]), /grid-cols-1/);
    assert.match(classNameOf(firstByRegion(tree, 'brand-manager-loading-header')), /sf-surface-card rounded border sf-border-default p-4/);
    assert.equal(findAll(tree, (node) => node.props?.['data-region'] === 'brand-manager-loading-action').length, 2);
    assert.match(classNameOf(firstByRegion(tree, 'brand-manager-loading-tabs')), /sf-tab-strip/);
    assert.match(classNameOf(firstByRegion(tree, 'brand-manager-loading-table-section')), /sf-surface-card rounded border sf-border-default p-4/);
    assert.match(classNameOf(firstByRegion(tree, 'brand-manager-loading-search')), /sf-table-search-input/);
    assert.match(classNameOf(firstByRegion(tree, 'brand-manager-loading-table')), /sf-primitive-table-shell/);
    assert.match(classNameOf(firstByRegion(tree, 'brand-manager-loading-table')), /max-h-\[calc\(100vh-280px\)\]/);

    assert.deepEqual(
      findAll(tree, (node) => node.props?.['data-skeleton-column']).map((node) => node.props['data-skeleton-column']),
      ['canonical_name', 'identifier', 'aliases', 'categories', 'website'],
    );
    assert.equal(findAll(tree, (node) => node.props?.['data-skeleton-row']).length, 8);
    assert.equal(findAll(tree, (node) => node.props?.['data-skeleton-cell']).length, 40);
    assert.equal(findAll(tree, (node) => node.props?.['data-region'] === 'brand-manager-loading-drawer').length, 0);
  });

  it('keeps the drawer column when the brand drawer was already open', async () => {
    const { BrandManagerSkeleton } = await loadSkeletonModule();
    const tree = renderElement(BrandManagerSkeleton({ drawerOpen: true }));

    assert.match(classNameOf(findAll(tree, (node) => node.props?.['data-testid'] === 'brand-manager-loading-skeleton')[0]), /grid-cols-\[1fr,400px\]/);
    assert.match(classNameOf(firstByRegion(tree, 'brand-manager-loading-drawer')), /sf-surface-card rounded border sf-border-default p-4/);
    assert.match(classNameOf(firstByRegion(tree, 'brand-manager-loading-drawer')), /sticky top-4/);
    assert.equal(findAll(tree, (node) => node.props?.['data-region'] === 'brand-manager-loading-drawer-field').length, 4);
    assert.equal(findAll(tree, (node) => node.props?.['data-region'] === 'brand-manager-loading-drawer-action').length, 2);
  });
});
