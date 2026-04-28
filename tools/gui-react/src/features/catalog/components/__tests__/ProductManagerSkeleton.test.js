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

async function loadSkeletonModule() {
  return loadBundledModule('tools/gui-react/src/features/catalog/components/ProductManagerSkeleton.tsx', {
    prefix: 'product-manager-skeleton-',
  });
}

describe('ProductManagerSkeleton', () => {
  it('renders the full closed catalog shape instead of a partial spinner', async () => {
    const { ProductManagerSkeleton } = await loadSkeletonModule();
    const tree = renderElement(ProductManagerSkeleton({ category: 'mouse', drawerOpen: false }));

    assert.equal(findAll(tree, (node) => node.props?.['data-region'] === 'catalog-loading-header').length, 1);
    assert.equal(findAll(tree, (node) => node.props?.['data-region'] === 'catalog-loading-table-search').length, 1);
    assert.equal(findAll(tree, (node) => node.props?.['data-region'] === 'catalog-loading-table').length, 1);
    assert.equal(findAll(tree, (node) => node.props?.['data-region'] === 'catalog-loading-action').length, 2);

    const headers = findAll(tree, (node) => node.props?.['data-skeleton-column']);
    assert.deepEqual(
      headers.map((node) => node.props['data-skeleton-column']),
      ['brand', 'model', 'base_model', 'variant', 'id', 'identifier', 'status'],
    );

    const rows = findAll(tree, (node) => node.props?.['data-skeleton-row']);
    assert.equal(rows.length, 10);

    const cells = findAll(tree, (node) => node.props?.['data-skeleton-cell']);
    assert.equal(cells.length, 70);
  });

  it('keeps the drawer column skeleton when the drawer was already open', async () => {
    const { ProductManagerSkeleton } = await loadSkeletonModule();
    const tree = renderElement(ProductManagerSkeleton({ category: 'mouse', drawerOpen: true }));

    assert.equal(findAll(tree, (node) => node.props?.['data-region'] === 'catalog-loading-drawer').length, 1);
    assert.equal(findAll(tree, (node) => node.props?.['data-region'] === 'catalog-loading-drawer-field').length, 4);
    assert.equal(findAll(tree, (node) => node.props?.['data-region'] === 'catalog-loading-drawer-action').length, 2);
  });
});
