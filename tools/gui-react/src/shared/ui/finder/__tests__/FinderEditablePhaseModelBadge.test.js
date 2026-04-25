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
  './FinderRunModelBadge.tsx': `
    export function FinderRunModelBadge(props) {
      return { type: 'FinderRunModelBadge', props };
    }
  `,
  './FinderModelPickerPopover.tsx': `
    export function FinderModelPickerPopover(props) {
      return { type: 'FinderModelPickerPopover', props };
    }
  `,
  './useResolvedFinderModel.ts': `
    export function useResolvedFinderModel(phaseId) {
      globalThis.__finderEditablePhaseIds.push(phaseId);
      return {
        modelDisplay: 'lab-openai:gpt-5.4',
        accessMode: 'lab',
        effortLevel: 'xhigh',
        model: { thinking: true, webSearch: true },
      };
    }
  `,
};

async function loadModule() {
  return loadBundledModule(
    'tools/gui-react/src/shared/ui/finder/FinderEditablePhaseModelBadge.tsx',
    { prefix: 'finder-editable-phase-model-badge-', stubs: STUBS },
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

test('FinderEditablePhaseModelBadge renders a phase model picker around the resolved model badge', async () => {
  const { FinderEditablePhaseModelBadge } = await loadModule();
  globalThis.__finderEditablePhaseIds = [];

  const tree = renderNode(FinderEditablePhaseModelBadge({
    phaseId: 'colorFinder',
    labelPrefix: 'CEF',
    title: 'CEF - Color & Edition Finder',
    showAccessModeText: true,
  }));

  assert.deepEqual(globalThis.__finderEditablePhaseIds, ['colorFinder']);
  assert.equal(tree.type, 'FinderModelPickerPopover');
  assert.equal(tree.props.binding, 'phase');
  assert.equal(tree.props.phaseId, 'colorFinder');
  assert.equal(tree.props.title, 'CEF - Color & Edition Finder');
  const trigger = renderNode(tree.props.trigger);
  assert.equal(trigger.type, 'FinderRunModelBadge');
  assert.equal(trigger.props.labelPrefix, 'CEF');
  assert.equal(trigger.props.model, 'lab-openai:gpt-5.4');
  assert.equal(trigger.props.accessMode, 'lab');
  assert.equal(trigger.props.thinking, true);
  assert.equal(trigger.props.webSearch, true);
  assert.equal(trigger.props.effortLevel, 'xhigh');
  assert.equal(trigger.props.showAccessModeText, true);
});
