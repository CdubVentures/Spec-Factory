import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

async function loadStudioPersistenceAuthorityModule() {
  return loadBundledModule(
    'tools/gui-react/src/features/studio/state/studioPersistenceAuthority.ts',
    {
      prefix: 'studio-persistence-authority-',
      stubs: {
        '@tanstack/react-query': `
          export function useQueryClient() {
            return globalThis.__studioPersistenceAuthorityHarness.queryClient;
          }
          export function useMutation(options) {
            globalThis.__studioPersistenceAuthorityHarness.mutationOptions.push(options);
            return {
              isPending: false,
              isSuccess: false,
              isError: false,
              error: null,
              mutate(payload) {
                globalThis.__studioPersistenceAuthorityHarness.mutatedPayloads.push(payload);
              },
            };
          }
        `,
        '../../../api/client.ts': `
          export const api = {
            put(path, body) {
              globalThis.__studioPersistenceAuthorityHarness.apiCalls.push({ path, body });
              return Promise.resolve(globalThis.__studioPersistenceAuthorityHarness.apiResponse);
            },
          };
        `,
      },
    },
  );
}

function createHarness() {
  const harness = {
    apiCalls: [],
    apiResponse: undefined,
    invalidations: [],
    mutationOptions: [],
    mutatedPayloads: [],
    savedCallbacks: 0,
    setCalls: [],
    cachedStudioConfig: null,
    queryClient: {
      getQueryData(queryKey) {
        if (queryKey[0] === 'studio-config') return harness.cachedStudioConfig;
        return undefined;
      },
      setQueryData(queryKey, value) {
        harness.setCalls.push({ queryKey, value });
      },
      invalidateQueries(options) {
        harness.invalidations.push(options);
      },
    },
  };
  globalThis.__studioPersistenceAuthorityHarness = harness;
  return harness;
}

test('studio map save patches the exact studio-config cache from the server entity', async () => {
  const harness = createHarness();
  try {
    const { useStudioPersistenceAuthority } = await loadStudioPersistenceAuthorityModule();
    useStudioPersistenceAuthority({ category: 'mouse' });

    const response = {
      file_path: 'specDb:mouse',
      map_hash: 'hash-1',
      map: { field_mapping: [{ key: 'dpi' }] },
    };
    harness.mutationOptions[0].onSuccess({ skipped: false, response });

    assert.deepEqual(harness.setCalls, [
      {
        queryKey: ['studio-config', 'mouse'],
        value: response,
      },
    ]);
    assert.deepEqual(harness.invalidations, []);
  } finally {
    delete globalThis.__studioPersistenceAuthorityHarness;
  }
});

test('studio map save skips stale empty mapping payloads before the API boundary', async () => {
  const harness = createHarness();
  try {
    const { useStudioPersistenceAuthority } = await loadStudioPersistenceAuthorityModule();
    useStudioPersistenceAuthority({ category: 'mouse' });
    harness.cachedStudioConfig = {
      file_path: 'specDb:mouse',
      map_hash: 'hash-existing',
      map: {
        component_sources: [{ component_type: 'sensor' }],
        data_lists: [{ field: 'sensor_brand' }],
      },
    };

    const result = await harness.mutationOptions[0].mutationFn({
      selected_keys: [],
      field_overrides: {},
    });
    harness.mutationOptions[0].onSuccess(result);

    assert.deepEqual(harness.apiCalls, []);
    assert.deepEqual(harness.setCalls, []);
    assert.equal(result.skipped, true);
    assert.deepEqual(result.response, harness.cachedStudioConfig);
  } finally {
    delete globalThis.__studioPersistenceAuthorityHarness;
  }
});

test('studio map save preserves cached component sources on stale partial mapping payloads', async () => {
  const harness = createHarness();
  try {
    const { useStudioPersistenceAuthority } = await loadStudioPersistenceAuthorityModule();
    useStudioPersistenceAuthority({ category: 'mouse' });
    harness.cachedStudioConfig = {
      file_path: 'specDb:mouse',
      map_hash: 'hash-existing',
      map: {
        component_sources: [
          { component_type: 'sensor', roles: { properties: [] } },
          { component_type: 'switch', roles: { properties: [] } },
        ],
        data_lists: [{ field: 'sensor_brand' }],
      },
    };

    await harness.mutationOptions[0].mutationFn({
      component_sources: [],
      data_lists: [{ field: 'connection' }],
    });

    assert.deepEqual(harness.apiCalls, [
      {
        path: '/studio/mouse/field-studio-map',
        body: {
          component_sources: [
            { component_type: 'sensor', roles: { properties: [] } },
            { component_type: 'switch', roles: { properties: [] } },
          ],
          data_lists: [{ field: 'connection' }],
        },
      },
    ]);
  } finally {
    delete globalThis.__studioPersistenceAuthorityHarness;
  }
});

test('studio docs save patches studio-config and preserves the save callback', async () => {
  const harness = createHarness();
  try {
    const { useStudioPersistenceAuthority } = await loadStudioPersistenceAuthorityModule();
    useStudioPersistenceAuthority({
      category: 'mouse',
      onStudioDocsSaved: () => {
        harness.savedCallbacks += 1;
      },
    });

    const response = {
      file_path: 'specDb:mouse',
      map_hash: 'hash-2',
      map: { field_mapping: [{ key: 'lift' }] },
    };
    harness.mutationOptions[1].onSuccess({ skipped: false, response });

    assert.deepEqual(harness.setCalls, [
      {
        queryKey: ['studio-config', 'mouse'],
        value: response,
      },
    ]);
    assert.equal(harness.savedCallbacks, 1);
    assert.deepEqual(harness.invalidations, []);
  } finally {
    delete globalThis.__studioPersistenceAuthorityHarness;
  }
});
