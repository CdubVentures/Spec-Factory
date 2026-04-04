import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createProcessRuntime } from '../processRuntime.js';
import {
  createFakeChild,
  createCommandChild,
} from './helpers/appApiTestBuilders.js';

function createHarness(options = {}) {
  const broadcasts = [];
  const spawnCalls = [];
  const compileCalls = [];
  const indexCalls = [];
  const children = [];
  const execCalls = [];
  const projectRoot = path.resolve(String(options.projectRoot || '.'));

  const runtime = createProcessRuntime({
    resolveProjectPath: (value) => path.resolve(projectRoot, String(value || '.')),
    path,
    fsSync: {
      existsSync: () => false,
    },
    config: {
      searxngBaseUrl: '',
    },
    spawn: (command, args, spawnOptions) => {
      spawnCalls.push({ command, args, options: spawnOptions });
      const child = options.spawn
        ? options.spawn(command, args, spawnOptions)
        : createFakeChild(4200 + spawnCalls.length);
      children.push(child);
      return child;
    },
    execCb: options.execCb || ((command, cb) => {
      execCalls.push(command);
      if (typeof cb === 'function') cb(null);
    }),
    broadcastWs: (channel, payload) => {
      broadcasts.push({ channel, payload });
    },
    sessionCache: {
      invalidateSessionCache: () => {},
    },
    invalidateFieldRulesCache: () => {},
    reviewLayoutByCategory: new Map(),
    syncSpecDbForCategory: async ({ category }) => ({ ok: true, category }),
    handleCompileProcessCompletion: async (payload) => {
      compileCalls.push(payload);
    },
    handleIndexLabProcessCompletion: async (payload) => {
      indexCalls.push(payload);
    },
    indexLabRoot: path.resolve('artifacts/indexlab'),
    outputRoot: path.resolve('out'),
    outputPrefix: 'specs/outputs',
    logger: { error: () => {} },
    processRef: options.processRef || process,
    setTimeoutFn: options.setTimeoutFn,
    clearTimeoutFn: options.clearTimeoutFn,
  });

  return {
    runtime,
    broadcasts,
    spawnCalls,
    compileCalls,
    indexCalls,
    children,
    execCalls,
    projectRoot,
  };
}

async function flushProcessLifecycle() {
  await new Promise((resolve) => setImmediate(resolve));
}

test('process runtime start publishes run metadata and preserves the completed status contract', async () => {
  const h = createHarness();

  const status = h.runtime.startProcess(
    'src/cli/spec.js',
    [
      'indexlab',
      '--run-id', '20260318061504-16a0b3',
      '--category', 'mouse',
      '--product-id', 'mouse-razer-viper-v3-pro-white',
      '--brand', 'Razer',
      '--model', 'Viper V3 Pro',
      '--variant', 'White',
    ],
  );

  assert.equal(h.spawnCalls.length, 1);
  assert.equal(h.spawnCalls[0].command, process.execPath);
  assert.deepEqual(h.spawnCalls[0].args, [
    'src/cli/spec.js',
    'indexlab',
    '--run-id', '20260318061504-16a0b3',
    '--category', 'mouse',
    '--product-id', 'mouse-razer-viper-v3-pro-white',
    '--brand', 'Razer',
    '--model', 'Viper V3 Pro',
    '--variant', 'White',
  ]);
  assert.equal(h.spawnCalls[0].options.cwd, h.projectRoot);
  assert.deepEqual(h.spawnCalls[0].options.stdio, ['ignore', 'pipe', 'pipe', 'ipc']);
  assert.equal(h.spawnCalls[0].options.windowsHide, true);
  assert.equal(h.spawnCalls[0].options.env.PATH, process.env.PATH);
  assert.deepEqual(status, {
    running: true,
    pid: 4201,
    command: `${process.execPath} src/cli/spec.js indexlab --run-id 20260318061504-16a0b3 --category mouse --product-id mouse-razer-viper-v3-pro-white --brand Razer --model Viper V3 Pro --variant White`,
    startedAt: status.startedAt,
    exitCode: null,
    endedAt: null,
    run_id: '20260318061504-16a0b3',
    runId: '20260318061504-16a0b3',
    category: 'mouse',
    product_id: 'mouse-razer-viper-v3-pro-white',
    productId: 'mouse-razer-viper-v3-pro-white',
    brand: 'Razer',
    base_model: 'Viper V3 Pro',
    model: 'Viper V3 Pro',
    variant: 'White',
    storage_destination: 'local',
    storageDestination: 'local',
  });
  assert.match(status.startedAt, /^\d{4}-\d{2}-\d{2}T/);

  h.children[0].stdout.emit('data', Buffer.from('line-a\n'));
  assert.deepEqual(
    h.broadcasts.find((event) => event.channel === 'process' && event.payload.includes('line-a')),
    { channel: 'process', payload: ['line-a'] },
  );

  h.children[0].emit('exit', 0, null);
  await flushProcessLifecycle();

  const after = h.runtime.processStatus();
  assert.equal(after.running, false);
  assert.equal(after.exitCode, 0);
  assert.equal(after.run_id, '20260318061504-16a0b3');
  assert.equal(after.category, 'mouse');
  assert.equal(after.product_id, 'mouse-razer-viper-v3-pro-white');
  assert.equal(after.brand, 'Razer');
  assert.equal(after.model, 'Viper V3 Pro');
  assert.equal(after.variant, 'White');
  assert.equal(after.storage_destination, 'local');
  assert.equal(h.compileCalls.length, 1);
  assert.equal(h.indexCalls.length, 1);
  assert.equal(h.compileCalls[0]?.exitCode, 0);
  assert.equal(h.indexCalls[0]?.exitCode, 0);
});

test('process runtime stop returns a confirmed stop status for an active child', async () => {
  const h = createHarness();
  h.runtime.startProcess('src/cli/spec.js', ['indexlab', '--run-id', 'run_abcdefgh']);

  const stopStatus = await h.runtime.stopProcess(1500, { force: false });
  assert.equal(stopStatus.stop_attempted, true);
  assert.equal(stopStatus.stop_confirmed, true);
  assert.equal(stopStatus.orphan_killed, 0);
  assert.equal(h.runtime.processStatus().running, false);
});

test('process runtime forwards screencast subscribe and unsubscribe only while the child is active', async () => {
  const h = createHarness();
  h.runtime.startProcess('src/cli/spec.js', ['indexlab', '--run-id', 'run_wsforward']);
  const child = h.children[0];

  const subscribeForwarded = h.runtime.forwardScreencastControl({ subscribeWorkerId: 'worker-42' });
  const unsubscribeForwarded = h.runtime.forwardScreencastControl({ unsubscribe: true });

  assert.equal(subscribeForwarded, true);
  assert.equal(unsubscribeForwarded, true);
  assert.deepEqual(child.sentMessages[0], { type: 'screencast_subscribe', worker_id: 'worker-42' });
  assert.deepEqual(child.sentMessages[1], { type: 'screencast_unsubscribe' });

  child.exitCode = 0;
  child.emit('exit', 0, null);
  await flushProcessLifecycle();

  assert.equal(h.runtime.forwardScreencastControl({ unsubscribe: true }), false);
});

test('process runtime completion forwards storage-derived output and indexlab roots', async () => {
  const h = createHarness();
  const storageRoot = path.resolve('C:/SpecFactoryRuns');
  const expectedOutputRoot = path.join(storageRoot, 'output');
  const expectedIndexLabRoot = path.join(storageRoot, 'indexlab');

  h.runtime.startProcess(
    'src/cli/spec.js',
    ['indexlab', '--run-id', 'run_storage_root1', '--out', expectedIndexLabRoot],
    {
      LOCAL_OUTPUT_ROOT: expectedOutputRoot,
    },
  );

  h.children[0].emit('exit', 0, null);
  await flushProcessLifecycle();

  assert.equal(h.indexCalls.length, 1);
  assert.equal(h.indexCalls[0]?.indexLabRoot, expectedIndexLabRoot);
});

test('process runtime non-zero exit skips compile completion but still reports the failed run', async () => {
  const h = createHarness();

  h.runtime.startProcess(
    'src/cli/spec.js',
    ['indexlab', '--run-id', 'run_failed01', '--category', 'mouse'],
  );

  h.children[0].stderr.emit('data', Buffer.from('fatal-line\n'));
  h.children[0].emit('exit', 1, 'SIGTERM');
  await flushProcessLifecycle();

  const after = h.runtime.processStatus();
  assert.equal(after.running, false);
  assert.equal(after.exitCode, 1);
  assert.equal(after.run_id, 'run_failed01');
  assert.equal(after.category, 'mouse');
  assert.equal(h.compileCalls.length, 0);
  assert.equal(h.indexCalls.length, 1);
  assert.equal(h.indexCalls[0]?.exitCode, 1);
  assert.deepEqual(
    h.broadcasts.find((event) => event.channel === 'process' && event.payload.includes('fatal-line')),
    { channel: 'process', payload: ['fatal-line'] },
  );
  assert.deepEqual(
    h.broadcasts.find((event) =>
      event.channel === 'process'
      && event.payload.some((line) => line.includes('[process exited with code 1 signal SIGTERM]'))),
    { channel: 'process', payload: ['[process exited with code 1 signal SIGTERM]'] },
  );
});

test('process runtime force stop reports orphan cleanup through the returned status', async () => {
  const h = createHarness({
    processRef: {
      env: {},
      execPath: process.execPath,
      platform: 'win32',
    },
    spawn: () => createCommandChild({ stdout: '777\n', exitCode: 0 }),
  });

  const stopStatus = await h.runtime.stopProcess(1500, { force: true });
  assert.equal(stopStatus.stop_attempted, true);
  assert.equal(stopStatus.stop_confirmed, true);
  assert.equal(stopStatus.orphan_killed, 1);
});
