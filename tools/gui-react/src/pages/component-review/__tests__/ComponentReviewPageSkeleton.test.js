import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadBundledModule } from '../../../../../../src/shared/tests/helpers/loadBundledModule.js';

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

function textContent(node) {
  if (Array.isArray(node)) return node.map(textContent).join(' ');
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (typeof node !== 'object') return '';
  return textContent(node.props?.children);
}

async function loadSkeletonModule() {
  return loadBundledModule('tools/gui-react/src/pages/component-review/ComponentReviewPageSkeleton.tsx', {
    prefix: 'component-review-page-skeleton-',
  });
}

describe('ComponentReviewPageSkeleton', () => {
  it('matches the component review page shell while layout loads', async () => {
    const { ComponentReviewPageSkeleton } = await loadSkeletonModule();
    const tree = renderElement(ComponentReviewPageSkeleton({ category: 'mouse' }));

    assert.equal(findAll(tree, (node) => node.props?.['data-testid'] === 'component-review-loading-skeleton').length, 1);
    assert.match(classNameOf(firstByRegion(tree, 'component-review-loading-page')), /space-y-3/);
    assert.match(classNameOf(firstByRegion(tree, 'component-review-loading-metrics')), /grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3/);
    assert.equal(findAll(tree, (node) => node.props?.['data-region'] === 'component-review-loading-metric-card').length, 1);
    assert.match(classNameOf(firstByRegion(tree, 'component-review-loading-tabs')), /flex gap-1 overflow-x-auto/);
    assert.equal(findAll(tree, (node) => node.props?.['data-region'] === 'component-review-loading-tab').length, 5);
  });

  it('matches the component table content shape while a component tab loads', async () => {
    const { ComponentReviewContentSkeleton } = await loadSkeletonModule();
    const tree = renderElement(ComponentReviewContentSkeleton({ mode: 'components' }));

    assert.match(classNameOf(firstByRegion(tree, 'component-review-loading-component-grid')), /grid grid-cols-1 gap-3 min-w-0/);
    assert.match(classNameOf(firstByRegion(tree, 'component-review-loading-table')), /sf-table-shell sf-primitive-table-shell overflow-auto max-h-\[calc\(100vh-280px\)\]/);
    assert.deepEqual(
      findAll(tree, (node) => node.props?.['data-skeleton-column']).map((node) => node.props['data-skeleton-column']),
      ['name', 'maker', 'aliases', 'links'],
    );
    assert.equal(findAll(tree, (node) => node.props?.['data-skeleton-row']).length, 8);
  });

  it('matches the enum review content shape while the enum tab loads', async () => {
    const { ComponentReviewContentSkeleton } = await loadSkeletonModule();
    const tree = renderElement(ComponentReviewContentSkeleton({ mode: 'enums' }));

    assert.match(classNameOf(firstByRegion(tree, 'component-review-loading-enum-grid')), /grid grid-cols-\[220px,1fr\] gap-3/);
    assert.match(classNameOf(firstByRegion(tree, 'component-review-loading-enum-fields')), /border sf-border-default rounded-lg overflow-y-auto max-h-\[calc\(100vh-320px\)\]/);
    assert.match(classNameOf(firstByRegion(tree, 'component-review-loading-enum-values')), /border sf-border-default rounded-lg overflow-y-auto max-h-\[calc\(100vh-320px\)\] min-w-0/);
    assert.equal(findAll(tree, (node) => node.props?.['data-region'] === 'component-review-loading-enum-field').length, 8);
    assert.equal(findAll(tree, (node) => node.props?.['data-region'] === 'component-review-loading-enum-value').length, 10);
    assert.doesNotMatch(textContent(tree), /Run AI/i);
    assert.doesNotMatch(textContent(tree), /Add new value/i);
  });
});
