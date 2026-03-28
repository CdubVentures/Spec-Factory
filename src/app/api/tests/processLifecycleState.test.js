import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialProcessState,
  processStateReducer,
  deriveProcessStatus,
  normalizeRunIdToken,
  resolveProcessStorageDestination,
} from '../processLifecycleState.js';

const STARTED_PAYLOAD = {
  pid: 1234,
  command: 'node src/cli/spec.js indexlab',
  startedAt: '2026-03-20T10:00:00.000Z',
  runId: 'run_test1234',
  category: 'mouse',
  productId: 'mouse-razer-viper',
  brand: 'Razer',
  model: 'Viper V3 Pro',
  variant: 'White',
  storageDestination: 's3',
};

function reduceLifecycle(actions) {
  return actions.reduce(
    (state, action) => processStateReducer(state, action),
    createInitialProcessState(),
  );
}

describe('process lifecycle status contract', () => {
  test('drives the public status surface from start through exit to idle', () => {
    const running = reduceLifecycle([
      { type: 'PROCESS_STARTED', payload: STARTED_PAYLOAD },
    ]);

    assert.deepEqual(deriveProcessStatus(running, {}), {
      running: true,
      run_id: 'run_test1234',
      runId: 'run_test1234',
      category: 'mouse',
      product_id: 'mouse-razer-viper',
      productId: 'mouse-razer-viper',
      brand: 'Razer',
      model: 'Viper V3 Pro',
      variant: 'White',
      storage_destination: 's3',
      storageDestination: 's3',
      pid: 1234,
      command: 'node src/cli/spec.js indexlab',
      startedAt: '2026-03-20T10:00:00.000Z',
      exitCode: null,
      endedAt: null,
    });

    const exited = processStateReducer(running, {
      type: 'PROCESS_EXITED',
      payload: { exitCode: 0, endedAt: '2026-03-20T10:05:00.000Z' },
    });
    assert.equal(exited.phase, 'idle');
    const exitedStatus = deriveProcessStatus(exited, {});
    assert.equal(exitedStatus.running, false);
    assert.equal(exitedStatus.exitCode, 0);
    assert.equal(exitedStatus.endedAt, '2026-03-20T10:05:00.000Z');
    assert.equal(exitedStatus.runId, 'run_test1234');
  });

  test('ignores invalid lifecycle actions instead of changing state', () => {
    const idle = createInitialProcessState();
    const running = reduceLifecycle([
      { type: 'PROCESS_STARTED', payload: STARTED_PAYLOAD },
    ]);

    const cases = [
      [idle, { type: 'PROCESS_EXITED', payload: { exitCode: 1 } }],
      [running, { type: 'PROCESS_STARTED', payload: { ...STARTED_PAYLOAD, pid: 9999 } }],
    ];

    for (const [state, action] of cases) {
      assert.equal(processStateReducer(state, action), state);
    }
  });

  test('resolves public storage destination from snapshot first, then runtime settings, then local default', () => {
    const snapshotStatus = deriveProcessStatus(
      reduceLifecycle([
        { type: 'PROCESS_STARTED', payload: STARTED_PAYLOAD },
      ]),
      {
        runDataStorageState: { enabled: true, destinationType: 'local' },
      },
    );
    assert.equal(snapshotStatus.storageDestination, 's3');
    assert.equal(snapshotStatus.storage_destination, 's3');

    const runtimeFallbackStatus = deriveProcessStatus(
      reduceLifecycle([
        {
          type: 'PROCESS_STARTED',
          payload: { ...STARTED_PAYLOAD, storageDestination: null },
        },
      ]),
      {
        runDataStorageState: { enabled: true, destinationType: 's3' },
      },
    );
    assert.equal(runtimeFallbackStatus.storageDestination, 's3');
    assert.equal(runtimeFallbackStatus.storage_destination, runtimeFallbackStatus.storageDestination);

    const defaultStatus = deriveProcessStatus(
      reduceLifecycle([
        {
          type: 'PROCESS_STARTED',
          payload: { ...STARTED_PAYLOAD, storageDestination: null },
        },
      ]),
      {},
    );
    assert.equal(defaultStatus.storageDestination, 'local');
  });
});

describe('run id token contract', () => {
  test('accepts valid public run ids and rejects malformed tokens', () => {
    const cases = [
      ['run_test1234', 'run_test1234'],
      ['20260320-abcd1234', '20260320-abcd1234'],
      [null, ''],
      ['short', ''],
      ['a'.repeat(97), ''],
      ['run id spaces', ''],
      ['run@special!', ''],
    ];

    for (const [input, expected] of cases) {
      assert.equal(normalizeRunIdToken(input), expected);
    }
  });
});

describe('storage destination resolution contract', () => {
  test('normalizes enabled destinations and defaults everything else to local', () => {
    const cases = [
      [null, 'local'],
      [undefined, 'local'],
      ['string', 'local'],
      [{ enabled: false }, 'local'],
      [{ enabled: true, destinationType: 's3' }, 's3'],
      [{ enabled: true, destinationType: 'local' }, 'local'],
      [{ enabled: true, destinationType: 'S3' }, 's3'],
    ];

    for (const [input, expected] of cases) {
      assert.equal(resolveProcessStorageDestination(input), expected);
    }
  });
});
