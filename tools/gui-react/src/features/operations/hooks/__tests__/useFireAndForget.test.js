import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

async function loadUseFireAndForgetModule() {
  return loadBundledModule(
    'tools/gui-react/src/features/operations/hooks/useFireAndForget.ts',
    {
      prefix: 'use-fire-and-forget-',
      stubs: {
        react: `
          export function useCallback(fn) {
            return fn;
          }
        `,
        '../../../api/client.ts': `
          export const api = {
            post(url, body) {
              return globalThis.__useFireAndForgetHarness.post(url, body);
            },
          };
        `,
        '../state/operationsStore.ts': `
          export function useOperationsStore(selector) {
            return selector(globalThis.__useFireAndForgetHarness.store);
          }
          useOperationsStore.getState = function getState() {
            return globalThis.__useFireAndForgetHarness.store;
          };
        `,
      },
    },
  );
}

function createHarness(overrides = {}) {
  const operations = new Map();
  const calls = [];
  const store = {
    operations,
    upsert(operation) {
      calls.push({ type: 'upsert', operation });
      operations.set(operation.id, {
        ...(operations.get(operation.id) ?? {}),
        ...operation,
      });
    },
    remove(id) {
      calls.push({ type: 'remove', id });
      operations.delete(id);
    },
  };
  return {
    calls,
    operations,
    store,
    post: async () => ({ ok: true, operationId: 'op-real' }),
    ...overrides,
  };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

test('useFireAndForget keeps failed optimistic operation visible as an error', async () => {
  globalThis.__useFireAndForgetHarness = createHarness({
    post: async () => {
      throw new Error('API 503: offline');
    },
  });

  try {
    const { useFireAndForget } = await loadUseFireAndForgetModule();
    const fire = useFireAndForget({ type: 'pif', category: 'mouse', productId: 'mouse-1' });

    fire('/product-image-finder/mouse/mouse-1', {}, { subType: 'loop', variantKey: 'color:black' });
    await flushPromises();

    const operations = [...globalThis.__useFireAndForgetHarness.operations.values()];
    assert.equal(operations.length, 1);
    assert.equal(operations[0].id.startsWith('_pending_'), true);
    assert.equal(operations[0].status, 'error');
    assert.equal(operations[0].error, 'API 503: offline');
    assert.equal(typeof operations[0].endedAt, 'string');
    assert.equal(operations[0].variantKey, 'color:black');
    assert.equal(
      globalThis.__useFireAndForgetHarness.calls.some((call) => call.type === 'remove'),
      false,
    );
  } finally {
    delete globalThis.__useFireAndForgetHarness;
  }
});

