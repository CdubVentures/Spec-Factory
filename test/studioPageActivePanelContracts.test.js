import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from './helpers/loadBundledModule.js';

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

async function loadStudioPageActivePanelModule() {
  return loadBundledModule(
    'tools/gui-react/src/features/studio/components/StudioPageActivePanel.tsx',
    {
      prefix: 'studio-page-active-panel-',
      stubs: {
        react: `
          export function useMemo(factory) {
            return factory();
          }
        `,
        'react/jsx-runtime': `
          export function jsx(type, props) {
            return { type, props: props || {} };
          }
          export const jsxs = jsx;
          export const Fragment = Symbol.for('fragment');
        `,
        './MappingStudioTab': `
          export function MappingStudioTab(props) {
            return { type: 'MappingStudioTab', props };
          }
        `,
        './KeyNavigatorTab': `
          export function KeyNavigatorTab(props) {
            return { type: 'KeyNavigatorTab', props };
          }
        `,
        '../workbench/FieldRulesWorkbench': `
          export function FieldRulesWorkbench(props) {
            return { type: 'FieldRulesWorkbench', props };
          }
        `,
        '../tabs/CompileReportsTab': `
          export function CompileReportsTab(props) {
            return { type: 'CompileReportsTab', props };
          }
        `,
      },
    },
  );
}

function createActivePanelProps(activeTab) {
  return {
    activeTab,
    category: 'mouse',
    knownValuesSpecDbNotReady: false,
    mappingTabProps: {
      wbMap: { selected_keys: ['dpi'] },
      tooltipCount: 2,
      tooltipCoverage: 50,
      tooltipFiles: ['tips.md'],
      onSaveMap() {},
      saving: false,
      saveSuccess: true,
      saveErrorMessage: '',
      rules: { dpi: { label: 'DPI' } },
      fieldOrder: ['dpi'],
      knownValues: { dpi: ['800'] },
      autoSaveMapEnabled: true,
      setAutoSaveMapEnabled() {},
      autoSaveMapLocked: false,
    },
    keyNavigatorTabProps: {
      category: 'mouse',
      selectedKey: '',
      onSelectKey() {},
      onSave() {},
      saving: false,
      saveSuccess: false,
      knownValues: {},
      enumLists: [],
      componentDb: {},
      componentSources: [],
      autoSaveEnabled: false,
      setAutoSaveEnabled() {},
      autoSaveLocked: false,
      autoSaveLockReason: '',
      onRunEnumConsistency: async () => ({}),
      enumConsistencyPending: false,
    },
    contractTabProps: {
      category: 'mouse',
      knownValues: {},
      enumLists: [],
      componentDb: {},
      componentSources: [],
      wbMap: {},
      guardrails: undefined,
      onSave() {},
      saving: false,
      saveSuccess: false,
      autoSaveEnabled: false,
      setAutoSaveEnabled() {},
      autoSaveLocked: false,
      autoSaveLockReason: '',
    },
    reportsTabProps: {
      artifacts: [{ kind: 'report' }],
      compileErrors: ['missing unit'],
      compileWarnings: [],
      guardrails: { errors: ['missing unit'] },
      compilePending: false,
      compileIsError: false,
      compileErrorMessage: '',
      validatePending: false,
      validateIsError: false,
      validateErrorMessage: '',
      processStatus: { running: false },
      onRunCompile() {},
      onRunValidate() {},
    },
  };
}

test('StudioPageActivePanel preserves the known-values warning banner and mapping-tab props', async () => {
  const { StudioPageActivePanel } = await loadStudioPageActivePanelModule();

  const tree = renderNode(
    StudioPageActivePanel({
      activeTab: 'mapping',
      category: 'mouse',
      knownValuesSpecDbNotReady: true,
      mappingTabProps: {
        wbMap: { selected_keys: ['dpi'] },
        tooltipCount: 2,
        tooltipCoverage: 50,
        tooltipFiles: ['tips.md'],
        onSaveMap() {},
        saving: false,
        saveSuccess: true,
        saveErrorMessage: '',
        rules: { dpi: { label: 'DPI' } },
        fieldOrder: ['dpi'],
        knownValues: { dpi: ['800'] },
        autoSaveMapEnabled: true,
        setAutoSaveMapEnabled() {},
        autoSaveMapLocked: false,
      },
      keyNavigatorTabProps: {
        category: 'mouse',
        selectedKey: '',
        onSelectKey() {},
        onSave() {},
        saving: false,
        saveSuccess: false,
        knownValues: {},
        enumLists: [],
        componentDb: {},
        componentSources: [],
        autoSaveEnabled: false,
        setAutoSaveEnabled() {},
        autoSaveLocked: false,
        autoSaveLockReason: '',
        onRunEnumConsistency: async () => ({}),
        enumConsistencyPending: false,
      },
      contractTabProps: {
        category: 'mouse',
        knownValues: {},
        enumLists: [],
        componentDb: {},
        componentSources: [],
        wbMap: {},
        guardrails: undefined,
        onSave() {},
        saving: false,
        saveSuccess: false,
        autoSaveEnabled: false,
        setAutoSaveEnabled() {},
        autoSaveLocked: false,
        autoSaveLockReason: '',
      },
      reportsTabProps: {
        artifacts: [],
        compileErrors: [],
        compileWarnings: [],
        guardrails: undefined,
        compilePending: false,
        compileIsError: false,
        compileErrorMessage: '',
        validatePending: false,
        validateIsError: false,
        validateErrorMessage: '',
        processStatus: { running: false },
        onRunCompile() {},
        onRunValidate() {},
      },
    }),
  );

  const warningText = textContent(tree);
  const mappingNode = collectNodes(
    tree,
    (node) => node.type === 'MappingStudioTab',
  )[0];

  assert.ok(warningText.includes('Known values authority unavailable'));
  assert.ok(warningText.includes('SpecDb is not ready for mouse.'));
  assert.ok(mappingNode);
  assert.deepEqual(mappingNode.props.fieldOrder, ['dpi']);
  assert.equal(mappingNode.props.tooltipCoverage, 50);
});

test('StudioPageActivePanel switches to reports and contract tabs without rendering unrelated panel modules', async () => {
  const { StudioPageActivePanel } = await loadStudioPageActivePanelModule();

  const reportsTree = renderNode(
    StudioPageActivePanel({
      activeTab: 'reports',
      category: 'mouse',
      knownValuesSpecDbNotReady: false,
      mappingTabProps: {
        wbMap: {},
        tooltipCount: 0,
        tooltipCoverage: 0,
        tooltipFiles: [],
        onSaveMap() {},
        saving: false,
        saveSuccess: false,
        saveErrorMessage: '',
        rules: {},
        fieldOrder: [],
        knownValues: {},
        autoSaveMapEnabled: false,
        setAutoSaveMapEnabled() {},
        autoSaveMapLocked: false,
      },
      keyNavigatorTabProps: {
        category: 'mouse',
        selectedKey: '',
        onSelectKey() {},
        onSave() {},
        saving: false,
        saveSuccess: false,
        knownValues: {},
        enumLists: [],
        componentDb: {},
        componentSources: [],
        autoSaveEnabled: false,
        setAutoSaveEnabled() {},
        autoSaveLocked: false,
        autoSaveLockReason: '',
        onRunEnumConsistency: async () => ({}),
        enumConsistencyPending: false,
      },
      contractTabProps: {
        category: 'mouse',
        knownValues: {},
        enumLists: [],
        componentDb: {},
        componentSources: [],
        wbMap: {},
        guardrails: { warnings: ['stale'] },
        onSave() {},
        saving: false,
        saveSuccess: false,
        autoSaveEnabled: false,
        setAutoSaveEnabled() {},
        autoSaveLocked: false,
        autoSaveLockReason: '',
      },
      reportsTabProps: {
        artifacts: [{ kind: 'report' }],
        compileErrors: ['missing unit'],
        compileWarnings: [],
        guardrails: { errors: ['missing unit'] },
        compilePending: true,
        compileIsError: false,
        compileErrorMessage: '',
        validatePending: false,
        validateIsError: false,
        validateErrorMessage: '',
        processStatus: { running: true },
        onRunCompile() {},
        onRunValidate() {},
      },
    }),
  );

  assert.equal(
    collectNodes(reportsTree, (node) => node.type === 'CompileReportsTab').length,
    1,
  );
  assert.equal(
    collectNodes(reportsTree, (node) => node.type === 'MappingStudioTab').length,
    0,
  );
  assert.equal(
    collectNodes(reportsTree, (node) => node.type === 'KeyNavigatorTab').length,
    0,
  );
});

test('StudioPageActivePanel routes each tab to exactly its supported panel contract', async () => {
  const { StudioPageActivePanel } = await loadStudioPageActivePanelModule();
  const cases = [
    { activeTab: 'mapping', expected: 'MappingStudioTab' },
    { activeTab: 'keys', expected: 'KeyNavigatorTab' },
    { activeTab: 'contract', expected: 'FieldRulesWorkbench' },
    { activeTab: 'reports', expected: 'CompileReportsTab' },
  ];
  const panelTypes = ['MappingStudioTab', 'KeyNavigatorTab', 'FieldRulesWorkbench', 'CompileReportsTab'];

  for (const { activeTab, expected } of cases) {
    const tree = renderNode(StudioPageActivePanel(createActivePanelProps(activeTab)));
    for (const panelType of panelTypes) {
      assert.equal(
        collectNodes(tree, (node) => node.type === panelType).length,
        panelType === expected ? 1 : 0,
        `${activeTab} should ${panelType === expected ? 'render' : 'not render'} ${panelType}`,
      );
    }
  }
});
