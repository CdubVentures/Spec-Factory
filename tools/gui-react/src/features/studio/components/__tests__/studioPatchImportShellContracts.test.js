import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

function renderNode(node) {
  if (Array.isArray(node)) {
    return node.map(renderNode);
  }
  if (node == null || typeof node !== 'object') {
    return node;
  }
  if (typeof node.type === 'function') {
    return renderNode(node.type(node.props || {}));
  }
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
    for (const child of node) {
      collectNodes(child, predicate, results);
    }
    return results;
  }
  if (node == null || typeof node !== 'object') {
    return results;
  }
  if (predicate(node)) {
    results.push(node);
  }
  collectNodes(node.props?.children, predicate, results);
  return results;
}

function textContent(node) {
  if (Array.isArray(node)) {
    return node.map(textContent).join('');
  }
  if (node == null || typeof node === 'boolean') {
    return '';
  }
  if (typeof node !== 'object') {
    return String(node);
  }
  return textContent(node.props?.children);
}

async function loadStudioPageShellModule() {
  return loadBundledModule(
    'tools/gui-react/src/features/studio/components/StudioPageShell.tsx',
    {
      prefix: 'studio-page-shell-import-',
      stubs: {
        react: '',
        'react/jsx-runtime': `
          export function jsx(type, props) {
            return { type, props: props || {} };
          }
          export const jsxs = jsx;
          export const Fragment = Symbol.for('fragment');
        `,
        '@radix-ui/react-tooltip': `
          export function Provider(props) { return props.children; }
          export function Root(props) { return props.children; }
          export function Trigger(props) { return props.children; }
          export function Portal(props) { return props.children; }
          export function Content(props) { return { type: 'TooltipContent', props }; }
          export function Arrow(props) { return { type: 'TooltipArrow', props }; }
        `,
        '../../../shared/ui/feedback/Tip.tsx': `
          export function Tip(props) { return { type: 'Tip', props }; }
        `,
        '../../../utils/dateTime.ts': `
          export function useFormatDateTime() {
            return () => 'Apr 27, 2026';
          }
        `,
      },
    },
  );
}

function baseProps(onImportPatches) {
  return {
    category: 'mouse',
    activeTab: 'mapping',
    onSelectTab() {},
    reportsTabRunning: false,
    fieldCount: 42,
    compileErrorsCount: 0,
    compileWarningsCount: 0,
    authorityConflictVersion: null,
    authorityConflictDetectedAt: null,
    onReloadAuthoritySnapshot() {},
    onKeepLocalChangesForAuthorityConflict() {},
    saveStatusLabel: 'All saved',
    saveStatusDot: 'sf-success-bg-500',
    savePending: false,
    autoSaveAllEnabled: false,
    onSaveEdits() {},
    onToggleAutoSaveAll() {},
    compileStatusLabel: 'Compiled',
    compileStatusDot: 'sf-success-bg-500',
    compilePending: false,
    compileProcessRunning: false,
    processRunning: false,
    onRunCompile() {},
    onRefresh() {},
    onImportPatches,
    activePanel: { type: 'ActivePanel', props: {} },
  };
}

test('StudioPageShell exposes Import JSON next to the refresh actions', async () => {
  const { StudioPageShell } = await loadStudioPageShellModule();
  let importClicks = 0;

  const tree = renderNode(StudioPageShell(baseProps(() => { importClicks += 1; })));
  const importButton = collectNodes(tree, (node) => (
    node.type === 'button'
    && textContent(node).includes('Import JSON')
  ))[0];

  assert.ok(importButton);
  importButton.props.onClick();
  assert.equal(importClicks, 1);
});
