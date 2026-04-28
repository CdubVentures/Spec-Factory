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
  return loadBundledModule('tools/gui-react/src/features/color-registry/components/ColorRegistryPageSkeleton.tsx', {
    prefix: 'color-registry-page-skeleton-',
  });
}

describe('ColorRegistryPageSkeleton', () => {
  it('matches the loaded color registry header and matrix shell while colors load', async () => {
    const { ColorRegistryPageSkeleton } = await loadSkeletonModule();
    const tree = renderElement(ColorRegistryPageSkeleton({}));

    assert.equal(findAll(tree, (node) => node.props?.['data-testid'] === 'color-registry-loading-skeleton').length, 1);
    assert.match(classNameOf(firstByRegion(tree, 'color-registry-loading-page')), /p-6 max-w-7xl mx-auto/);
    assert.match(classNameOf(firstByRegion(tree, 'color-registry-loading-header')), /flex items-center gap-4 mb-4/);
    assert.match(classNameOf(firstByRegion(tree, 'color-registry-loading-search')), /max-w-xs text-sm/);
    assert.equal(findAll(tree, (node) => node.props?.['data-region'] === 'color-registry-loading-action').length, 2);
    assert.match(classNameOf(firstByRegion(tree, 'color-registry-loading-matrix')), /sf-surface-elevated rounded border sf-border-soft overflow-hidden/);
    assert.deepEqual(
      findAll(tree, (node) => node.props?.['data-skeleton-column']).map((node) => node.props['data-skeleton-column']),
      ['base', 'light', 'dark', 'muted'],
    );
    assert.equal(findAll(tree, (node) => node.props?.['data-skeleton-row']).length, 8);
    assert.equal(findAll(tree, (node) => node.props?.['data-region'] === 'color-registry-loading-color-card').length, 32);
  });
});
