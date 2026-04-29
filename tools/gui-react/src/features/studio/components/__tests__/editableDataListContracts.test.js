import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

function renderNode(node) {
  if (Array.isArray(node)) return node.map(renderNode);
  if (node == null || typeof node !== 'object') return node;
  if (node.type === Symbol.for('fragment')) return renderNode(node.props?.children);
  if (typeof node.type === 'function') return renderNode(node.type(node.props || {}));
  const children = Object.prototype.hasOwnProperty.call(node.props || {}, 'children')
    ? renderNode(node.props.children)
    : node.props?.children;
  return {
    ...node,
    props: {
      ...(node.props || {}),
      children,
    },
  };
}

function collectNodes(node, predicate, results = []) {
  if (Array.isArray(node)) {
    for (const child of node) collectNodes(child, predicate, results);
    return results;
  }
  if (node == null || typeof node !== 'object') return results;
  if (predicate(node)) results.push(node);
  collectNodes(node.props?.children, predicate, results);
  return results;
}

function textOf(node) {
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (node == null) return '';
  if (typeof node !== 'object') return String(node);
  return textOf(node.props?.children);
}

const JSX_STUB = `
  export function jsx(type, props) {
    return { type, props: props || {} };
  }
  export const jsxs = jsx;
  export const Fragment = Symbol.for('fragment');
`;

test('EditableDataList renders enum identity as label, key, and source metadata only', async () => {
  const { EditableDataList } = await loadBundledModule(
    'tools/gui-react/src/features/studio/components/EditableDataList.tsx',
    {
      prefix: 'editable-data-list-contracts-',
      stubs: {
        react: `
          export function useState(initialValue) {
            return [initialValue, () => {}];
          }
        `,
        'react/jsx-runtime': JSX_STUB,
        '../../../stores/collapseStore.ts': `
          export function usePersistedToggle() {
            return [true, () => {}, () => {}];
          }
        `,
        '../../../shared/ui/feedback/Tip.tsx': `
          export function Tip(props) {
            return { type: 'Tip', props };
          }
        `,
        '../../../shared/ui/forms/TagPicker.tsx': `
          export function TagPicker(props) {
            return { type: 'TagPicker', props };
          }
        `,
        '../state/studioDisplayLabel.ts': `
          export function displayLabel(value) {
            return String(value || '').replaceAll('_', ' ').replace(/\\b\\w/g, (m) => m.toUpperCase());
          }
        `,
        '../state/numericInputHelpers.ts': `
          export function parseBoundedIntInput(value) {
            return Number.parseInt(value, 10);
          }
        `,
        '../state/studioNumericKnobBounds.ts': `
          export const STUDIO_NUMERIC_KNOB_BOUNDS = {};
        `,
        './studioConstants.ts': `
          export const labelCls = 'label';
          export const STUDIO_TIPS = {
            data_list_field: 'field',
            data_list_manual_values: 'values',
          };
        `,
        './studioSharedTypes.ts': `
          export const btnDanger = 'danger';
        `,
      },
    },
  );

  const tree = renderNode(
    EditableDataList({
      entry: {
        field: 'form_factor',
        label: 'Form Factor',
        delimiter: '',
        manual_values: ['ambidextrous'],
      },
      index: 0,
      isDuplicate: false,
      onUpdate() {},
      onRemove() {},
    }),
  );

  const fieldInputs = collectNodes(
    tree,
    (node) => node.type === 'input' && node.props?.value === 'form_factor',
  );
  const inputLikeFieldDisplays = collectNodes(
    tree,
    (node) =>
      typeof node.props?.className === 'string' &&
      node.props.className.includes('input') &&
      textOf(node).includes('form_factor'),
  );
  const removeButtons = collectNodes(
    tree,
    (node) => node.type === 'button' && String(node.props?.children || '').includes('Remove'),
  );
  const sourceDisplays = collectNodes(
    tree,
    (node) => textOf(node).includes('data_lists.form_factor'),
  );
  const keyDisplays = collectNodes(
    tree,
    (node) => textOf(node).includes('Key') && textOf(node).includes('form_factor'),
  );
  const normalizeControls = collectNodes(
    tree,
    (node) => node.type === 'select' || textOf(node).includes('Normalize'),
  );

  assert.equal(fieldInputs.length, 0);
  assert.equal(inputLikeFieldDisplays.length, 0);
  assert.equal(removeButtons.length, 0);
  assert.equal(normalizeControls.length, 0);
  assert.equal(textOf(tree).includes('Field Name'), false);
  assert.equal(textOf(tree).includes('Extraction Guidance'), false);
  assert.equal(textOf(tree).includes('sent to LLM'), false);
  assert.equal(textOf(tree).includes('AI Review Priority'), false);
  assert.equal(textOf(tree).includes('Form Factor'), true);
  assert.equal(keyDisplays.length > 0, true);
  assert.equal(sourceDisplays.length > 0, true);
});
