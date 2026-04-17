import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

async function loadStudioPagePanelPropsModule() {
  return loadBundledModule(
    'tools/gui-react/src/features/studio/state/studioPagePanelProps.ts',
    {
      prefix: 'studio-page-panel-props-',
    },
  );
}

test('buildStudioPageActivePanelProps preserves populated studio panel state and callbacks', async () => {
  const { buildStudioPageActivePanelProps } =
    await loadStudioPagePanelPropsModule();

  const onSelectKey = () => {};
  const onSaveMap = () => {};
  const onSave = () => {};
  const setAutoSaveEnabled = () => {};
  const setAutoSaveMapEnabled = () => {};
  const onRunCompile = () => {};
  const onRunValidate = () => {};

  const result = buildStudioPageActivePanelProps({
    activeTab: 'reports',
    category: 'mouse',
    knownValuesSpecDbNotReady: true,
    wbMap: { selected_keys: ['dpi'] },
    tooltipCount: 3,
    tooltipCoverage: 75,
    tooltipFiles: ['tips.md'],
    onSaveMap,
    saveMapPending: true,
    saveMapSuccess: false,
    saveMapErrorMessage: 'map failed',
    rules: {
      dpi: {
        label: 'DPI',
      },
    },
    fieldOrder: ['dpi'],
    knownValuesFields: {
      dpi: ['800', '1600'],
    },
    autoSaveMapEnabled: true,
    setAutoSaveMapEnabled,
    autoSaveMapLocked: true,
    selectedKey: 'dpi',
    onSelectKey,
    onSave,
    savePending: false,
    saveSuccess: true,
    enumLists: [
      {
        field: 'dpi',
        values: ['800', '1600'],
      },
    ],
    componentDb: {
      sensors: [
        {
          name: 'Hero',
          maker: 'Logitech',
          aliases: ['hero'],
        },
      ],
    },
    componentSources: [
      {
        type: 'sensor',
      },
    ],
    autoSaveEnabled: true,
    setAutoSaveEnabled,
    autoSaveLocked: false,
    autoSaveLockReason: '',
    guardrails: {
      warnings: ['stale'],
    },
    artifacts: [
      {
        name: 'compile-report.json',
        size: 24,
        updated: '2026-03-12T00:00:00.000Z',
      },
    ],
    compileErrors: ['missing unit'],
    compileWarnings: ['stale enum'],
    compilePending: true,
    compileIsError: false,
    compileErrorMessage: '',
    validatePending: false,
    validateIsError: false,
    validateErrorMessage: '',
    processStatus: {
      running: true,
      command: 'compile',
    },
    onRunCompile,
    onRunValidate,
  });

  assert.equal(result.activeTab, 'reports');
  assert.equal(result.knownValuesSpecDbNotReady, true);
  assert.equal(result.mappingTabProps.onSaveMap, onSaveMap);
  assert.equal(result.mappingTabProps.knownValues.dpi[0], '800');
  assert.equal(result.keyNavigatorTabProps.onSelectKey, onSelectKey);
  assert.deepEqual(result.contractTabProps.guardrails, { warnings: ['stale'] });
  assert.deepEqual(result.reportsTabProps.artifacts, [
    {
      name: 'compile-report.json',
      size: 24,
      updated: '2026-03-12T00:00:00.000Z',
    },
  ]);
  assert.deepEqual(result.reportsTabProps.compileErrors, ['missing unit']);
  assert.deepEqual(result.reportsTabProps.compileWarnings, ['stale enum']);
  assert.equal(result.reportsTabProps.onRunCompile, onRunCompile);
});

test('buildStudioPageActivePanelProps normalizes missing data sources to safe empty panel props', async () => {
  const { buildStudioPageActivePanelProps } =
    await loadStudioPagePanelPropsModule();

  const result = buildStudioPageActivePanelProps({
    activeTab: 'mapping',
    category: 'mouse',
    knownValuesSpecDbNotReady: false,
    wbMap: {},
    tooltipCount: 0,
    tooltipCoverage: 0,
    tooltipFiles: [],
    onSaveMap() {},
    saveMapPending: false,
    saveMapSuccess: false,
    saveMapErrorMessage: '',
    rules: {},
    fieldOrder: [],
    knownValuesFields: undefined,
    autoSaveMapEnabled: false,
    setAutoSaveMapEnabled() {},
    autoSaveMapLocked: false,
    selectedKey: '',
    onSelectKey() {},
    onSave() {},
    savePending: false,
    saveSuccess: false,
    enumLists: [],
    componentDb: undefined,
    componentSources: undefined,
    autoSaveEnabled: false,
    setAutoSaveEnabled() {},
    autoSaveLocked: false,
    autoSaveLockReason: '',
    guardrails: undefined,
    artifacts: undefined,
    compileErrors: [],
    compileWarnings: [],
    compilePending: false,
    compileIsError: false,
    compileErrorMessage: '',
    validatePending: false,
    validateIsError: false,
    validateErrorMessage: '',
    processStatus: {
      running: false,
    },
    onRunCompile() {},
    onRunValidate() {},
  });

  assert.deepEqual(result.mappingTabProps.knownValues, {});
  assert.deepEqual(result.keyNavigatorTabProps.componentDb, {});
  assert.deepEqual(result.keyNavigatorTabProps.componentSources, []);
  assert.deepEqual(result.contractTabProps.knownValues, {});
  assert.deepEqual(result.reportsTabProps.artifacts, []);
  assert.equal(result.contractTabProps.guardrails, undefined);
});
