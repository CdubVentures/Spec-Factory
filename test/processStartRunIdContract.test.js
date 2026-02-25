import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { registerInfraRoutes } from '../src/api/routes/infraRoutes.js';

function makeCtx(overrides = {}) {
  return {
    jsonRes: (_res, status, body) => ({ status, body }),
    readJsonBody: async () => ({}),
    listDirs: async () => [],
    canonicalSlugify: (value) => String(value || '').trim().toLowerCase(),
    HELPER_ROOT: path.resolve('helper_files'),
    DIST_ROOT: path.resolve('gui-dist'),
    fs: {
      access: async () => {},
      mkdir: async () => {},
    },
    path,
    getSearxngStatus: async () => ({ ok: true }),
    startSearxngStack: async () => ({ ok: true }),
    startProcess: () => ({ running: true }),
    stopProcess: async () => ({ running: false }),
    processStatus: () => ({ running: false }),
    isProcessRunning: () => false,
    waitForProcessExit: async () => true,
    broadcastWs: () => {},
    ...overrides,
  };
}

test('process/start returns deterministic run_id and forwards --run-id to CLI spawn args', async () => {
  let capturedArgs = null;
  const handler = registerInfraRoutes(makeCtx({
    readJsonBody: async () => ({
      category: 'mouse',
      mode: 'indexlab',
      productId: 'mouse-razer-viper-v3-pro',
    }),
    startProcess: (_cmd, cliArgs) => {
      capturedArgs = Array.isArray(cliArgs) ? [...cliArgs] : [];
      return { running: true };
    },
  }));

  const result = await handler(['process', 'start'], new URLSearchParams(), 'POST', {}, {});
  assert.equal(result.status, 200);
  assert.equal(typeof result.body?.run_id, 'string');
  assert.equal(result.body.run_id.length > 0, true);
  assert.equal(result.body.runId, result.body.run_id);

  assert.ok(Array.isArray(capturedArgs), 'startProcess should receive CLI args');
  const runIdIndex = capturedArgs.indexOf('--run-id');
  assert.equal(runIdIndex >= 0, true, 'CLI args should include --run-id');
  assert.equal(capturedArgs[runIdIndex + 1], result.body.run_id, 'CLI --run-id should match response run_id');
});

test('process/start honors valid requestedRunId input', async () => {
  let capturedArgs = null;
  const requestedRunId = '20260225-abc123';
  const handler = registerInfraRoutes(makeCtx({
    readJsonBody: async () => ({
      category: 'mouse',
      mode: 'indexlab',
      productId: 'mouse-razer-viper-v3-pro',
      requestedRunId,
    }),
    startProcess: (_cmd, cliArgs) => {
      capturedArgs = Array.isArray(cliArgs) ? [...cliArgs] : [];
      return { running: true, run_id: requestedRunId, runId: requestedRunId };
    },
  }));

  const result = await handler(['process', 'start'], new URLSearchParams(), 'POST', {}, {});
  assert.equal(result.status, 200);
  assert.equal(result.body?.run_id, requestedRunId);
  assert.equal(result.body?.runId, requestedRunId);
  const runIdIndex = capturedArgs.indexOf('--run-id');
  assert.equal(capturedArgs[runIdIndex + 1], requestedRunId);
});

test('process/status returns run_id passthrough from processStatus payload', async () => {
  const handler = registerInfraRoutes(makeCtx({
    processStatus: () => ({
      running: true,
      run_id: '20260225-feedaa',
      runId: '20260225-feedaa',
    }),
  }));

  const result = await handler(['process', 'status'], new URLSearchParams(), 'GET', {}, {});
  assert.equal(result.status, 200);
  assert.equal(result.body?.run_id, '20260225-feedaa');
  assert.equal(result.body?.runId, '20260225-feedaa');
});
