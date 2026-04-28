import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

function createQueryClientHarness(initialData) {
  let queryData = initialData;
  const calls = [];

  return {
    queryClient: {
      async cancelQueries(args) {
        calls.push(['cancelQueries', args]);
      },
      getQueryData(queryKey) {
        calls.push(['getQueryData', queryKey]);
        return queryData;
      },
      setQueryData(queryKey, nextData) {
        calls.push(['setQueryData', queryKey, nextData]);
        queryData = nextData;
      },
      invalidateQueries(args) {
        calls.push(['invalidateQueries', args]);
      },
      removeQueries(args) {
        calls.push(['removeQueries', args]);
        queryData = undefined;
      },
    },
    getQueryData() {
      return queryData;
    },
    getCalls() {
      return calls;
    },
  };
}

async function loadAuthority(harness) {
  globalThis.__moduleSettingsAuthorityHarness = {
    queryClient: harness.queryClient,
    queryData: harness.getQueryData(),
    mutatedPayloads: [],
    mutationOptions: null,
    queryOptions: null,
  };

  const mod = await loadBundledModule(
    'tools/gui-react/src/features/pipeline-settings/state/moduleSettingsAuthority.ts',
    {
      prefix: 'module-settings-authority-',
      stubs: {
        '@tanstack/react-query': `
          export function useQueryClient() {
            return globalThis.__moduleSettingsAuthorityHarness.queryClient;
          }
          export function useQuery(options) {
            globalThis.__moduleSettingsAuthorityHarness.queryOptions = options;
            return {
              data: globalThis.__moduleSettingsAuthorityHarness.queryData,
              isLoading: false,
              error: null,
            };
          }
          export function useMutation(options) {
            globalThis.__moduleSettingsAuthorityHarness.mutationOptions = options;
            return {
              mutate(payload) {
                globalThis.__moduleSettingsAuthorityHarness.mutatedPayloads.push(payload);
              },
              isPending: false,
            };
          }
        `,
        '../../../api/client': `
          export const api = {
            get: async () => ({}),
            put: async (_url, body) => ({
              category: 'mouse',
              module: 'customFinder',
              settings: body.settings,
            }),
          };
        `,
      },
    },
  );

  return mod;
}

test('module settings authority optimistically merges partial setting saves into existing cache data', async () => {
  const initialResponse = {
    category: 'mouse',
    scope: 'category',
    module: 'customFinder',
    settings: {
      heroEnabled: 'true',
      satisfactionThreshold: '0.65',
    },
  };
  const harness = createQueryClientHarness(initialResponse);
  const { useModuleSettingsAuthority } = await loadAuthority(harness);

  const authority = useModuleSettingsAuthority({
    category: 'mouse',
    moduleId: 'customFinder',
  });
  authority.saveSetting('heroEnabled', 'false');

  assert.deepEqual(
    globalThis.__moduleSettingsAuthorityHarness.mutatedPayloads,
    [{ heroEnabled: 'false' }],
  );
  assert.equal(
    typeof globalThis.__moduleSettingsAuthorityHarness.mutationOptions.onMutate,
    'function',
  );

  await globalThis.__moduleSettingsAuthorityHarness.mutationOptions.onMutate({
    heroEnabled: 'false',
  });

  assert.deepEqual(harness.getQueryData(), {
    category: 'mouse',
    scope: 'category',
    module: 'customFinder',
    settings: {
      heroEnabled: 'false',
      satisfactionThreshold: '0.65',
    },
  });
});

test('module settings authority creates optimistic cache data when a setting is saved before fetch resolves', async () => {
  const harness = createQueryClientHarness(undefined);
  const { useModuleSettingsAuthority } = await loadAuthority(harness);

  useModuleSettingsAuthority({
    category: 'mouse',
    moduleId: 'customFinder',
  });

  assert.equal(
    typeof globalThis.__moduleSettingsAuthorityHarness.mutationOptions.onMutate,
    'function',
  );

  await globalThis.__moduleSettingsAuthorityHarness.mutationOptions.onMutate({
    heroEnabled: 'false',
  });

  assert.deepEqual(harness.getQueryData(), {
    category: 'mouse',
    scope: 'category',
    module: 'customFinder',
    settings: {
      heroEnabled: 'false',
    },
  });
});

test('module settings authority invalidates module consumers after persisted save', async () => {
  const initialResponse = {
    category: 'mouse',
    scope: 'category',
    module: 'productImageFinder',
    settings: {
      carouselExtraTarget: '3',
    },
  };
  const harness = createQueryClientHarness(initialResponse);
  const { useModuleSettingsAuthority } = await loadAuthority(harness);

  useModuleSettingsAuthority({
    category: 'mouse',
    moduleId: 'productImageFinder',
  });

  const payload = { carouselExtraTarget: '5' };
  const context = await globalThis.__moduleSettingsAuthorityHarness.mutationOptions.onMutate(payload);
  globalThis.__moduleSettingsAuthorityHarness.mutationOptions.onSuccess(
    { ok: true, category: 'mouse', module: 'productImageFinder', settings: payload },
    payload,
    context,
    {},
  );

  const invalidated = harness.getCalls()
    .filter(([name]) => name === 'invalidateQueries')
    .map(([, args]) => args.queryKey);

  assert.ok(
    invalidated.some((queryKey) => JSON.stringify(queryKey) === JSON.stringify(['module-settings'])),
    'module-settings query family must be invalidated',
  );
  assert.ok(
    invalidated.some((queryKey) => JSON.stringify(queryKey) === JSON.stringify(['product-image-finder', 'mouse'])),
    'PIF panel query family must be invalidated',
  );
  assert.ok(
    invalidated.some((queryKey) => JSON.stringify(queryKey) === JSON.stringify(['catalog', 'mouse'])),
    'overview catalog rows must be invalidated',
  );
});
