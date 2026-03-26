import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createSearxngRuntime } from '../searxngRuntime.js';

// --- Contract: createSearxngRuntime ---
// Factory/DI pattern. Returns { getSearxngStatus, startSearxngStack }.
//
// getSearxngStatus() → object with keys:
//   container_name, compose_path, compose_file_exists, base_url,
//   docker_available, container_found, running, status, ports,
//   http_ready, http_status, can_start, needs_start, message,
//   docker_error?, http_error?
//
// message is one of: 'docker_not_available', 'compose_file_missing',
//   'stopped', 'container_running_http_unready', 'ready'
//
// startSearxngStack() → { ok, error?, started?, compose_stdout?, status }
//   - ok:false if compose file missing
//   - ok:false if docker compose up fails
//   - polls up to 10 times with 800ms sleep

function createHarness(overrides = {}) {
  const commandCalls = [];
  const fetchCalls = [];
  const sleepCalls = [];
  const timeoutCalls = [];
  const clearTimeoutCalls = [];
  const runCommandCaptureImpl = overrides.runCommandCapture || (() => ({ ok: false, stdout: '', stderr: '' }));
  const fetchImpl = typeof overrides.fetchImpl === 'function'
    ? async (url, options) => {
      fetchCalls.push({ url, options });
      return overrides.fetchImpl(url, options);
    }
    : (overrides.fetchImpl ?? null);
  const setTimeoutImpl = overrides.setTimeoutFn || ((fn, ms) => ({ fn, ms }));
  const clearTimeoutImpl = overrides.clearTimeoutFn || (() => {});
  const sleepImpl = overrides.sleep || (() => Promise.resolve());

  const runtime = createSearxngRuntime({
    config: overrides.config || { searxngBaseUrl: '' },
    processRef: overrides.processRef || { env: {} },
    fsSync: overrides.fsSync || { existsSync: () => false },
    resolveProjectPath: overrides.resolveProjectPath || ((v) => path.resolve('/project', String(v || '.'))),
    path,
    fetchImpl,
    setTimeoutFn: (fn, ms) => {
      const token = setTimeoutImpl(fn, ms);
      if (!timeoutCalls.some((entry) => entry.token === token)) {
        timeoutCalls.push({ ms, token });
      }
      return token;
    },
    clearTimeoutFn: (token) => {
      clearTimeoutCalls.push(token);
      return clearTimeoutImpl(token);
    },
    runCommandCapture: (cmd, args, opts) => {
      commandCalls.push({ cmd, args, opts });
      return runCommandCaptureImpl(cmd, args, opts);
    },
    sleep: (ms) => {
      sleepCalls.push(ms);
      return sleepImpl(ms);
    },
  });

  return { runtime, commandCalls, fetchCalls, sleepCalls, timeoutCalls, clearTimeoutCalls };
}

// --- getSearxngStatus: docker not available ---

test('searxng status returns docker_not_available when docker --version fails', async () => {
  const { runtime } = createHarness({
    runCommandCapture: () => ({ ok: false, stdout: '', stderr: 'not found' }),
  });
  const status = await runtime.getSearxngStatus();
  assert.equal(status.docker_available, false);
  assert.equal(status.message, 'docker_not_available');
  assert.equal(status.running, false);
  assert.equal(status.http_ready, false);
  assert.equal(status.container_name, 'spec-harvester-searxng');
});

// --- getSearxngStatus: compose file missing ---

test('searxng status returns compose_file_missing when docker is available but compose file absent', async () => {
  let callCount = 0;
  const { runtime } = createHarness({
    fsSync: { existsSync: () => false },
    runCommandCapture: () => {
      callCount += 1;
      if (callCount === 1) return { ok: true, stdout: 'Docker version 24.0' };
      return { ok: true, stdout: '' };
    },
  });
  const status = await runtime.getSearxngStatus();
  assert.equal(status.docker_available, true);
  assert.equal(status.compose_file_exists, false);
  assert.equal(status.message, 'compose_file_missing');
});

// --- getSearxngStatus: stopped container ---

test('searxng status returns stopped when docker is available and compose exists but container not running', async () => {
  const { runtime, commandCalls } = createHarness({
    fsSync: { existsSync: () => true },
    runCommandCapture: (_cmd, args) => {
      if (args?.includes('--version')) return { ok: true, stdout: 'Docker version 24.0' };
      return { ok: true, stdout: '' };
    },
  });
  const status = await runtime.getSearxngStatus();
  assert.equal(status.docker_available, true);
  assert.equal(status.compose_file_exists, true);
  assert.equal(status.running, false);
  assert.equal(status.message, 'stopped');
  assert.equal(status.needs_start, true);
  assert.equal(status.can_start, true);
  assert.deepEqual(commandCalls, [
    { cmd: 'docker', args: ['--version'], opts: { timeoutMs: 6_000 } },
    {
      cmd: 'docker',
      args: ['ps', '-a', '--filter', 'name=spec-harvester-searxng', '--format', '{{.Names}}\t{{.Status}}\t{{.Ports}}'],
      opts: { timeoutMs: 10_000 },
    },
  ]);
});

// --- getSearxngStatus: container running, http ready ---

test('searxng status returns ready when container is up and http probe succeeds', async () => {
  const { runtime, fetchCalls, timeoutCalls, clearTimeoutCalls } = createHarness({
    config: { searxngBaseUrl: 'http://custom:9090///' },
    fsSync: { existsSync: () => true },
    runCommandCapture: (_cmd, args) => {
      if (args?.includes('--version')) return { ok: true, stdout: 'Docker version 24.0' };
      return { ok: true, stdout: 'spec-harvester-searxng\tUp 5 minutes\t0.0.0.0:8080->8080/tcp' };
    },
    fetchImpl: async () => ({ ok: true, status: 200 }),
  });
  const status = await runtime.getSearxngStatus();
  assert.equal(status.running, true);
  assert.equal(status.http_ready, true);
  assert.equal(status.http_status, 200);
  assert.equal(status.message, 'ready');
  assert.equal(status.container_found, true);
  assert.equal(status.base_url, 'http://custom:9090');
  assert.ok(status.ports.includes('8080'));
  assert.equal(fetchCalls.length, 1);
  assert.equal(String(fetchCalls[0].url), 'http://custom:9090/search?q=health&format=json&language=en&safesearch=0');
  assert.deepEqual(timeoutCalls.map((entry) => entry.ms), [4_000]);
  assert.equal(clearTimeoutCalls.length, 1);
  assert.equal(clearTimeoutCalls[0], timeoutCalls[0].token);
});

// --- getSearxngStatus: container running, http not ready ---

test('searxng status returns container_running_http_unready when container is up but http probe fails', async () => {
  let callCount = 0;
  const { runtime } = createHarness({
    fsSync: { existsSync: () => true },
    runCommandCapture: () => {
      callCount += 1;
      if (callCount === 1) return { ok: true, stdout: 'Docker version 24.0' };
      return { ok: true, stdout: 'spec-harvester-searxng\tUp 2 seconds\t0.0.0.0:8080->8080/tcp' };
    },
    fetchImpl: async () => ({ ok: false, status: 503 }),
  });
  const status = await runtime.getSearxngStatus();
  assert.equal(status.running, true);
  assert.equal(status.http_ready, false);
  assert.equal(status.message, 'container_running_http_unready');
});

// --- getSearxngStatus: fetch unavailable ---

test('searxng http probe returns ok:false when fetchImpl is not a function', async () => {
  let callCount = 0;
  const { runtime } = createHarness({
    fsSync: { existsSync: () => true },
    fetchImpl: null,
    runCommandCapture: () => {
      callCount += 1;
      if (callCount === 1) return { ok: true, stdout: 'Docker version 24.0' };
      return { ok: true, stdout: 'spec-harvester-searxng\tUp 5 minutes\t0.0.0.0:8080->8080/tcp' };
    },
  });
  const status = await runtime.getSearxngStatus();
  assert.equal(status.running, true);
  assert.equal(status.http_ready, false);
  assert.equal(status.message, 'container_running_http_unready');
});

test('searxng status exposes docker ps failures without pretending the container exists', async () => {
  const { runtime } = createHarness({
    fsSync: { existsSync: () => true },
    runCommandCapture: (_cmd, args) => {
      if (args?.includes('--version')) return { ok: true, stdout: 'Docker version 24.0' };
      return { ok: false, stdout: '', stderr: 'permission denied' };
    },
  });
  const status = await runtime.getSearxngStatus();
  assert.equal(status.docker_available, true);
  assert.equal(status.container_found, false);
  assert.equal(status.running, false);
  assert.equal(status.message, 'stopped');
  assert.equal(status.docker_error, 'permission denied');
  assert.equal(status.can_start, true);
});

// --- startSearxngStack: compose file missing ---

test('searxng start returns ok:false when compose file is missing', async () => {
  const { runtime } = createHarness({
    fsSync: { existsSync: () => false },
    runCommandCapture: () => ({ ok: false, stdout: '', stderr: '' }),
  });
  const result = await runtime.startSearxngStack();
  assert.equal(result.ok, false);
  assert.equal(result.error, 'compose_file_missing');
  assert.ok(result.status);
});

// --- startSearxngStack: docker compose up failure ---

test('searxng start returns ok:false when docker compose up fails', async () => {
  let callCount = 0;
  const { runtime } = createHarness({
    fsSync: { existsSync: () => true },
    runCommandCapture: (cmd, args) => {
      callCount += 1;
      if (args?.includes('up')) return { ok: false, stderr: 'compose_error', stdout: '' };
      if (callCount === 1) return { ok: false, stdout: '' };
      return { ok: false, stdout: '', stderr: '' };
    },
  });
  const result = await runtime.startSearxngStack();
  assert.equal(result.ok, false);
  assert.equal(result.error, 'compose_error');
});

// --- startSearxngStack: success ---

test('searxng start returns ok:true with status when compose up succeeds and container is running', async () => {
  const { runtime, commandCalls, sleepCalls } = createHarness({
    fsSync: { existsSync: () => true },
    runCommandCapture: (_cmd, args) => {
      if (args?.includes('up')) return { ok: true, stdout: 'started' };
      if (args?.includes('--version')) return { ok: true, stdout: 'Docker version 24.0' };
      if (args?.includes('ps')) return { ok: true, stdout: 'spec-harvester-searxng\tUp 1 second\t8080' };
      return { ok: false, stdout: '' };
    },
  });
  const result = await runtime.startSearxngStack();
  assert.equal(result.ok, true);
  assert.equal(result.started, true);
  assert.equal(result.compose_stdout, 'started');
  assert.ok(result.status);
  assert.equal(result.status.running, true);
  assert.deepEqual(commandCalls[0], {
    cmd: 'docker',
    args: ['compose', '-f', path.resolve('/project', 'tools', 'searxng', 'docker-compose.yml'), 'up', '-d'],
    opts: { timeoutMs: 60_000 },
  });
  assert.deepEqual(sleepCalls, []);
});

test('searxng start polls up to 10 times with 800ms sleep before returning the final status', async () => {
  const { runtime, sleepCalls } = createHarness({
    fsSync: { existsSync: () => true },
    runCommandCapture: (_cmd, args) => {
      if (args?.includes('up')) return { ok: true, stdout: 'started' };
      if (args?.includes('--version')) return { ok: true, stdout: 'Docker version 24.0' };
      if (args?.includes('ps')) return { ok: true, stdout: '' };
      return { ok: false, stdout: '', stderr: '' };
    },
  });
  const result = await runtime.startSearxngStack();
  assert.equal(result.ok, true);
  assert.equal(result.started, true);
  assert.equal(result.compose_stdout, 'started');
  assert.equal(result.status.running, false);
  assert.equal(result.status.message, 'stopped');
  assert.deepEqual(sleepCalls, Array.from({ length: 10 }, () => 800));
});

// --- getSearxngStatus: base_url resolution ---

test('searxng status resolves base_url from config, falling back to env then default', async () => {
  const { runtime } = createHarness({
    config: { searxngBaseUrl: 'http://custom:9090' },
    runCommandCapture: () => ({ ok: false, stdout: '' }),
  });
  const status = await runtime.getSearxngStatus();
  assert.equal(status.base_url, 'http://custom:9090');
});

test('searxng status resolves base_url from SEARXNG_BASE_URL env when config is empty', async () => {
  const { runtime } = createHarness({
    config: { searxngBaseUrl: '' },
    processRef: { env: { SEARXNG_BASE_URL: 'http://envhost:7070' } },
    runCommandCapture: () => ({ ok: false, stdout: '' }),
  });
  const status = await runtime.getSearxngStatus();
  assert.equal(status.base_url, 'http://envhost:7070');
});
