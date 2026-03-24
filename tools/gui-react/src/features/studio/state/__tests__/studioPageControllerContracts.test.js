import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from '../../../../../../../test/helpers/loadBundledModule.js';

async function loadStudioPageQueriesModule() {
  return loadBundledModule(
    'tools/gui-react/src/features/studio/state/useStudioPageQueries.ts',
    {
      prefix: 'studio-page-queries-',
      stubs: {
        '@tanstack/react-query': `
          export function useQuery(options) {
            globalThis.__studioPageQueryHarness.queryCalls.push({
              queryKey: options.queryKey,
              enabled: options.enabled,
              refetchInterval: options.refetchInterval,
            });
            if (options.enabled !== false && typeof options.queryFn === 'function') {
              globalThis.__studioPageQueryHarness.pending.push(Promise.resolve(options.queryFn()));
            }
            return { data: globalThis.__studioPageQueryHarness.queryData };
          }
        `,
        '../../../api/client': `
          export const api = {
            get(url) {
              globalThis.__studioPageQueryHarness.apiCalls.push(url);
              return Promise.resolve({ url });
            },
          };
        `,
      },
    },
  );
}

async function loadStudioPageMutationsModule() {
  return loadBundledModule(
    'tools/gui-react/src/features/studio/state/useStudioPageMutations.ts',
    {
      prefix: 'studio-page-mutations-',
      stubs: {
        react: `
          export function useEffect(effect) {
            effect();
          }
          export function useCallback(fn) {
            return fn;
          }
        `,
        '@tanstack/react-query': `
          export function useMutation(config) {
            const handle = {
              isPending: false,
              isSuccess: false,
              isError: false,
              error: null,
              async mutateAsync(payload) {
                const result = await config.mutationFn(payload);
                if (typeof config.onSuccess === 'function') {
                  await config.onSuccess(result, payload);
                }
                return result;
              },
              mutate(payload, options = {}) {
                return handle.mutateAsync(payload).then((result) => {
                  handle.isSuccess = true;
                  if (typeof options.onSuccess === 'function') {
                    options.onSuccess(result);
                  }
                  return result;
                }).catch((error) => {
                  handle.isError = true;
                  handle.error = error;
                  throw error;
                });
              },
            };
            globalThis.__studioPageMutationHarness.mutationConfigs.push(config);
            return handle;
          }
        `,
        '../../../api/client': `
          export const api = {
            async get(url) {
              globalThis.__studioPageMutationHarness.apiCalls.push({ method: 'GET', url });
              return { map: { selected_keys: ['dpi'] } };
            },
            async post(url, payload) {
              globalThis.__studioPageMutationHarness.apiCalls.push({ method: 'POST', url, payload });
              if (url.includes('/compile')) {
                return { running: true, command: 'compile-rules', pid: 41 };
              }
              return { ok: true };
            },
          };
        `,
        './invalidateFieldRulesQueries': `
          export function invalidateFieldRulesQueries(queryClient, category) {
            globalThis.__studioPageMutationHarness.invalidations.push({
              kind: 'field-rules',
              category,
              queryClient,
            });
          }
        `,
        './mapValidationPreflight.js': `
          export function assertFieldStudioMapValidationOrThrow(input) {
            globalThis.__studioPageMutationHarness.validationCalls.push(input);
          }
        `,
      },
    },
  );
}

test('useStudioPageQueries preserves tab-scoped query enablement and reports polling cadence', async () => {
  globalThis.__studioPageQueryHarness = {
    apiCalls: [],
    pending: [],
    queryCalls: [],
    queryData: {},
  };

  try {
    const { useStudioPageQueries } = await loadStudioPageQueriesModule();

    useStudioPageQueries({
      category: 'mouse',
      activeTab: 'mapping',
      processRunning: false,
    });

    await Promise.all(globalThis.__studioPageQueryHarness.pending);

    const mappingCalls = globalThis.__studioPageQueryHarness.queryCalls;
    const tooltipCall = mappingCalls.find((entry) =>
      JSON.stringify(entry.queryKey) === JSON.stringify(['studio-tooltip-bank', 'mouse']),
    );
    const artifactsCall = mappingCalls.find((entry) =>
      JSON.stringify(entry.queryKey) === JSON.stringify(['studio-artifacts', 'mouse']),
    );
    const knownValuesCall = mappingCalls.find((entry) =>
      JSON.stringify(entry.queryKey) === JSON.stringify(['studio-known-values', 'mouse']),
    );
    const componentDbCall = mappingCalls.find((entry) =>
      JSON.stringify(entry.queryKey) === JSON.stringify(['studio-component-db', 'mouse']),
    );

    assert.equal(tooltipCall?.enabled, true);
    assert.equal(artifactsCall?.enabled, false);
    assert.equal(artifactsCall?.refetchInterval, false);
    assert.equal(knownValuesCall?.enabled, true);
    assert.equal(componentDbCall?.enabled, false);

    globalThis.__studioPageQueryHarness.apiCalls = [];
    globalThis.__studioPageQueryHarness.pending = [];
    globalThis.__studioPageQueryHarness.queryCalls = [];

    useStudioPageQueries({
      category: 'mouse',
      activeTab: 'reports',
      processRunning: true,
    });

    await Promise.all(globalThis.__studioPageQueryHarness.pending);

    const reportsCalls = globalThis.__studioPageQueryHarness.queryCalls;
    const reportsArtifactsCall = reportsCalls.find((entry) =>
      JSON.stringify(entry.queryKey) === JSON.stringify(['studio-artifacts', 'mouse']),
    );
    const reportsKnownValuesCall = reportsCalls.find((entry) =>
      JSON.stringify(entry.queryKey) === JSON.stringify(['studio-known-values', 'mouse']),
    );

    assert.equal(reportsArtifactsCall?.enabled, true);
    assert.equal(reportsArtifactsCall?.refetchInterval, 1200);
    assert.equal(reportsKnownValuesCall?.enabled, false);
    assert.equal(
      globalThis.__studioPageQueryHarness.apiCalls.includes('/studio/mouse/artifacts'),
      true,
    );
  } finally {
    delete globalThis.__studioPageQueryHarness;
  }
});

test('useStudioPageMutations preserves compile, enum-consistency, refresh, and process-finish invalidation behavior', async () => {
  globalThis.__studioPageMutationHarness = {
    apiCalls: [],
    invalidations: [],
    mutationConfigs: [],
    queryInvalidations: [],
    setActiveTabCalls: [],
    setProcessStatusCalls: [],
    validationCalls: [],
  };

  try {
    const { useStudioPageMutations } = await loadStudioPageMutationsModule();
    const queryClient = {
      invalidateQueries(options) {
        globalThis.__studioPageMutationHarness.queryInvalidations.push(options);
        return Promise.resolve({ ok: true });
      },
    };

    const hook = useStudioPageMutations({
      category: 'mouse',
      processStatus: {
        running: false,
        exitCode: 0,
      },
      queryClient,
      setActiveTab(nextTab) {
        globalThis.__studioPageMutationHarness.setActiveTabCalls.push(nextTab);
      },
      setProcessStatus(status) {
        globalThis.__studioPageMutationHarness.setProcessStatusCalls.push(status);
      },
    });

    assert.deepEqual(globalThis.__studioPageMutationHarness.invalidations, [
      {
        kind: 'field-rules',
        category: 'mouse',
        queryClient,
      },
    ]);

    await hook.runCompileFromStudio();

    assert.deepEqual(globalThis.__studioPageMutationHarness.setActiveTabCalls, [
      'reports',
    ]);
    assert.deepEqual(
      globalThis.__studioPageMutationHarness.apiCalls.map((entry) => ({
        method: entry.method,
        url: entry.url,
      })),
      [
        {
          method: 'GET',
          url: '/studio/mouse/field-studio-map',
        },
        {
          method: 'POST',
          url: '/studio/mouse/validate-field-studio-map',
        },
        {
          method: 'POST',
          url: '/studio/mouse/compile',
        },
      ],
    );
    assert.deepEqual(globalThis.__studioPageMutationHarness.setProcessStatusCalls, [
      {
        running: true,
        command: 'compile-rules',
        pid: 41,
      },
    ]);

    await hook.runEnumConsistency('dpi', {
      reviewEnabled: false,
      formatGuidance: 'keep canonical casing',
    });

    const enumCall = globalThis.__studioPageMutationHarness.apiCalls.find((entry) =>
      entry.url === '/studio/mouse/enum-consistency',
    );
    assert.deepEqual(enumCall, {
      method: 'POST',
      url: '/studio/mouse/enum-consistency',
      payload: {
        field: 'dpi',
        apply: false,
        formatGuidance: 'keep canonical casing',
        reviewEnabled: false,
      },
    });
    assert.deepEqual(globalThis.__studioPageMutationHarness.queryInvalidations, [
      { queryKey: ['enumReviewData', 'mouse'] },
      { queryKey: ['reviewProductsIndex', 'mouse'] },
      { queryKey: ['studio-known-values', 'mouse'] },
    ]);

    await hook.refreshStudioData();

    assert.equal(
      globalThis.__studioPageMutationHarness.apiCalls.some((entry) =>
        entry.method === 'POST' && entry.url === '/studio/mouse/invalidate-cache'
      ),
      true,
    );
    assert.equal(globalThis.__studioPageMutationHarness.invalidations.length, 2);
    assert.equal(globalThis.__studioPageMutationHarness.validationCalls.length, 1);
  } finally {
    delete globalThis.__studioPageMutationHarness;
  }
});
