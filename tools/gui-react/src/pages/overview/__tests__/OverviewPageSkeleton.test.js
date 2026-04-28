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

async function loadSkeletonModule() {
  return loadBundledModule('tools/gui-react/src/pages/overview/OverviewPageSkeleton.tsx', {
    prefix: 'overview-page-skeleton-',
  });
}

describe('OverviewPageSkeleton', () => {
  it('renders the full overview dashboard shape while catalog data loads', async () => {
    const { OverviewPageSkeleton } = await loadSkeletonModule();
    const tree = renderElement(OverviewPageSkeleton({ category: 'mouse' }));

    assert.equal(findAll(tree, (node) => node.props?.['data-testid'] === 'overview-loading-skeleton').length, 1);
    assert.equal(findAll(tree, (node) => node.props?.['data-region'] === 'overview-loading-metrics').length, 1);
    assert.equal(findAll(tree, (node) => node.props?.['data-region'] === 'overview-loading-metric').length, 3);
    assert.equal(findAll(tree, (node) => node.props?.['data-region'] === 'overview-loading-command-console').length, 1);
    assert.equal(findAll(tree, (node) => node.props?.['data-region'] === 'overview-loading-active-row').length, 1);
    assert.equal(findAll(tree, (node) => node.props?.['data-region'] === 'overview-loading-filter-row').length, 1);
    assert.equal(findAll(tree, (node) => node.props?.['data-region'] === 'overview-loading-table').length, 1);

    for (const metric of findAll(tree, (node) => node.props?.['data-region'] === 'overview-loading-metric')) {
      assert.match(classNameOf(metric), /sf-surface-card/);
      assert.match(classNameOf(metric), /rounded-lg/);
      assert.match(classNameOf(metric), /shadow-sm/);
    }

    assert.match(classNameOf(firstByRegion(tree, 'overview-loading-command-console')), /sf-cc-panel/);
    assert.equal(findAll(tree, (node) => classNameOf(node).includes('sf-cc-row-header')).length, 1);
    assert.equal(findAll(tree, (node) => classNameOf(node).includes('sf-cc-chips-row')).length, 1);
    assert.equal(findAll(tree, (node) => classNameOf(node).includes('sf-cc-models-row')).length, 1);
    assert.equal(findAll(tree, (node) => classNameOf(node).includes('sf-cc-pipeline-row')).length, 1);

    assert.match(classNameOf(firstByRegion(tree, 'overview-loading-active-row')), /sf-aas-row/);
    assert.match(classNameOf(firstByRegion(tree, 'overview-loading-filter-row')), /sf-surface-alt/);
    assert.match(classNameOf(firstByRegion(tree, 'overview-loading-filter-row')), /rounded-lg/);
    assert.match(classNameOf(firstByRegion(tree, 'overview-loading-table')), /sf-primitive-table-shell/);
    assert.match(classNameOf(firstByRegion(tree, 'overview-loading-table')), /max-h-\[calc\(100vh-340px\)\]/);

    const headers = findAll(tree, (node) => node.props?.['data-skeleton-column']);
    assert.deepEqual(
      headers.map((node) => node.props['data-skeleton-column']),
      [
        'select',
        'brand',
        'base_model',
        'variant',
        'family',
        'cef',
        'pif',
        'rdf',
        'sku',
        'key',
        'score',
        'coverage',
        'confidence',
        'fields',
        'live',
        'lastRun',
      ],
    );

    const rows = findAll(tree, (node) => node.props?.['data-skeleton-row']);
    assert.equal(rows.length, 8);

    const cells = findAll(tree, (node) => node.props?.['data-skeleton-cell']);
    assert.equal(cells.length, 128);

    const busyRegions = findAll(tree, (node) => node.props?.['aria-busy'] === 'true');
    assert.equal(busyRegions.length, 1);
  });
});
