import test from 'node:test';
import assert from 'node:assert/strict';

import { createWriterModelTestHandler } from '../writerModelTestHandler.js';

test('POST /llm-policy/writer-test registers a writer-test active operation', async () => {
  const responses = [];
  const registered = [];
  const fireCalls = [];
  const runnerCalls = [];
  const config = { _resolvedWriterBaseModel: 'writer-alpha' };

  const handler = createWriterModelTestHandler({
    jsonRes: (_res, status, body) => {
      responses.push({ status, body });
      return true;
    },
    config,
    broadcastWs: () => {},
    registerOperationFn: (args) => {
      registered.push(args);
      return { id: 'op-writer-test' };
    },
    createStreamBatcherFn: () => ({ push() {}, dispose() {} }),
    buildOperationTelemetryFn: ({ op }) => ({ onStageAdvance: (stage) => ({ op, stage }) }),
    runWriterModelTestFn: async (args) => {
      runnerCalls.push(args);
      return { ok: true };
    },
    fireAndForgetFn: (args) => {
      fireCalls.push(args);
      return args.jsonRes(args.res, 202, { ok: true, operationId: args.op.id });
    },
    getOperationSignalFn: () => null,
    completeOperationFn: () => {},
    failOperationFn: () => {},
    cancelOperationFn: () => {},
  });

  const handled = await handler(['llm-policy', 'writer-test'], new URLSearchParams(), 'POST', {}, {});

  assert.equal(handled, true);
  assert.deepEqual(responses, [{ status: 202, body: { ok: true, operationId: 'op-writer-test' } }]);
  assert.equal(registered.length, 1);
  assert.equal(registered[0].type, 'writer-test');
  assert.equal(registered[0].subType, 'model-check');
  assert.equal(registered[0].productLabel, 'Writer Model Test');
  assert.deepEqual(registered[0].stages, ['Prepare', 'Call', 'Validate']);
  assert.equal(fireCalls.length, 1);

  await fireCalls[0].asyncWork();

  assert.equal(runnerCalls.length, 1);
  assert.equal(runnerCalls[0].config, config);
  assert.ok(runnerCalls[0].telemetry.onStageAdvance);
});

test('writer test handler ignores non-writer-test routes', async () => {
  const handler = createWriterModelTestHandler({
    jsonRes: () => true,
    config: {},
    broadcastWs: () => {},
  });

  assert.equal(await handler(['llm-policy'], new URLSearchParams(), 'POST', {}, {}), false);
  assert.equal(await handler(['llm-policy', 'writer-test'], new URLSearchParams(), 'GET', {}, {}), false);
});
