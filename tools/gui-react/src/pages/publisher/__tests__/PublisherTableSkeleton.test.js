import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadBundledModule } from '../../../../../../src/shared/tests/helpers/loadBundledModule.js';

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
  return loadBundledModule('tools/gui-react/src/pages/publisher/PublisherTableSkeleton.tsx', {
    prefix: 'publisher-table-skeleton-',
  });
}

describe('PublisherTableSkeleton', () => {
  it('matches the loaded publisher DataTable and pagination shells while candidates load', async () => {
    const { PublisherTableSkeleton } = await loadSkeletonModule();
    const tree = renderElement(PublisherTableSkeleton());

    assert.equal(findAll(tree, (node) => node.props?.['data-testid'] === 'publisher-table-loading-skeleton').length, 1);
    assert.match(classNameOf(firstByRegion(tree, 'publisher-loading-table')), /sf-table-shell/);
    assert.match(classNameOf(firstByRegion(tree, 'publisher-loading-table')), /sf-primitive-table-shell/);
    assert.match(classNameOf(firstByRegion(tree, 'publisher-loading-table')), /max-h-\[calc\(100vh-400px\)\]/);

    assert.deepEqual(
      findAll(tree, (node) => node.props?.['data-skeleton-column']).map((node) => node.props['data-skeleton-column']),
      [
        'expand',
        'submitted_at',
        'brand',
        'model',
        'product_id',
        'field_key',
        'value',
        'status',
        'unknown_stripped',
        'published',
        'confidence',
        'source_type',
        'repairs',
        'evidence_accepted',
        'evidence_rejected',
      ],
    );

    assert.equal(findAll(tree, (node) => node.props?.['data-skeleton-row']).length, 10);
    assert.equal(findAll(tree, (node) => node.props?.['data-skeleton-cell']).length, 150);
    assert.match(classNameOf(firstByRegion(tree, 'publisher-loading-pagination')), /sf-surface-panel rounded border sf-border-default px-4 py-2.5/);
  });
});
