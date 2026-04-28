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
  return loadBundledModule('tools/gui-react/src/features/runtime-ops/components/RuntimeOpsLoadingSkeleton.tsx', {
    prefix: 'runtime-ops-loading-skeleton-',
  });
}

describe('RuntimeOpsLoadingSkeleton', () => {
  it('matches the loaded runtime ops overview content shape while runs load', async () => {
    const { RuntimeOpsLoadingSkeleton } = await loadSkeletonModule();
    const tree = renderElement(RuntimeOpsLoadingSkeleton({}));

    assert.equal(findAll(tree, (node) => node.props?.['data-testid'] === 'runtime-ops-loading-skeleton').length, 1);
    assert.match(classNameOf(firstByRegion(tree, 'runtime-ops-loading-overview')), /flex-1 overflow-y-auto p-5 space-y-5/);
    assert.equal(findAll(tree, (node) => node.props?.['data-region'] === 'runtime-ops-loading-kpi-card').length, 6);
    assert.equal(findAll(tree, (node) => node.props?.['data-region'] === 'runtime-ops-loading-flow-step').length, 5);
    assert.match(classNameOf(firstByRegion(tree, 'runtime-ops-loading-throughput')), /lg:col-span-2 sf-surface-card rounded-lg p-4/);
    assert.equal(findAll(tree, (node) => node.props?.['data-region'] === 'runtime-ops-loading-lower-card').length, 2);
  });
});
