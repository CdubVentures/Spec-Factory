import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  createInfraRoutesHandler,
  createPresentPathFs,
  invokeInfraRoute,
} from './helpers/infraRoutesHarness.js';

const DEFAULT_PROCESS_START_BODY = Object.freeze({
  category: 'mouse',
  mode: 'indexlab',
  productId: 'mouse-razer-viper-v3-pro',
});

function createProcessStartBody(overrides = {}) {
  const body = {
    ...DEFAULT_PROCESS_START_BODY,
    ...overrides,
  };

  for (const [key, value] of Object.entries(body)) {
    if (typeof value === 'undefined') {
      delete body[key];
    }
  }

  return body;
}

function createProcessStartHandler({
  body = createProcessStartBody(),
  fs = createPresentPathFs(),
  ...overrides
} = {}) {
  return createInfraRoutesHandler({
    readJsonBody: async () => body,
    fs,
    ...overrides,
  });
}

function invokeProcessStart(handler) {
  return invokeInfraRoute(handler, ['process', 'start'], 'POST');
}

function invokeProcessStatus(handler) {
  return invokeInfraRoute(handler, ['process', 'status'], 'GET');
}

test('process/start returns a stable run id and forwards it to the child CLI', async () => {
  let capturedArgs = null;
  const handler = createProcessStartHandler({
    startProcess: (_cmd, cliArgs) => {
      capturedArgs = Array.isArray(cliArgs) ? [...cliArgs] : [];
      return { running: true };
    },
  });

  const result = await invokeProcessStart(handler);
  assert.equal(result.status, 200);
  assert.equal(typeof result.body?.run_id, 'string');
  assert.equal(result.body.run_id.length > 0, true);
  assert.equal(result.body.runId, result.body.run_id);

  assert.ok(Array.isArray(capturedArgs), 'startProcess should receive CLI args');
  const runIdIndex = capturedArgs.indexOf('--run-id');
  assert.equal(runIdIndex >= 0, true, 'CLI args should include --run-id');
  assert.equal(capturedArgs[runIdIndex + 1], result.body.run_id, 'CLI --run-id should match response run_id');
});

test('process/start preserves a valid requested run id', async () => {
  let capturedArgs = null;
  const requestedRunId = '20260225-abc123';
  const handler = createProcessStartHandler({
    body: createProcessStartBody({ requestedRunId }),
    startProcess: (_cmd, cliArgs) => {
      capturedArgs = Array.isArray(cliArgs) ? [...cliArgs] : [];
      return { running: true, run_id: requestedRunId, runId: requestedRunId };
    },
  });

  const result = await invokeProcessStart(handler);
  assert.equal(result.status, 200);
  assert.equal(result.body?.run_id, requestedRunId);
  assert.equal(result.body?.runId, requestedRunId);
  const runIdIndex = capturedArgs.indexOf('--run-id');
  assert.equal(capturedArgs[runIdIndex + 1], requestedRunId);
});

test('process/status exposes the active run id from runtime state', async () => {
  const handler = createInfraRoutesHandler({
    processStatus: () => ({
      running: true,
      run_id: '20260225-feedaa',
      runId: '20260225-feedaa',
    }),
  });

  const result = await invokeProcessStatus(handler);
  assert.equal(result.status, 200);
  assert.equal(result.body?.run_id, '20260225-feedaa');
  assert.equal(result.body?.runId, '20260225-feedaa');
});

test('process/start returns launch-plan validation failures without spawning the child process', async () => {
  let started = false;
  const handler = createProcessStartHandler({
    buildProcessStartLaunchPlanFn: () => ({
      ok: false,
      status: 400,
      body: {
        error: 'unsupported_process_mode',
        message: 'Only indexlab mode is supported in GUI process/start.',
      },
    }),
    startProcess: () => {
      started = true;
      return { running: true };
    },
  });

  const result = await invokeProcessStart(handler);
  assert.deepEqual(result, {
    status: 400,
    body: {
      error: 'unsupported_process_mode',
      message: 'Only indexlab mode is supported in GUI process/start.',
    },
  });
  assert.equal(started, false, 'process should not start when launch-plan validation fails');
});

test('process/start rejects launches when generated field rules are missing', async () => {
  let started = false;
  const helperRoot = path.resolve('category_authority');
  const expectedMissingPaths = [
    path.resolve(path.join(helperRoot, 'mouse', '_generated', 'field_rules.json')),
  ];
  const expectedMissingPathSet = new Set(expectedMissingPaths);
  const handler = createProcessStartHandler({
    HELPER_ROOT: helperRoot,
    fs: createPresentPathFs({
      access: async (targetPath) => {
        if (expectedMissingPathSet.has(path.resolve(String(targetPath || '')))) {
          const error = new Error('missing');
          error.code = 'ENOENT';
          throw error;
        }
      },
    }),
    startProcess: () => {
      started = true;
      return { running: true };
    },
  });

  const result = await invokeProcessStart(handler);
  assert.equal(result.status, 409);
  assert.equal(result.body?.error, 'missing_generated_field_rules');
  assert.match(String(result.body?.message || ''), /field_rules\.json/i);
  assert.equal(result.body?.helper_root, helperRoot);
  assert.deepEqual(new Set(result.body?.field_rules_paths || []), expectedMissingPathSet);
  assert.equal(started, false, 'process should not start without generated field rules');
});

test('process/start validates generated field rules against the effective helper root override', async () => {
  let started = false;
  const helperRoot = path.resolve('category_authority');
  const overrideRoot = path.resolve('category_authority');
  const missingForOverride = [
    path.resolve(path.join(overrideRoot, 'mouse', '_generated', 'field_rules.json')),
  ];
  const missingForOverrideSet = new Set(missingForOverride);
  const handler = createProcessStartHandler({
    HELPER_ROOT: helperRoot,
    body: createProcessStartBody({
      productId: 'mouse-razer-viper-v3-pro-black',
      categoryAuthorityRoot: overrideRoot,
    }),
    fs: createPresentPathFs({
      access: async (targetPath) => {
        const resolved = path.resolve(String(targetPath || ''));
        if (missingForOverrideSet.has(resolved)) {
          const error = new Error('missing');
          error.code = 'ENOENT';
          throw error;
        }
      },
    }),
    startProcess: () => {
      started = true;
      return { running: true };
    },
  });

  const result = await invokeProcessStart(handler);
  assert.equal(result.status, 409);
  assert.equal(result.body?.error, 'missing_generated_field_rules');
  assert.equal(result.body?.helper_root, overrideRoot);
  assert.deepEqual(new Set(result.body?.field_rules_paths || []), missingForOverrideSet);
  assert.equal(started, false, 'process should fail before spawn when helper root override lacks generated field rules');
});

test('process/start forwards the launch plan cli args and env overrides to startProcess', async () => {
  const requestedRunId = 'run-forwarded-1234';
  const forwardedArgs = ['indexlab', '--run-id', requestedRunId, '--search-engines', 'duckduckgo'];
  const forwardedEnv = {
    CATEGORY_AUTHORITY_ROOT: path.resolve('category_authority_override'),
    HELPER_FILES_ROOT: path.resolve('category_authority_override'),
    LOCAL_OUTPUT_ROOT: path.resolve('forwarded-output-root'),
    SPEC_DB_DIR: path.resolve('forwarded-specdb-root'),
    RUNTIME_SETTINGS_SNAPSHOT: path.resolve('category_authority_override', '_runtime', 'snapshots', `${requestedRunId}.json`),
  };
  let capturedCommand = null;
  let capturedArgs = null;
  let capturedEnv = null;
  const handler = createProcessStartHandler({
    buildProcessStartLaunchPlanFn: () => ({
      ok: true,
      requestedRunId,
      cliArgs: forwardedArgs,
      envOverrides: forwardedEnv,
      replaceRunning: false,
      effectiveHelperRoot: path.resolve('category_authority_override'),
      generatedRulesCandidates: [
        path.resolve('category_authority_override', 'mouse', '_generated', 'field_rules.json'),
      ],
    }),
    startProcess: (command, cliArgs, envOverrides) => {
      capturedCommand = command;
      capturedArgs = cliArgs;
      capturedEnv = envOverrides;
      return { running: true };
    },
  });

  const result = await invokeProcessStart(handler);
  assert.equal(result.status, 200);
  assert.equal(capturedCommand, 'src/cli/spec.js');
  assert.deepEqual(capturedArgs, forwardedArgs);
  assert.deepEqual(capturedEnv, forwardedEnv);
  assert.equal(result.body?.run_id, requestedRunId);
  assert.equal(result.body?.runId, requestedRunId);
});

test('process/start returns process_replace_timeout when the previous process does not stop in time', async () => {
  let started = false;
  const handler = createProcessStartHandler({
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
    stopProcess: async () => ({ stop_confirmed: false }),
    startProcess: () => {
      started = true;
      return { running: true };
    },
  });

  const result = await invokeProcessStart(handler);
  assert.deepEqual(result, {
    status: 409,
    body: {
      error: 'process_replace_timeout',
      message: 'Existing process did not stop in time',
    },
  });
  assert.equal(started, false, 'route should not restart while the old process is still active');
});

test('process/start restarts when the previous process exits during replace-running without redundant waiting', async () => {
  let started = false;
  let waitCalls = 0;
  let runningChecks = 0;
  const handler = createProcessStartHandler({
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
    isProcessRunning: () => {
      runningChecks += 1;
      return runningChecks === 1;
    },
    stopProcess: async () => ({ stop_confirmed: false }),
    waitForProcessExit: async () => {
      waitCalls += 1;
      return true;
    },
    startProcess: () => {
      started = true;
      return { running: true, run_id: 'run-123', runId: 'run-123' };
    },
  });

  const result = await invokeProcessStart(handler);
  assert.deepEqual(result, {
    status: 200,
    body: {
      running: true,
      run_id: 'run-123',
      runId: 'run-123',
    },
  });
  assert.equal(started, true);
  assert.equal(waitCalls, 0, 'route should not reintroduce a redundant wait after stopProcess returns');
});

test('process/start surfaces startProcess failures as 409 error payloads', async () => {
  const handler = createProcessStartHandler({
    startProcess: () => {
      throw new Error('spawn_failed');
    },
  });

  const result = await invokeProcessStart(handler);
  assert.deepEqual(result, {
    status: 409,
    body: {
      error: 'spawn_failed',
    },
  });
});
