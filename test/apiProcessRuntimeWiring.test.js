import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createProcessRuntime } from '../src/app/api/processRuntime.js';

function createFakeChild(pid = 3210) {
  const child = new EventEmitter();
  child.pid = pid;
  child.exitCode = null;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.sentMessages = [];
  child.send = (message) => {
    child.sentMessages.push(message);
  };
  child.killSignals = [];
  child.kill = (signal = 'SIGTERM') => {
    child.killSignals.push(signal);
    if (child.exitCode === null) {
      child.exitCode = signal === 'SIGKILL' ? 137 : 0;
      child.emit('exit', child.exitCode, signal);
    }
  };
  return child;
}

function createCommandChild({ stdout = '', stderr = '', exitCode = 0 } = {}) {
  const child = new EventEmitter();
  child.pid = 0;
  child.exitCode = null;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => {};
  queueMicrotask(() => {
    if (stdout) child.stdout.emit('data', Buffer.from(stdout));
    if (stderr) child.stderr.emit('data', Buffer.from(stderr));
    child.exitCode = exitCode;
    child.emit('exit', exitCode, null);
  });
  return child;
}

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
      s3OutputPrefix: 'specs/outputs',
    },
    spawn: options.spawn || ((command, args, spawnOptions) => {
      spawnCalls.push({ command, args, options: spawnOptions });
      const child = createFakeChild(4200 + spawnCalls.length);
      children.push(child);
      return child;
    }),
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
    runDataStorageState: {},
    indexLabRoot: path.resolve('artifacts/indexlab'),
    outputRoot: path.resolve('out'),
    outputPrefix: 'specs/outputs',
    getSpecDbReady: async () => null,
    resolveCategoryAlias: (value) => String(value || '').trim(),
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

test('process runtime start emits process-status and preserves run-id in status payload', async () => {
  const h = createHarness();
  const status = h.runtime.startProcess('src/cli/spec.js', ['indexlab', '--run-id', 'run_12345678']);

  assert.equal(status.running, true);
  assert.equal(status.run_id, 'run_12345678');
  assert.equal(status.runId, 'run_12345678');
  assert.equal(h.spawnCalls.length, 1);
  assert.equal(h.spawnCalls[0].command, process.execPath);
  assert.equal(h.spawnCalls[0]?.options?.windowsHide, true);
  assert.equal(h.children.length, 1);

  h.children[0].stdout.emit('data', Buffer.from('line-a\n'));
  assert.equal(h.broadcasts.some((evt) => evt.channel === 'process' && Array.isArray(evt.payload) && evt.payload.includes('line-a')), true);

  h.children[0].emit('exit', 0, null);
  await new Promise((resolve) => setImmediate(resolve));

  const after = h.runtime.processStatus();
  assert.equal(after.running, false);
  assert.equal(after.run_id, 'run_12345678');
  assert.equal(after.exitCode, 0);
  assert.equal(h.compileCalls.length, 1);
  assert.equal(h.indexCalls.length, 1);
});

test('process runtime start spawns CLI from resolved project root cwd', async () => {
  const h = createHarness({ projectRoot: path.resolve('__process_runtime_project_root__') });
  h.runtime.startProcess('src/cli/spec.js', ['indexlab', '--run-id', 'run_rootcwd1']);

  assert.equal(h.spawnCalls.length, 1);
  assert.equal(h.spawnCalls[0]?.options?.cwd, h.projectRoot);
});

test('process runtime stop sends SIGTERM and confirms stop for active child process', async () => {
  const h = createHarness();
  h.runtime.startProcess('src/cli/spec.js', ['indexlab', '--run-id', 'run_abcdefgh']);
  const child = h.children[0];
  assert.ok(child);

  const stopStatus = await h.runtime.stopProcess(1500, { force: false });
  assert.equal(stopStatus.stop_attempted, true);
  assert.equal(stopStatus.stop_confirmed, true);
  assert.equal(stopStatus.orphan_killed, 0);
  assert.equal(child.killSignals.includes('SIGTERM'), true);

  const after = h.runtime.processStatus();
  assert.equal(after.running, false);
});

test('process runtime forwards screencast subscribe/unsubscribe through active child IPC', async () => {
  const h = createHarness();
  h.runtime.startProcess('src/cli/spec.js', ['indexlab', '--run-id', 'run_wsforward']);
  const child = h.children[0];
  assert.ok(child);

  const subscribeForwarded = h.runtime.forwardScreencastControl({ subscribeWorkerId: 'worker-42' });
  const unsubscribeForwarded = h.runtime.forwardScreencastControl({ unsubscribe: true });

  assert.equal(subscribeForwarded, true);
  assert.equal(unsubscribeForwarded, true);
  assert.deepEqual(child.sentMessages[0], { type: 'screencast_subscribe', worker_id: 'worker-42' });
  assert.deepEqual(child.sentMessages[1], { type: 'screencast_unsubscribe' });

  child.exitCode = 0;
  child.emit('exit', 0, null);
  await new Promise((resolve) => setImmediate(resolve));

  const inactiveForward = h.runtime.forwardScreencastControl({ unsubscribe: true });
  assert.equal(inactiveForward, false);
});

test('process runtime completion forwards storage-derived output and indexlab roots to relocation handling', async () => {
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
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(h.indexCalls.length, 1);
  assert.equal(h.indexCalls[0]?.outputRoot, expectedOutputRoot);
  assert.equal(h.indexCalls[0]?.indexLabRoot, expectedIndexLabRoot);
});

test('process runtime stop without active child does not scan or kill orphan processes by default', async () => {
  const h = createHarness({
    processRef: {
      env: {},
      execPath: process.execPath,
      platform: 'linux',
    },
    spawn: (command, args, spawnOptions) => {
      h.spawnCalls.push({ command, args, options: spawnOptions });
      return createCommandChild({ stdout: '555\n', exitCode: 0 });
    },
  });

  const stopStatus = await h.runtime.stopProcess(1500, { force: false });
  assert.equal(stopStatus.stop_attempted, false);
  assert.equal(stopStatus.stop_confirmed, true);
  assert.equal(stopStatus.orphan_killed, 0);
  assert.equal(h.spawnCalls.length, 0);
  assert.equal(h.execCalls.length, 0);
});

test('process runtime stop with force and no active child performs explicit orphan cleanup', async () => {
  const h = createHarness({
    processRef: {
      env: {},
      execPath: process.execPath,
      platform: 'win32',
    },
    spawn: (command, args, spawnOptions) => {
      h.spawnCalls.push({ command, args, options: spawnOptions });
      return createCommandChild({ stdout: '777\n', exitCode: 0 });
    },
  });

  const stopStatus = await h.runtime.stopProcess(1500, { force: true });
  assert.equal(stopStatus.stop_attempted, true);
  assert.equal(stopStatus.stop_confirmed, true);
  assert.equal(stopStatus.orphan_killed, 1);
  assert.equal(h.spawnCalls.length, 1);
  assert.equal(h.spawnCalls[0]?.command, 'powershell');
  assert.deepEqual(h.execCalls, ['taskkill /PID 777 /T /F']);
});

test('process runtime stop with stubborn active child does not scan unrelated orphans unless forced', async () => {
  let spawnCount = 0;
  const h = createHarness({
    processRef: {
      env: {},
      execPath: process.execPath,
      platform: 'linux',
    },
    setTimeoutFn: (fn) => {
      queueMicrotask(fn);
      return Symbol('timer');
    },
    clearTimeoutFn: () => {},
    spawn: (command, args, spawnOptions) => {
      spawnCount += 1;
      h.spawnCalls.push({ command, args, options: spawnOptions });
      if (spawnCount === 1) {
        const child = createFakeChild(5001);
        child.kill = (signal = 'SIGTERM') => {
          child.killSignals.push(signal);
        };
        h.children.push(child);
        return child;
      }
      return createCommandChild({ stdout: '901\n', exitCode: 0 });
    },
  });

  h.runtime.startProcess('src/cli/spec.js', ['indexlab', '--run-id', 'run_stubborn1']);
  const child = h.children[0];
  const stopStatus = await h.runtime.stopProcess(1500, { force: false });

  assert.equal(stopStatus.stop_attempted, true);
  assert.equal(stopStatus.stop_confirmed, false);
  assert.equal(stopStatus.orphan_killed, 0);
  assert.deepEqual(child.killSignals, ['SIGTERM', 'SIGKILL']);
  assert.equal(h.spawnCalls.length, 1);
  assert.equal(h.execCalls.length, 0);
});
