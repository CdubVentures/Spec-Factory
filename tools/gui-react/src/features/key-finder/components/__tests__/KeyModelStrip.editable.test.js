import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

const STUBS = {
  react: 'export function memo(component) { return component; }',
  'react/jsx-runtime': `
    export function jsx(type, props) { return { type, props: props || {} }; }
    export const jsxs = jsx;
    export const Fragment = Symbol.for('fragment');
  `,
  '../../../shared/ui/finder/FinderRunModelBadge.tsx': `
    export function FinderRunModelBadge(props) {
      return { type: 'FinderRunModelBadge', props };
    }
  `,
  '../../../shared/ui/finder/FinderModelPickerPopover.tsx': `
    export function FinderModelPickerPopover(props) {
      return { type: 'FinderModelPickerPopover', props };
    }
  `,
  '../hooks/useKeyDifficultyModelMap.ts': `
    export function useKeyDifficultyModelMap() {
      return {
        easy: { model: 'easy-model', accessMode: 'api', thinking: false, webSearch: false, effortLevel: '' },
        medium: { model: 'medium-model', accessMode: 'lab', thinking: true, webSearch: false, effortLevel: 'high' },
        hard: { model: 'hard-model', accessMode: 'lab', thinking: true, webSearch: true, effortLevel: 'xhigh' },
        very_hard: { model: 'very-hard-model', accessMode: 'api', thinking: false, webSearch: true, effortLevel: '' },
      };
    }
  `,
};

async function loadModule() {
  return loadBundledModule(
    'tools/gui-react/src/features/key-finder/components/KeyModelStrip.tsx',
    { prefix: 'key-model-strip-editable-', stubs: STUBS },
  );
}

function renderNode(node) {
  if (Array.isArray(node)) return node.map(renderNode);
  if (node == null || typeof node !== 'object') return node;
  if (node.type === Symbol.for('fragment')) return renderNode(node.props?.children);
  if (typeof node.type === 'function') return renderNode(node.type(node.props || {}));
  const children = Object.prototype.hasOwnProperty.call(node.props || {}, 'children')
    ? renderNode(node.props.children)
    : node.props?.children;
  return { ...node, props: { ...(node.props || {}), children } };
}

function collectByType(node, typeName, results = []) {
  if (Array.isArray(node)) {
    for (const child of node) collectByType(child, typeName, results);
    return results;
  }
  if (node == null || typeof node !== 'object') return results;
  if (node.type === typeName) results.push(node);
  collectByType(node.props?.children, typeName, results);
  return results;
}

test('KeyModelStrip renders each tier badge as an editable KF tier model picker', async () => {
  const { KeyModelStrip } = await loadModule();
  const tree = renderNode(KeyModelStrip());
  const pickers = collectByType(tree, 'FinderModelPickerPopover');

  assert.equal(pickers.length, 4);
  assert.deepEqual(pickers.map((picker) => picker.props.binding), ['kfTier', 'kfTier', 'kfTier', 'kfTier']);
  assert.deepEqual(pickers.map((picker) => picker.props.tier), ['easy', 'medium', 'hard', 'very_hard']);
  assert.deepEqual(
    pickers.map((picker) => picker.props.trigger.props.labelPrefix),
    ['EASY', 'MED', 'HARD', 'V.HARD'],
  );
  assert.deepEqual(
    pickers.map((picker) => picker.props.trigger.props.model),
    ['easy-model', 'medium-model', 'hard-model', 'very-hard-model'],
  );
});

