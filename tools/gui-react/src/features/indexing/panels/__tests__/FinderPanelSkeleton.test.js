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

function classNameOf(node) {
  return String(node?.props?.className ?? '');
}

async function loadSkeletonModule() {
  return loadBundledModule('tools/gui-react/src/features/indexing/panels/FinderPanelSkeleton.tsx', {
    prefix: 'finder-panel-skeleton-',
  });
}

describe('FinderPanelSkeleton', () => {
  it('uses finder panel chrome placeholders instead of a standalone spinner', async () => {
    const { FinderPanelSkeleton } = await loadSkeletonModule();
    const tree = renderElement(FinderPanelSkeleton({}));
    const root = findAll(tree, (node) => node.props?.['data-testid'] === 'finder-panel-skeleton')[0];

    assert.match(classNameOf(root), /rounded-lg border border-sf-border-subtle/);
    assert.equal(findAll(tree, (node) => node.props?.['data-region'] === 'finder-panel-skeleton-action').length, 2);
    assert.equal(findAll(tree, (node) => node.props?.['data-region'] === 'finder-panel-skeleton-body-line').length, 3);
  });
});
