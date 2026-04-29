import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadBundledModule } from '../../../../../../src/shared/tests/helpers/loadBundledModule.js';

function renderElement(element) {
  if (Array.isArray(element)) return element.map(renderElement);
  if (element == null || typeof element !== 'object') return element;
  if (typeof element.type === 'function') return renderElement(element.type(element.props || {}));
  return {
    ...element,
    props: {
      ...(element.props || {}),
      children: renderElement(element.props?.children),
    },
  };
}

function findAll(node, predicate) {
  if (Array.isArray(node)) return node.flatMap((child) => findAll(child, predicate));
  if (node == null || typeof node !== 'object') return [];
  const matches = predicate(node) ? [node] : [];
  return matches.concat(findAll(node.props?.children, predicate));
}

function componentItem() {
  return {
    component_identity_id: 42,
    name: 'PAW3950',
    maker: 'PixArt',
    linked_products: [{ product_id: 'mouse-a', field_key: 'sensor' }],
  };
}

async function loadActionDrawers() {
  return loadBundledModule('tools/gui-react/src/pages/component-review/ComponentReviewActionDrawers.tsx', {
    prefix: 'component-review-action-drawers-',
    stubs: {
      react: 'export default {};',
      'react/jsx-runtime': [
        'export const Fragment = Symbol.for("fragment");',
        'export function jsx(type, props) { return { type, props: props || {} }; }',
        'export const jsxs = jsx;',
      ].join('\n'),
      '../../shared/ui/finder/PromptDrawerChevron.tsx': [
        'export function PromptDrawerChevron(props) { return { type: "PromptDrawerChevron", props }; }',
      ].join('\n'),
      '../../shared/ui/actionButton/index.ts': [
        'export const ACTION_BUTTON_WIDTH = { keyRow: "w-20" };',
      ].join('\n'),
    },
  });
}

describe('ComponentReviewActionDrawers', () => {
  it('renders a row-scope right drawer with a prompted delete action', async () => {
    const { ComponentReviewRowActionDrawer } = await loadActionDrawers();
    const item = componentItem();
    let requested = null;
    const tree = renderElement(ComponentReviewRowActionDrawer({
      item,
      componentType: 'sensor',
      onRequestDelete: (target) => {
        requested = target;
      },
      deletePending: false,
    }));
    const drawer = findAll(tree, (node) => node.type === 'PromptDrawerChevron')[0];
    const action = drawer.props.actions[0];

    assert.equal(drawer.props.openTitle, undefined);
    assert.equal(drawer.props.openWidthClass, 'w-32');
    assert.equal(action.label, 'Delete');
    assert.equal(action.intent, 'delete');
    action.onClick();
    assert.equal(requested, item);
  });

  it('renders a header-scope right drawer with delete all action', async () => {
    const { ComponentReviewHeaderActionDrawer } = await loadActionDrawers();
    let requested = false;
    const tree = renderElement(ComponentReviewHeaderActionDrawer({
      componentType: 'sensor',
      rowCount: 3,
      onRequestDeleteAll: () => {
        requested = true;
      },
      deletePending: false,
    }));
    const drawer = findAll(tree, (node) => node.type === 'PromptDrawerChevron')[0];
    const action = drawer.props.actions[0];

    assert.equal(drawer.props.openTitle, undefined);
    assert.equal(drawer.props.openWidthClass, 'w-32');
    assert.equal(action.label, 'Delete All');
    assert.equal(action.intent, 'delete');
    action.onClick();
    assert.equal(requested, true);
  });
});
