import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { createInfraProcessRoutes } from '../src/app/api/routes/infra/processRoutes.js';

function makeDeps(overrides = {}) {
  return {
    jsonRes: (_res, status, body) => ({ status, body }),
    readJsonBody: async () => ({}),
    HELPER_ROOT: path.resolve('category_authority'),
    OUTPUT_ROOT: path.resolve('out'),
    INDEXLAB_ROOT: path.resolve('indexlab'),
    fs: {
      access: async () => {},
    },
    pathApi: path,
    processRef: {
      env: {},
    },
    runDataStorageState: {
      enabled: false,
      destinationType: 'local',
      localDirectory: '',
    },
    buildProcessStartLaunchPlanFn: () => ({
      ok: true,
      requestedRunId: 'run-123',
      cliArgs: ['--run-id', 'run-123'],
      envOverrides: {},
      replaceRunning: false,
      effectiveHelperRoot: path.resolve('category_authority'),
      generatedRulesCandidates: [
        path.resolve('category_authority', 'mouse', '_generated', 'field_rules.json'),
      ],
    }),
    startProcess: () => ({ running: true, run_id: 'run-123', runId: 'run-123' }),
    stopProcess: async () => ({ running: false }),
    processStatus: () => ({ running: false }),
    isProcessRunning: () => false,
    waitForProcessExit: async () => true,
    ...overrides,
  };
}

test('createInfraProcessRoutes returns false for non-process paths', async () => {
  const handler = createInfraProcessRoutes(makeDeps());
  const result = await handler(['health'], new URLSearchParams(), 'GET', {}, {});
  assert.equal(result, false);
});

test('createInfraProcessRoutes preserves process/status passthrough', async () => {
  const handler = createInfraProcessRoutes(makeDeps({
    processStatus: () => ({
      running: true,
      run_id: 'run-abc',
      runId: 'run-abc',
    }),
  }));

  const result = await handler(['process', 'status'], new URLSearchParams(), 'GET', {}, {});
  assert.deepEqual(result, {
    status: 200,
    body: {
      running: true,
      run_id: 'run-abc',
      runId: 'run-abc',
    },
  });
});

test('createInfraProcessRoutes fails replace-running start when previous process does not exit in time', async () => {
  let started = false;
  const handler = createInfraProcessRoutes(makeDeps({
    readJsonBody: async () => ({
      category: 'mouse',
      mode: 'indexlab',
      productId: 'mouse-acme-orbit-x1',
    }),
    buildProcessStartLaunchPlanFn: () => ({
      ok: true,
      requestedRunId: 'run-123',
      cliArgs: ['--run-id', 'run-123'],
      envOverrides: {},
      replaceRunning: true,
      effectiveHelperRoot: path.resolve('category_authority'),
      generatedRulesCandidates: [
        path.resolve('category_authority', 'mouse', '_generated', 'field_rules.json'),
      ],
    }),
    isProcessRunning: () => true,
    waitForProcessExit: async () => false,
    startProcess: () => {
      started = true;
      return { running: true };
    },
  }));

  const result = await handler(['process', 'start'], new URLSearchParams(), 'POST', {}, {});
  assert.equal(result.status, 409);
  assert.equal(result.body?.error, 'process_replace_timeout');
  assert.equal(started, false, 'process should not restart when previous process does not exit');
});
