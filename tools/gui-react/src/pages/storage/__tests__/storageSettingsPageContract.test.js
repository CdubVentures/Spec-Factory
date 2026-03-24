import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from '../../../../../../src/shared/tests/helpers/loadBundledModule.js';

function createBootstrap(overrides = {}) {
  return {
    enabled: true,
    destinationType: 'local',
    localDirectory: 'C:\\SpecFactoryRuns',
    awsRegion: 'us-east-2',
    s3Bucket: '',
    s3Prefix: 'spec-factory-runs',
    s3AccessKeyId: '',
    hasS3SecretAccessKey: false,
    hasS3SessionToken: false,
    ...overrides,
  };
}

function createHarness(overrides = {}) {
  return {
    storageSettingsReady: false,
    bootstrap: createBootstrap(),
    uiState: {
      storageAutoSaveEnabled: true,
      setStorageAutoSaveEnabled(value) {
        globalThis.__storageSettingsPageHarness.uiState.storageAutoSaveEnabled = Boolean(value);
      },
    },
    authorityCalls: [],
    authorityResult: {
      settings: createBootstrap(),
      isSaving: false,
      reload: async () => {},
      saveNow: async () => {},
    },
    queryResult: {
      data: undefined,
    },
    state: [],
    refs: [],
    cursor: 0,
    effects: [],
    effectDeps: [],
    effectCursor: 0,
    needsRerender: false,
    ...overrides,
  };
}

function stableEqual(a, b) {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return Object.is(a, b);
  }
}

function renderElement(node) {
  if (Array.isArray(node)) {
    return node.map(renderElement);
  }
  if (node == null || typeof node !== 'object') {
    return node;
  }
  if (typeof node.type === 'function') {
    return renderElement(node.type(node.props || {}));
  }
  const nextChildren = Object.prototype.hasOwnProperty.call(node.props || {}, 'children')
    ? renderElement(node.props.children)
    : node.props?.children;
  return {
    ...node,
    props: {
      ...(node.props || {}),
      children: nextChildren,
    },
  };
}

function renderPage(Page, harness) {
  globalThis.__storageSettingsPageHarness = harness;
  let tree = null;
  for (let pass = 0; pass < 6; pass += 1) {
    harness.cursor = 0;
    harness.effects = [];
    harness.effectCursor = 0;
    harness.needsRerender = false;
    tree = renderElement(Page());
    const effects = [...harness.effects];
    harness.effects = [];
    for (const effect of effects) {
      effect();
    }
    if (!harness.needsRerender) {
      return tree;
    }
  }
  throw new Error('storage_settings_page_render_loop');
}

function collectNodes(node, predicate, acc = []) {
  if (Array.isArray(node)) {
    for (const child of node) collectNodes(child, predicate, acc);
    return acc;
  }
  if (node == null || typeof node !== 'object') {
    return acc;
  }
  if (predicate(node)) {
    acc.push(node);
  }
  collectNodes(node.props?.children, predicate, acc);
  return acc;
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

async function loadPageModule() {
  return loadBundledModule('tools/gui-react/src/pages/storage/StoragePage.tsx', {
    prefix: 'storage-settings-page-contract-',
    stubs: {
      react: `
        function stableEqual(a, b) {
          try {
            return JSON.stringify(a) === JSON.stringify(b);
          } catch {
            return Object.is(a, b);
          }
        }
        export function useState(initialValue) {
          const harness = globalThis.__storageSettingsPageHarness;
          const idx = harness.cursor++;
          if (!(idx in harness.state)) {
            harness.state[idx] = typeof initialValue === 'function' ? initialValue() : initialValue;
          }
          return [
            harness.state[idx],
            (nextValue) => {
              const resolved = typeof nextValue === 'function' ? nextValue(harness.state[idx]) : nextValue;
              if (!stableEqual(harness.state[idx], resolved)) {
                harness.state[idx] = resolved;
                harness.needsRerender = true;
              }
            },
          ];
        }
        export function useEffect(effect) {
          const harness = globalThis.__storageSettingsPageHarness;
          const idx = harness.effectCursor++;
          const deps = arguments.length > 1 ? arguments[1] : undefined;
          const prevDeps = harness.effectDeps[idx];
          const changed = !Array.isArray(deps)
            || !Array.isArray(prevDeps)
            || deps.length !== prevDeps.length
            || deps.some((value, depIdx) => !stableEqual(value, prevDeps[depIdx]));
          if (changed) {
            harness.effectDeps[idx] = deps;
            harness.effects.push(effect);
          }
        }
        export function useMemo(factory) {
          return factory();
        }
        export function useCallback(fn) {
          return fn;
        }
        export function useRef(initialValue) {
          const harness = globalThis.__storageSettingsPageHarness;
          const idx = harness.cursor++;
          if (!(idx in harness.refs)) {
            harness.refs[idx] = { current: initialValue };
          }
          return harness.refs[idx];
        }
      `,
      'react/jsx-runtime': `
        export function jsx(type, props) {
          return { type, props: props || {} };
        }
        export const jsxs = jsx;
        export const Fragment = Symbol.for('fragment');
      `,
      '@tanstack/react-query': `
        export function useQuery() {
          return globalThis.__storageSettingsPageHarness.queryResult;
        }
        export function useMutation() {
          return { mutate() {}, mutateAsync: async () => ({}), isPending: false };
        }
        export function useQueryClient() {
          return { invalidateQueries() {} };
        }
      `,
      '@tanstack/react-table': `
        export function useReactTable() {
          return {
            getHeaderGroups: () => [],
            getRowModel: () => ({ rows: [] }),
            getState: () => ({ sorting: [], globalFilter: '', expanded: {} }),
            setSorting() {},
            setGlobalFilter() {},
            setExpanded() {},
          };
        }
        export function getCoreRowModel() { return () => ({}); }
        export function getSortedRowModel() { return () => ({}); }
        export function getFilteredRowModel() { return () => ({}); }
        export function getExpandedRowModel() { return () => ({}); }
        export function flexRender(cell) { return cell; }
      `,
      '../../api/client': `
        export const api = {
          get: async () => ({}),
          post: async () => ({}),
          put: async () => ({}),
          del: async () => ({}),
        };
      `,
      '../../api/ws': `
        export const wsManager = {
          onMessage() {
            return () => {};
          },
        };
      `,
      '../../components/common/Spinner': `
        export function Spinner(props) {
          return { type: 'Spinner', props: props || {} };
        }
      `,
      '../../shared/ui/feedback/settingsStatus': `
        export function resolveStorageSettingsStatusText({ storageSettingsReady, autoSaveEnabled }) {
          return storageSettingsReady ? (autoSaveEnabled ? 'autosave-ready' : 'manual-ready') : 'waiting';
        }
      `,
      '../../stores/tabStore': `
        import { useState } from 'react';
        export function usePersistedTab(_key, initialValue) {
          return useState(initialValue);
        }
      `,
      '../../stores/uiStore': `
        export function useUiStore(selector) {
          return selector(globalThis.__storageSettingsPageHarness.uiState);
        }
      `,
      '../../stores/settingsAuthorityStore': `
        export function useSettingsAuthorityStore(selector) {
          return selector({
            snapshot: {
              storageReady: globalThis.__storageSettingsPageHarness.storageSettingsReady,
            },
          });
        }
      `,
      '../../stores/settingsManifest': `
        export const STORAGE_DESTINATION_OPTIONS = ['local', 's3'];
        export const STORAGE_SETTING_DEFAULTS = {
          enabled: false,
          destinationType: 'local',
          localDirectory: '',
          awsRegion: 'us-east-2',
          s3Bucket: '',
          s3Prefix: 'spec-factory-runs',
          s3AccessKeyId: '',
        };
      `,
      '../../stores/storageSettingsAuthority': `
        export function useStorageSettingsBootstrap() {
          return globalThis.__storageSettingsPageHarness.bootstrap;
        }
        export function useStorageSettingsAuthority(input) {
          globalThis.__storageSettingsPageHarness.authorityCalls.push(input);
          return globalThis.__storageSettingsPageHarness.authorityResult;
        }
      `,
    },
  });
}

test('storage page disables autosave writes and manual save until shared storage readiness is true', async () => {
  const { StoragePage } = await loadPageModule();
  const harness = createHarness({
    storageSettingsReady: false,
    uiState: {
      storageAutoSaveEnabled: true,
      setStorageAutoSaveEnabled() {},
    },
  });

  const tree = renderPage(StoragePage, harness);
  const saveButton = collectNodes(
    tree,
    (node) => node.type === 'button' && textContent(node).trim() === 'Save',
  )[0];

  assert.ok(saveButton, 'save button should render');
  assert.equal(harness.authorityCalls.length, 1);
  assert.equal(harness.authorityCalls[0].autoSaveEnabled, false);
  assert.equal(saveButton.props.disabled, true);
  assert.equal(textContent(tree).includes('Run Data Storage'), true);

  delete globalThis.__storageSettingsPageHarness;
});

test('storage page starts passing autosave through once shared storage readiness is available', async () => {
  const { StoragePage } = await loadPageModule();
  const harness = createHarness({
    storageSettingsReady: true,
    uiState: {
      storageAutoSaveEnabled: true,
      setStorageAutoSaveEnabled() {},
    },
  });

  const tree = renderPage(StoragePage, harness);

  assert.equal(harness.authorityCalls.length, 1);
  assert.equal(harness.authorityCalls[0].autoSaveEnabled, true);
  assert.equal(textContent(tree).includes('autosave-ready'), true);

  delete globalThis.__storageSettingsPageHarness;
});
