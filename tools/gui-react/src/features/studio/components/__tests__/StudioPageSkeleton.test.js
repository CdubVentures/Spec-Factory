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
  return loadBundledModule('tools/gui-react/src/features/studio/components/StudioPageSkeleton.tsx', {
    prefix: 'studio-page-skeleton-',
  });
}

describe('StudioPageSkeleton', () => {
  it('renders the loaded studio shell while studio data loads', async () => {
    const { StudioPageSkeleton } = await loadSkeletonModule();
    const tree = renderElement(StudioPageSkeleton({ category: 'mouse', activeTab: 'mapping' }));

    assert.equal(findAll(tree, (node) => node.props?.['data-testid'] === 'studio-page-loading-skeleton').length, 1);
    assert.match(classNameOf(firstByRegion(tree, 'studio-loading-metrics')), /grid grid-cols-4 gap-3/);
    assert.equal(findAll(tree, (node) => node.props?.['data-region'] === 'studio-loading-metric-card').length, 4);
    assert.match(classNameOf(firstByRegion(tree, 'studio-loading-actions')), /sf-surface-elevated rounded-lg border sf-border-default p-2/);
    assert.deepEqual(
      findAll(tree, (node) => node.props?.['data-skeleton-action']).map((node) => node.props['data-skeleton-action']),
      ['save', 'auto-save', 'compile', 'import', 'refresh'],
    );
    assert.match(classNameOf(firstByRegion(tree, 'studio-loading-tabs')), /flex border-b sf-border-default/);
    assert.deepEqual(
      findAll(tree, (node) => node.props?.['data-skeleton-tab']).map((node) => node.props['data-skeleton-tab']),
      ['mapping', 'keys', 'contract', 'reports', 'docs'],
    );
  });

  it('keeps the mapping tab panel shape by default', async () => {
    const { StudioPageSkeleton } = await loadSkeletonModule();
    const tree = renderElement(StudioPageSkeleton({ category: 'mouse', activeTab: 'mapping' }));

    assert.match(classNameOf(firstByRegion(tree, 'studio-loading-mapping-panel')), /space-y-6/);
    assert.match(classNameOf(firstByRegion(tree, 'studio-loading-mapping-header')), /flex items-start justify-between gap-3/);
    assert.equal(findAll(tree, (node) => node.props?.['data-region'] === 'studio-loading-mapping-section').length, 3);
    assert.equal(findAll(tree, (node) => node.props?.['data-region'] === 'studio-loading-component-source-row').length, 3);
    assert.equal(findAll(tree, (node) => node.props?.['data-region'] === 'studio-loading-enum-row').length, 4);
  });

  it('keeps the key navigator tab panel shape when that tab is active', async () => {
    const { StudioPageSkeleton } = await loadSkeletonModule();
    const tree = renderElement(StudioPageSkeleton({ category: 'mouse', activeTab: 'keys' }));

    assert.match(classNameOf(firstByRegion(tree, 'studio-loading-keys-panel')), /flex gap-4 min-h-\[calc\(100vh-350px\)\]/);
    assert.equal(findAll(tree, (node) => node.props?.['data-region'] === 'studio-loading-key-list-row').length, 12);
    assert.equal(findAll(tree, (node) => node.props?.['data-region'] === 'studio-loading-key-detail-section').length, 8);
  });

  it('keeps the contract workbench tab panel shape when that tab is active', async () => {
    const { StudioPageSkeleton } = await loadSkeletonModule();
    const tree = renderElement(StudioPageSkeleton({ category: 'mouse', activeTab: 'contract' }));

    assert.match(classNameOf(firstByRegion(tree, 'studio-loading-contract-panel')), /grid grid-cols-1 gap-3 sf-text-primary sf-border-default sf-border-soft/);
    assert.match(classNameOf(firstByRegion(tree, 'studio-loading-contract-card')), /overflow-hidden sf-surface-card sf-bg-surface-soft/);
    assert.equal(findAll(tree, (node) => node.props?.['data-region'] === 'studio-loading-contract-preset').length, 12);
    assert.deepEqual(
      findAll(tree, (node) => node.props?.['data-skeleton-column']).map((node) => node.props['data-skeleton-column']),
      ['key', 'label', 'group', 'type', 'source', 'priority', 'evidence', 'tooltip'],
    );
    assert.equal(findAll(tree, (node) => node.props?.['data-skeleton-row']).length, 10);
  });

  it('keeps the compile reports tab panel shape when that tab is active', async () => {
    const { StudioPageSkeleton } = await loadSkeletonModule();
    const tree = renderElement(StudioPageSkeleton({ category: 'mouse', activeTab: 'reports' }));

    assert.match(classNameOf(firstByRegion(tree, 'studio-loading-reports-panel')), /space-y-4/);
    assert.match(classNameOf(firstByRegion(tree, 'studio-loading-report-actions')), /flex items-center gap-3 overflow-x-auto pb-1/);
    assert.equal(findAll(tree, (node) => node.props?.['data-region'] === 'studio-loading-report-action').length, 6);
    assert.equal(findAll(tree, (node) => node.props?.['data-region'] === 'studio-loading-report-section').length, 2);
  });
});
