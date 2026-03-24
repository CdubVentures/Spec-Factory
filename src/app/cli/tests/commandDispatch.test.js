import test from 'node:test';
import assert from 'node:assert/strict';
import { createCliCommandDispatcher } from '../commandDispatch.js';

function createCommandInvocation(overrides = {}) {
  return {
    config: { runProfile: 'test' },
    storage: { name: 'stub-storage' },
    args: { local: true },
    ...overrides,
  };
}

test('cli command dispatcher routes command to matching handler', async () => {
  const invocation = createCommandInvocation();

  const dispatchCliCommand = createCliCommandDispatcher({
    handlers: {
      'run-one': ({ config, storage, args }) => {
        return { config, storage, args };
      }
    }
  });

  const result = await dispatchCliCommand({ command: 'run-one', ...invocation });
  assert.deepEqual(result, invocation);
});

test('cli command dispatcher throws for unknown command', async () => {
  const dispatchCliCommand = createCliCommandDispatcher({ handlers: {} });
  await assert.rejects(
    dispatchCliCommand({ command: 'missing', config: {}, storage: {}, args: {} }),
    /Unknown command: missing/
  );
});
