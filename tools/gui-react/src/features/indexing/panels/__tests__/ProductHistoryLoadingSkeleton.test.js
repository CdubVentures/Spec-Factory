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
  return loadBundledModule('tools/gui-react/src/features/indexing/panels/ProductHistoryLoadingSkeleton.tsx', {
    prefix: 'product-history-loading-skeleton-',
  });
}

describe('ProductHistoryLoadingSkeleton', () => {
  it('keeps the six-card KPI strip shape while history metrics load', async () => {
    const { ProductHistoryKpiLoadingSkeleton } = await loadSkeletonModule();
    const tree = renderElement(ProductHistoryKpiLoadingSkeleton({}));

    assert.equal(findAll(tree, (node) => node.props?.['data-testid'] === 'product-history-kpi-loading-skeleton').length, 1);
    assert.match(classNameOf(firstByRegion(tree, 'product-history-loading-kpi-grid')), /grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4/);
    assert.equal(findAll(tree, (node) => node.props?.['data-region'] === 'product-history-loading-kpi-card').length, 6);
  });

  it('keeps the run selector and analysis card stack while run history loads', async () => {
    const { ProductHistoryPanelLoadingSkeleton } = await loadSkeletonModule();
    const tree = renderElement(ProductHistoryPanelLoadingSkeleton({}));

    assert.equal(findAll(tree, (node) => node.props?.['data-testid'] === 'product-history-panel-loading-skeleton').length, 1);
    assert.match(classNameOf(firstByRegion(tree, 'product-history-loading-body')), /px-6 pb-6 pt-4 space-y-5 flex-1 min-h-0 overflow-y-auto/);
    assert.equal(findAll(tree, (node) => node.props?.['data-region'] === 'product-history-loading-run-pill').length, 4);
    assert.equal(findAll(tree, (node) => node.props?.['data-region'] === 'product-history-loading-analysis-card').length, 3);
  });
});
