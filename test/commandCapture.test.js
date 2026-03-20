import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { runCommandCapture } from '../src/app/api/commandCapture.js';

// --- Contract ---
// runCommandCapture(command, args, options) → Promise<{ ok, code, stdout, stderr, error? }>
//
// options includes both runtime config (cwd, env, timeoutMs) and DI deps
// (spawn, processRef, path, setTimeoutFn, clearTimeoutFn).
//
// Invariants:
//   - ok === true iff exit code === 0
//   - code is null when process didn't exit normally
//   - Always resolves, never rejects
//   - Timeout kills process with SIGTERM, resolves with error: 'command_timeout'
//   - Spawn failure resolves with ok: false and error message

function createFakeProc({ exitCode = 0, stdout = '', stderr = '', emitError = null } = {}) {
  const proc = new EventEmitter();
  proc.pid = 9999;
  proc.exitCode = null;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.killCalls = [];
  proc.kill = (signal) => { proc.killCalls.push(signal); };
  queueMicrotask(() => {
    if (emitError) {
      proc.emit('error', emitError);
      return;
    }
    if (stdout) proc.stdout.emit('data', Buffer.from(stdout));
    if (stderr) proc.stderr.emit('data', Buffer.from(stderr));
    proc.exitCode = exitCode;
    proc.emit('exit', exitCode, null);
  });
  return proc;
}

function makeDeps(overrides = {}) {
  return {
    spawn: overrides.spawn || (() => createFakeProc()),
    processRef: overrides.processRef || { env: { TEST: '1' } },
    path: overrides.path || { resolve: (v) => v || '.' },
    setTimeoutFn: overrides.setTimeoutFn || setTimeout,
    clearTimeoutFn: overrides.clearTimeoutFn || clearTimeout,
  };
}

// --- Happy path ---

test('commandCapture resolves ok:true with exit code 0 and captured stdout', async () => {
  const deps = makeDeps({
    spawn: () => createFakeProc({ exitCode: 0, stdout: 'hello\n' }),
  });
  const result = await runCommandCapture('echo', ['hello'], deps);
  assert.equal(result.ok, true);
  assert.equal(result.code, 0);
  assert.equal(result.stdout, 'hello\n');
  assert.equal(result.stderr, '');
  assert.equal(result.error, undefined);
});

test('commandCapture resolves ok:false with nonzero exit code', async () => {
  const deps = makeDeps({
    spawn: () => createFakeProc({ exitCode: 1, stderr: 'fail\n' }),
  });
  const result = await runCommandCapture('bad', [], deps);
  assert.equal(result.ok, false);
  assert.equal(result.code, 1);
  assert.equal(result.stderr, 'fail\n');
});

// --- Spawn failure ---

test('commandCapture resolves ok:false when spawn throws', async () => {
  const deps = makeDeps({
    spawn: () => { throw new Error('spawn_failed'); },
  });
  const result = await runCommandCapture('missing', [], deps);
  assert.equal(result.ok, false);
  assert.equal(result.code, null);
  assert.equal(result.error, 'spawn_failed');
});

// --- Process error event ---

test('commandCapture resolves ok:false on process error event', async () => {
  const deps = makeDeps({
    spawn: () => createFakeProc({ emitError: new Error('ENOENT') }),
  });
  const result = await runCommandCapture('ghost', [], deps);
  assert.equal(result.ok, false);
  assert.equal(result.code, null);
  assert.equal(result.error, 'ENOENT');
});

// --- Timeout ---

test('commandCapture resolves with command_timeout error when process exceeds timeoutMs', async () => {
  const timers = [];
  const hangingProc = new EventEmitter();
  hangingProc.pid = 1;
  hangingProc.exitCode = null;
  hangingProc.stdout = new EventEmitter();
  hangingProc.stderr = new EventEmitter();
  hangingProc.killCalls = [];
  hangingProc.kill = (sig) => { hangingProc.killCalls.push(sig); };

  const deps = makeDeps({
    spawn: () => hangingProc,
    setTimeoutFn: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length;
    },
    clearTimeoutFn: () => {},
  });

  const promise = runCommandCapture('hang', [], { ...deps, timeoutMs: 1_000 });
  // Fire the timeout callback
  assert.ok(timers.length >= 1);
  timers[0].fn();

  const result = await promise;
  assert.equal(result.ok, false);
  assert.equal(result.error, 'command_timeout');
  assert.ok(hangingProc.killCalls.includes('SIGTERM'));
});

// --- Null/empty exit code ---

test('commandCapture treats null exit code as ok:false with code:null', async () => {
  const proc = new EventEmitter();
  proc.pid = 1;
  proc.exitCode = null;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = () => {};
  queueMicrotask(() => { proc.emit('exit', null, 'SIGTERM'); });

  const deps = makeDeps({ spawn: () => proc });
  const result = await runCommandCapture('killed', [], deps);
  assert.equal(result.ok, false);
  assert.equal(result.code, null);
});

// --- DI wiring: cwd and env pass through to spawn ---

test('commandCapture passes cwd and env from options to spawn', async () => {
  const spawnCalls = [];
  const deps = makeDeps({
    spawn: (cmd, args, opts) => {
      spawnCalls.push(opts);
      return createFakeProc();
    },
  });
  await runCommandCapture('test', [], { ...deps, cwd: '/custom', env: { CUSTOM: '1' } });
  assert.equal(spawnCalls[0].cwd, '/custom');
  assert.deepEqual(spawnCalls[0].env, { CUSTOM: '1' });
});

test('commandCapture defaults cwd from path.resolve and env from processRef.env', async () => {
  const spawnCalls = [];
  const deps = makeDeps({
    spawn: (cmd, args, opts) => {
      spawnCalls.push(opts);
      return createFakeProc();
    },
    path: { resolve: () => '/default' },
    processRef: { env: { DEFAULT: '1' } },
  });
  await runCommandCapture('test', [], deps);
  assert.equal(spawnCalls[0].cwd, '/default');
  assert.deepEqual(spawnCalls[0].env, { DEFAULT: '1' });
});

// --- timeoutMs floor ---

test('commandCapture enforces minimum timeoutMs of 1000', async () => {
  const timers = [];
  const deps = makeDeps({
    spawn: () => createFakeProc(),
    setTimeoutFn: (fn, ms) => {
      timers.push({ fn, ms });
      return 1;
    },
    clearTimeoutFn: () => {},
  });
  await runCommandCapture('fast', [], { ...deps, timeoutMs: 100 });
  assert.ok(timers.length >= 1);
  assert.ok(timers[0].ms >= 1000);
});
