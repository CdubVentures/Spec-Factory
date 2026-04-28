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

async function loadPromptPreviewModule() {
  return loadBundledModule('tools/gui-react/src/shared/ui/finder/PromptPreviewModal.tsx', {
    prefix: 'prompt-preview-loading-skeleton-',
  });
}

describe('PromptPreviewLoadingSkeleton', () => {
  it('matches the prompt preview card body instead of centering a spinner', async () => {
    const { PromptPreviewLoadingSkeleton } = await loadPromptPreviewModule();
    const tree = renderElement(PromptPreviewLoadingSkeleton({}));

    assert.equal(findAll(tree, (node) => node.props?.['data-testid'] === 'prompt-preview-loading-skeleton').length, 1);
    assert.match(classNameOf(firstByRegion(tree, 'prompt-preview-loading-shell')), /space-y-3/);
    assert.equal(findAll(tree, (node) => node.props?.['data-region'] === 'prompt-preview-loading-section').length, 3);
    assert.equal(findAll(tree, (node) => node.props?.['data-region'] === 'prompt-preview-loading-line').length, 9);
  });
});
