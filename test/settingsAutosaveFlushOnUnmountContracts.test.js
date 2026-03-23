import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function loadModule(entryRelativePath, stubs) {
  const esbuild = await import('esbuild');
  const entryPath = path.resolve(__dirname, '..', entryRelativePath);
  const result = await esbuild.build({
    entryPoints: [entryPath],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    loader: { '.ts': 'ts', '.tsx': 'tsx' },
    plugins: [
      {
        name: 'stub-modules',
        setup(build) {
          build.onResolve({ filter: /.*/ }, (args) => {
            if (Object.prototype.hasOwnProperty.call(stubs, args.path)) {
              return { path: args.path, namespace: 'stub' };
            }
            return null;
          });

          build.onLoad({ filter: /.*/, namespace: 'stub' }, (args) => ({
            contents: stubs[args.path],
            loader: 'js',
          }));
        },
      },
    ],
  });

  const code = result.outputFiles[0].text;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autosave-flush-contract-'));
  const tmpFile = path.join(tmpDir, 'module.mjs');
  fs.writeFileSync(tmpFile, code, 'utf8');

  try {
    return await import(`file://${tmpFile.replace(/\\/g, '/')}?v=${Date.now()}-${Math.random()}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function createHookHarness() {
  const effects = [];
  const timers = [];
  const clearedTimers = [];
  const apiPutCalls = [];
  const mutationCalls = [];
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;

  globalThis.__hookHarness = {
    effects,
    apiPutCalls,
    mutationCalls,
  };

  globalThis.setTimeout = (fn, ms) => {
    const timer = { fn, ms, id: timers.length + 1 };
    timers.push(timer);
    return timer;
  };
  globalThis.clearTimeout = (timer) => {
    clearedTimers.push(timer);
  };

  return {
    apiPutCalls,
    mutationCalls,
    timers,
    clearedTimers,
    runUnmount() {
      const cleanups = [];
      for (const effect of effects) {
        const cleanup = effect();
        if (typeof cleanup === 'function') {
          cleanups.push(cleanup);
        }
      }
      for (let idx = cleanups.length - 1; idx >= 0; idx -= 1) {
        cleanups[idx]();
      }
    },
    restore() {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
      delete globalThis.__hookHarness;
    },
  };
}

function buildCommonStubs({ manifestStub }) {
  return {
    react: `
      export function useEffect(effect) {
        globalThis.__hookHarness.effects.push(effect);
      }
      export function useMemo(factory) {
        return factory();
      }
      export function useRef(value) {
        return { current: value };
      }
      export function useCallback(fn) { return fn; }
      export function useSyncExternalStore(subscribe, getSnapshot) { return getSnapshot(); }
      export function useDebugValue() {}
      export function createElement() { return null; }
      const React = { useEffect, useMemo, useRef, useCallback, useSyncExternalStore, useDebugValue, createElement };
      export default React;
    `,
    '@tanstack/react-query': `
      export function useMutation() {
        return {
          mutate(payload) {
            globalThis.__hookHarness.mutationCalls.push(payload);
          },
          isPending: false,
        };
      }
      export function useQuery() {
        return {
          data: undefined,
          isLoading: false,
          refetch: async () => ({ data: undefined }),
        };
      }
      export function useQueryClient() {
        return {
          getQueryData() { return undefined; },
          setQueryData() {},
        };
      }
    `,
    '../../../api/client': `
      export const api = {
        get: async () => ({}),
        put: async (url, payload) => {
          globalThis.__hookHarness.apiPutCalls.push({ url, payload });
          return payload;
        },
      };
    `,
    '../../../stores/autoSaveFingerprint': `
      export function autoSaveFingerprint(value) {
        return JSON.stringify(value);
      }
    `,
    '../../../stores/settingsManifest': manifestStub,
    '../../../stores/settingsMutationContract': `
      export function createSettingsOptimisticMutationContract(contract) {
        return contract;
      }
    `,
    '../../../stores/settingsPropagationContract': `
      export function publishSettingsPropagation() {}
    `,
    '../../../api/teardownFetch': `
      export function teardownFetch({ url, method, body }) {
        globalThis.__hookHarness.apiPutCalls.push({ url, method, body });
      }
    `,
    '../../../stores/settingsUnloadGuard': `
      export function registerUnloadGuard() { return () => {}; }
      export function markDomainFlushedByUnmount() {}
      export function isDomainFlushedByUnload() { return false; }
    `,
    './settingsAutoSaveGate': `
      export function shouldAutoSave(input) {
        if (!input.initialHydrationApplied) return false;
        if (!input.autoSaveEnabled) return false;
        if (!input.dirty) return false;
        if (!input.payloadFingerprint) return false;
        if (input.payloadFingerprint === input.lastSavedFingerprint) return false;
        if (input.payloadFingerprint === input.lastAttemptFingerprint) return false;
        return true;
      }
      export function shouldFlushOnUnmount(input) {
        if (input.alreadyFlushedByUnload) return false;
        if (!input.enabled || !input.dirty || !input.autoSaveEnabled) return false;
        if (!input.payloadFingerprint) return false;
        if (input.payloadFingerprint === input.lastSavedFingerprint) return false;
        if (!input.hadPendingTimer && input.payloadFingerprint === input.lastAttemptFingerprint) return false;
        return true;
      }
      export function shouldForceHydration() { return false; }
    `,
  };
}

async function loadStorageAuthorityModule() {
  return loadModule(
    'tools/gui-react/src/features/pipeline-settings/state/storageSettingsAuthority.ts',
    buildCommonStubs({
      manifestStub: `
        export const SETTINGS_AUTOSAVE_DEBOUNCE_MS = { storage: 25 };
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
    }),
  );
}

async function loadRuntimeAuthorityModule() {
  return loadModule(
    'tools/gui-react/src/features/pipeline-settings/state/runtimeSettingsAuthority.ts',
    {
      ...buildCommonStubs({
        manifestStub: `
          export const SETTINGS_AUTOSAVE_DEBOUNCE_MS = { runtime: 25 };
          export const RUNTIME_SETTING_DEFAULTS = new Proxy({}, {
            get() {
              return 0;
            },
          });
        `,
      }),
      '../../../stores/runtimeSettingsValueStore': `
        export function useRuntimeSettingsValueStore(selector) {
          return typeof selector === 'function' ? selector({ markClean() {} }) : {};
        }
      `,
      './RuntimeFlowDraftNormalization': `
        export function normalizeRuntimeDraft(v) { return v; }
      `,
    },
  );
}

async function loadLlmAuthorityModule() {
  return loadModule(
    'tools/gui-react/src/features/pipeline-settings/state/llmSettingsAuthority.ts',
    {
      ...buildCommonStubs({
        manifestStub: `
          export const SETTINGS_AUTOSAVE_DEBOUNCE_MS = { llmRoutes: 25 };
        `,
      }),
      '../../../stores/settingsMutationContract': `
        export function createSettingsOptimisticMutationContract(contract) {
          return contract;
        }
      `,
    },
  );
}

test('storage settings authority flushes a pending autosave payload on unmount', async () => {
  const harness = createHookHarness();

  try {
    const { useStorageSettingsAuthority } = await loadStorageAuthorityModule();
    const payload = {
      enabled: true,
      destinationType: 's3',
      localDirectory: '',
      awsRegion: 'us-west-1',
      s3Bucket: 'spec-factory',
      s3Prefix: 'autosave-prefix',
      s3AccessKeyId: 'AKIA_TEST',
    };

    useStorageSettingsAuthority({
      payload,
      dirty: true,
      autoSaveEnabled: true,
    });

    harness.runUnmount();

    assert.equal(harness.timers.length, 1);
    assert.equal(harness.apiPutCalls.length, 1);
    assert.deepEqual(harness.apiPutCalls[0], {
      url: '/api/v1/storage-settings',
      method: 'PUT',
      body: payload,
    });
  } finally {
    harness.restore();
  }
});

test('runtime settings authority flushes a pending autosave payload on unmount', async () => {
  const harness = createHookHarness();

  try {
    const { useRuntimeSettingsAuthority } = await loadRuntimeAuthorityModule();
    const payload = {
      fetchConcurrency: 6,
      dynamicCrawleeEnabled: true,
    };

    useRuntimeSettingsAuthority({
      payload,
      dirty: true,
      autoSaveEnabled: true,
    });

    harness.runUnmount();

    assert.equal(harness.timers.length, 1);
    assert.equal(harness.apiPutCalls.length, 1);
    assert.deepEqual(harness.apiPutCalls[0], {
      url: '/api/v1/runtime-settings',
      method: 'PUT',
      body: payload,
    });
  } finally {
    harness.restore();
  }
});

test('llm settings authority flushes a pending autosave payload on unmount', async () => {
  const harness = createHookHarness();

  try {
    const { useLlmSettingsAuthority } = await loadLlmAuthorityModule();
    const rows = [
      { route_key: 'write.summary', enable_websearch: true },
    ];

    useLlmSettingsAuthority({
      category: 'mouse',
      enabled: true,
      rows,
      dirty: true,
      autoSaveEnabled: true,
      editVersion: 7,
    });

    harness.runUnmount();

    assert.equal(harness.timers.length, 1);
    assert.equal(harness.apiPutCalls.length, 1);
    assert.deepEqual(harness.apiPutCalls[0], {
      url: '/api/v1/llm-settings/mouse/routes',
      method: 'PUT',
      body: { rows },
    });
  } finally {
    harness.restore();
  }
});
