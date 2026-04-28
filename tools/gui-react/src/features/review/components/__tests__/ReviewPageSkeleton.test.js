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
  return loadBundledModule('tools/gui-react/src/features/review/components/ReviewPageSkeleton.tsx', {
    prefix: 'review-page-skeleton-',
  });
}

describe('ReviewPageSkeleton', () => {
  it('matches the loaded review dashboard, toolbar, and matrix shell while products load', async () => {
    const { ReviewPageSkeleton } = await loadSkeletonModule();
    const tree = renderElement(ReviewPageSkeleton({ drawerOpen: false }));

    assert.equal(findAll(tree, (node) => node.props?.['data-testid'] === 'review-page-loading-skeleton').length, 1);
    assert.match(classNameOf(firstByRegion(tree, 'review-loading-page')), /space-y-2/);
    assert.match(classNameOf(firstByRegion(tree, 'review-loading-dashboard')), /sf-review-dashboard-strip rounded-lg p-4 space-y-3/);
    assert.equal(findAll(tree, (node) => node.props?.['data-region'] === 'review-loading-kpi-card').length, 6);
    assert.match(classNameOf(firstByRegion(tree, 'review-loading-toolbar')), /sf-review-toolbar sf-review-brand-filter-bar flex items-center gap-1.5 py-1 px-1 rounded overflow-x-auto/);
    assert.match(classNameOf(firstByRegion(tree, 'review-loading-content-grid')), /grid grid-cols-1 gap-3/);
    assert.match(classNameOf(firstByRegion(tree, 'review-loading-matrix')), /sf-table-shell rounded-lg overflow-hidden/);
    assert.equal(findAll(tree, (node) => node.props?.['data-region'] === 'review-loading-product-header').length, 6);
    assert.equal(findAll(tree, (node) => node.props?.['data-region'] === 'review-loading-field-row').length, 10);
    assert.equal(findAll(tree, (node) => node.props?.['data-region'] === 'review-loading-cell').length, 60);
  });

  it('keeps the review drawer column when a drawer was already open', async () => {
    const { ReviewPageSkeleton } = await loadSkeletonModule();
    const tree = renderElement(ReviewPageSkeleton({ drawerOpen: true }));

    assert.match(classNameOf(firstByRegion(tree, 'review-loading-content-grid')), /grid-cols-\[1fr,420px\]/);
    assert.match(classNameOf(firstByRegion(tree, 'review-loading-drawer')), /sf-surface-elevated rounded-lg border sf-border-default/);
    assert.equal(findAll(tree, (node) => node.props?.['data-region'] === 'review-loading-drawer-section').length, 4);
  });
});
