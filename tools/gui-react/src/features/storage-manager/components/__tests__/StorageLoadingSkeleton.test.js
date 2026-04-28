import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

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
  return loadBundledModule('tools/gui-react/src/features/storage-manager/components/StorageLoadingSkeleton.tsx', {
    prefix: 'storage-loading-skeleton-',
  });
}

describe('StorageLoadingSkeleton', () => {
  it('matches the loaded storage overview shell while runs load', async () => {
    const { StorageOverviewSkeleton } = await loadSkeletonModule();
    const tree = renderElement(StorageOverviewSkeleton());

    assert.equal(findAll(tree, (node) => node.props?.['data-testid'] === 'storage-overview-loading-skeleton').length, 1);
    assert.match(classNameOf(findAll(tree, (node) => node.props?.['data-testid'] === 'storage-overview-loading-skeleton')[0]), /space-y-3/);
    assert.equal(findAll(tree, (node) => node.props?.['data-region'] === 'storage-overview-loading-kpi').length, 4);
    for (const kpi of findAll(tree, (node) => node.props?.['data-region'] === 'storage-overview-loading-kpi')) {
      assert.match(classNameOf(kpi), /sf-surface-card rounded-lg overflow-hidden/);
    }
    assert.match(classNameOf(firstByRegion(tree, 'storage-overview-loading-breakdown')), /sf-surface-card rounded-lg p-4 flex flex-col gap-3/);
    assert.match(classNameOf(firstByRegion(tree, 'storage-overview-loading-status')), /sf-surface-card rounded-lg p-4 flex flex-col gap-3/);
  });

  it('matches the loaded storage product table shell while inventory loads', async () => {
    const { StorageProductTableSkeleton } = await loadSkeletonModule();
    const tree = renderElement(StorageProductTableSkeleton());

    assert.equal(findAll(tree, (node) => node.props?.['data-testid'] === 'storage-product-table-loading-skeleton').length, 1);
    assert.match(classNameOf(firstByRegion(tree, 'storage-product-loading-search')), /sf-table-search-input/);
    assert.match(classNameOf(firstByRegion(tree, 'storage-product-loading-brand-filter')), /sf-input text-xs rounded px-3 py-1.5/);
    assert.match(classNameOf(firstByRegion(tree, 'storage-product-loading-table')), /sf-table-shell/);
    assert.match(classNameOf(firstByRegion(tree, 'storage-product-loading-table')), /max-h-\[calc\(100vh-280px\)\]/);
    assert.deepEqual(
      findAll(tree, (node) => node.props?.['data-skeleton-column']).map((node) => node.props['data-skeleton-column']),
      ['expand', 'product', 'runs', 'size', 'actions'],
    );
    assert.equal(findAll(tree, (node) => node.props?.['data-skeleton-row']).length, 8);
    assert.equal(findAll(tree, (node) => node.props?.['data-skeleton-cell']).length, 40);
  });
});
