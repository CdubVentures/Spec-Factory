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

function createHarness() {
  const broadcasts = [];
  const spawnCalls = [];
  const compileCalls = [];
  const indexCalls = [];
  const children = [];

  const runtime = createProcessRuntime({
    resolveProjectPath: (value) => path.resolve(String(value || '.')),
    path,
    fsSync: {
      existsSync: () => false,
    },
    config: {
      searxngBaseUrl: '',
      s3OutputPrefix: 'specs/outputs',
    },
    spawn: (command, args, options) => {
      spawnCalls.push({ command, args, options });
      const child = createFakeChild(4200 + spawnCalls.length);
      children.push(child);
      return child;
    },
    execCb: () => {},
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
  });

  return {
    runtime,
    broadcasts,
    spawnCalls,
    compileCalls,
    indexCalls,
    children,
  };
}

test('process runtime start emits process-status and preserves run-id in status payload', async () => {
  const h = createHarness();
  const status = h.runtime.startProcess('src/cli/spec.js', ['indexlab', '--run-id', 'run_12345678']);

  assert.equal(status.running, true);
  assert.equal(status.run_id, 'run_12345678');
  assert.equal(status.runId, 'run_12345678');
  assert.equal(h.spawnCalls.length, 1);
  assert.equal(h.spawnCalls[0].command, 'node');
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
