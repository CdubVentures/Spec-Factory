import test from 'node:test';
import assert from 'node:assert/strict';
import { createCliCommandDispatcher } from '../commandDispatch.js';

function createCommandInvocation(overrides = {}) {
  return {
    config: {},
    storage: { name: 'stub-storage' },
    args: { local: true },
    ...overrides,
  };
}

test('cli command dispatcher routes command to matching handler', async () => {
  const invocation = createCommandInvocation();
  let receivedInvocation = null;

  const dispatchCliCommand = createCliCommandDispatcher({
    handlers: {
      'run-one': async ({ config, storage, args }) => {
        receivedInvocation = { config, storage, args };
        return { config, storage, args };
      }
    }
  });

  const result = await dispatchCliCommand({ command: 'run-one', ...invocation });
  assert.deepEqual(result, invocation);
  assert.equal(receivedInvocation?.config, invocation.config);
  assert.equal(receivedInvocation?.storage, invocation.storage);
  assert.equal(receivedInvocation?.args, invocation.args);
});

test('cli command dispatcher throws for unknown command', async () => {
  const dispatchCliCommand = createCliCommandDispatcher({ handlers: {} });
  await assert.rejects(
    dispatchCliCommand({ command: 'missing', config: {}, storage: {}, args: {} }),
    /Unknown command: missing/
  );
});

test('cli command dispatcher preserves handler failures', async () => {
  const expectedError = new Error('dispatcher exploded');
  const dispatchCliCommand = createCliCommandDispatcher({
    handlers: {
      fail: async () => {
        throw expectedError;
      },
    },
  });

  await assert.rejects(
    dispatchCliCommand({ command: 'fail', config: {}, storage: {}, args: {} }),
    expectedError,
  );
});
