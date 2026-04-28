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
  return loadBundledModule('tools/gui-react/src/shared/ui/finder/FinderContentLoadingSkeleton.tsx', {
    prefix: 'finder-content-loading-skeleton-',
  });
}

describe('FinderContentLoadingSkeleton', () => {
  it('matches the loaded finder body geometry used by CEF, PIF, and scalar panels', async () => {
    const { FinderContentLoadingSkeleton } = await loadSkeletonModule();
    const tree = renderElement(FinderContentLoadingSkeleton({ sections: 2, rowsPerSection: 3 }));

    assert.equal(findAll(tree, (node) => node.props?.['data-testid'] === 'finder-content-loading-skeleton').length, 1);
    assert.match(classNameOf(firstByRegion(tree, 'finder-content-loading-body')), /px-6 pb-6 pt-4 space-y-5/);
    assert.equal(findAll(tree, (node) => node.props?.['data-region'] === 'finder-content-loading-kpi-card').length, 4);
    assert.match(classNameOf(firstByRegion(tree, 'finder-content-loading-how-it-works')), /sf-surface-elevated border sf-border-soft rounded-lg/);
    assert.equal(findAll(tree, (node) => node.props?.['data-region'] === 'finder-content-loading-section').length, 2);
    assert.equal(findAll(tree, (node) => node.props?.['data-region'] === 'finder-content-loading-row').length, 6);
  });
});
