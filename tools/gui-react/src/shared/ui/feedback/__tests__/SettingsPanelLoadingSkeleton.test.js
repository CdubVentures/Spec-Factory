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
  return loadBundledModule('tools/gui-react/src/shared/ui/feedback/SettingsPanelLoadingSkeleton.tsx', {
    prefix: 'settings-panel-loading-skeleton-',
  });
}

describe('SettingsPanelLoadingSkeleton', () => {
  it('matches the SidebarShell child panel and SettingGroupBlock row geometry', async () => {
    const { SettingsPanelLoadingSkeleton } = await loadSkeletonModule();
    const tree = renderElement(SettingsPanelLoadingSkeleton({ groups: 3, rowsPerGroup: 4 }));

    assert.equal(findAll(tree, (node) => node.props?.['data-testid'] === 'settings-panel-loading-skeleton').length, 1);
    assert.match(classNameOf(firstByRegion(tree, 'settings-loading-panel')), /space-y-4/);
    assert.equal(findAll(tree, (node) => node.props?.['data-region'] === 'settings-loading-group').length, 3);
    assert.match(classNameOf(firstByRegion(tree, 'settings-loading-group')), /rounded border px-3 py-2.5 space-y-2.5/);
    assert.equal(findAll(tree, (node) => node.props?.['data-region'] === 'settings-loading-row').length, 12);
    assert.match(classNameOf(firstByRegion(tree, 'settings-loading-row')), /grid grid-cols-1 gap-2.5 md:grid-cols-\[minmax\(0,1fr\)_minmax\(220px,300px\)\] md:items-center/);
  });
});
