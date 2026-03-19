import test from 'node:test';
import assert from 'node:assert/strict';
import { createCliCommandDispatcher } from '../../../src/app/cli/commandDispatch.js';

test('cli command dispatcher routes command to matching handler', async () => {
  const config = { runProfile: 'test' };
  const storage = { name: 'stub-storage' };
  const args = { local: true };
  let seen = null;

  const dispatchCliCommand = createCliCommandDispatcher({
    handlers: {
      'run-one': ({ config, storage, args }) => {
        seen = { config, storage, args };
        return { ok: true };
      }
    }
  });

  const result = await dispatchCliCommand({ command: 'run-one', config, storage, args });
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(seen, { config, storage, args });
});

test('cli command dispatcher throws for unknown command', async () => {
  const dispatchCliCommand = createCliCommandDispatcher({ handlers: {} });
  await assert.rejects(
    dispatchCliCommand({ command: 'missing', config: {}, storage: {}, args: {} }),
    /Unknown command: missing/
  );
});
