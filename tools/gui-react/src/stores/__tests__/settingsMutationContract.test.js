import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBundledModule } from '../../../../../src/shared/tests/helpers/loadBundledModule.js';

async function loadContract() {
  return loadBundledModule('tools/gui-react/src/stores/settingsMutationContract.ts', {
    prefix: 'settings-mutation-contract-',
  });
}

function createQueryClientHarness(initialData = { value: 'base' }) {
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

function createDeferredCancelHarness(initialData = { value: 'base' }) {
  const harness = createQueryClientHarness(initialData);
  const cancelResolvers = [];
  harness.queryClient.cancelQueries = (args) => {
    harness.getCalls().push(['cancelQueries', args]);
    return new Promise((resolve) => {
      cancelResolvers.push(resolve);
    });
  };
  return {
    ...harness,
    resolveCancelAt(index) {
      cancelResolvers[index]?.();
    },
  };
}

function createSettingsMutationContract(createSettingsOptimisticMutationContract, harness, overrides = {}) {
  const persisted = [];
  const errors = [];
  const contract = createSettingsOptimisticMutationContract({
    queryClient: harness.queryClient,
    queryKey: ['settings'],
    mutationFn: async (payload) => ({ snapshot: payload }),
    toOptimisticData: (payload) => ({ value: payload.value }),
    toAppliedData: (response) => response.snapshot,
    toPersistedResult: (_response, payload, _previousData, appliedData) => ({
      payload,
      appliedData,
    }),
    onPersisted: (result, payload) => persisted.push({ result, payload }),
    onError: (error) => errors.push(error),
    ...overrides,
  });

  return { contract, persisted, errors };
}

test('settings mutation contract ignores stale success after a newer save applies', async () => {
  const { createSettingsOptimisticMutationContract } = await loadContract();
  const harness = createQueryClientHarness();
  const { contract, persisted } = createSettingsMutationContract(
    createSettingsOptimisticMutationContract,
    harness,
  );

  const firstContext = await contract.onMutate({ value: 'first' });
  const secondContext = await contract.onMutate({ value: 'second' });

  contract.onSuccess(
    { snapshot: { value: 'second-from-server' } },
    { value: 'second' },
    secondContext,
  );
  contract.onSuccess(
    { snapshot: { value: 'first-from-server' } },
    { value: 'first' },
    firstContext,
  );

  assert.deepEqual(harness.getQueryData(), { value: 'second-from-server' });
  assert.deepEqual(
    persisted.map((entry) => entry.payload.value),
    ['second'],
  );
});

test('settings mutation contract ignores stale optimistic writes after async query cancellation', async () => {
  const { createSettingsOptimisticMutationContract } = await loadContract();
  const harness = createDeferredCancelHarness();
  const { contract } = createSettingsMutationContract(
    createSettingsOptimisticMutationContract,
    harness,
  );

  const firstMutate = contract.onMutate({ value: 'first' });
  const secondMutate = contract.onMutate({ value: 'second' });

  harness.resolveCancelAt(1);
  await secondMutate;

  assert.deepEqual(harness.getQueryData(), { value: 'second' });

  harness.resolveCancelAt(0);
  await firstMutate;

  assert.deepEqual(harness.getQueryData(), { value: 'second' });
});

test('settings mutation contract ignores stale errors so newer optimistic data stays visible', async () => {
  const { createSettingsOptimisticMutationContract } = await loadContract();
  const harness = createQueryClientHarness();
  const { contract, errors } = createSettingsMutationContract(
    createSettingsOptimisticMutationContract,
    harness,
  );

  const firstContext = await contract.onMutate({ value: 'first' });
  await contract.onMutate({ value: 'second' });

  contract.onError(new Error('first failed late'), { value: 'first' }, firstContext);

  assert.deepEqual(harness.getQueryData(), { value: 'second' });
  assert.equal(errors.length, 0);
});

test('settings mutation contract still rolls back and reports the newest error', async () => {
  const { createSettingsOptimisticMutationContract } = await loadContract();
  const harness = createQueryClientHarness();
  const { contract, errors } = createSettingsMutationContract(
    createSettingsOptimisticMutationContract,
    harness,
  );

  const firstContext = await contract.onMutate({ value: 'first' });
  const secondContext = await contract.onMutate({ value: 'second' });

  contract.onSuccess(
    { snapshot: { value: 'first-from-server' } },
    { value: 'first' },
    firstContext,
  );
  contract.onError(new Error('second failed'), { value: 'second' }, secondContext);

  assert.deepEqual(harness.getQueryData(), { value: 'first' });
  assert.equal(errors.length, 1);
  assert.equal(errors[0].message, 'second failed');
});
