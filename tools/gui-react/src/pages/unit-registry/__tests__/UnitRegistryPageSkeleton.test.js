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
  return loadBundledModule('tools/gui-react/src/pages/unit-registry/UnitRegistryPageSkeleton.tsx', {
    prefix: 'unit-registry-skeleton-',
  });
}

describe('UnitRegistryPageSkeleton', () => {
  it('matches the loaded registry page shells while units load', async () => {
    const { UnitRegistryPageSkeleton } = await loadSkeletonModule();
    const tree = renderElement(UnitRegistryPageSkeleton());

    assert.equal(findAll(tree, (node) => node.props?.['data-testid'] === 'unit-registry-loading-skeleton').length, 1);
    assert.match(classNameOf(findAll(tree, (node) => node.props?.['data-testid'] === 'unit-registry-loading-skeleton')[0]), /p-6/);
    assert.match(classNameOf(findAll(tree, (node) => node.props?.['data-testid'] === 'unit-registry-loading-skeleton')[0]), /max-w-6xl/);

    assert.match(classNameOf(firstByRegion(tree, 'unit-registry-loading-header')), /flex items-center justify-between mb-6/);
    assert.match(classNameOf(firstByRegion(tree, 'unit-registry-loading-search')), /sf-input rounded border px-3 py-2 text-sm sf-text-label w-64/);
    assert.match(classNameOf(firstByRegion(tree, 'unit-registry-loading-add-button')), /whitespace-nowrap/);

    assert.match(classNameOf(firstByRegion(tree, 'unit-registry-loading-table')), /sf-surface rounded-lg sf-border-soft border overflow-hidden/);
    assert.equal(findAll(tree, (node) => node.props?.['data-skeleton-column']).length, 5);
    assert.deepEqual(
      findAll(tree, (node) => node.props?.['data-skeleton-column']).map((node) => node.props['data-skeleton-column']),
      ['unit', 'label', 'synonyms', 'formulas', 'actions'],
    );
    assert.equal(findAll(tree, (node) => node.props?.['data-skeleton-group']).length, 3);
    assert.equal(findAll(tree, (node) => node.props?.['data-skeleton-row']).length, 9);
    assert.match(classNameOf(firstByRegion(tree, 'unit-registry-loading-footer')), /text-xs sf-text-muted mt-4/);
  });
});
