import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

async function loadValidationModule() {
  return loadBundledModule(
    'tools/gui-react/src/pages/layout/hooks/wsEventPayloadValidation.ts',
    { prefix: 'ws-event-payload-validation-' },
  );
}

function makeOperation(overrides = {}) {
  return {
    id: 'op-1',
    type: 'pif',
    category: 'mouse',
    productId: 'mouse-1',
    productLabel: 'Mouse 1',
    stages: ['Queued', 'Running'],
    currentStageIndex: 0,
    status: 'running',
    startedAt: '2026-04-28T00:00:00.000Z',
    endedAt: null,
    error: null,
    modelInfo: null,
    llmCallCount: 0,
    activeLlmCallCount: 0,
    activeLlmCalls: [],
    ...overrides,
  };
}

function makeFullCall(overrides = {}) {
  return {
    callIndex: 0,
    timestamp: '2026-04-28T00:00:01.000Z',
    prompt: { system: 'system', user: 'user' },
    response: null,
    ...overrides,
  };
}

test('operations WS validation accepts upsert/remove/call actions and rejects malformed payloads', async () => {
  const { resolveOperationsWsMessage } = await loadValidationModule();

  const upsert = resolveOperationsWsMessage({
    action: 'upsert',
    operation: makeOperation(),
    id: 'op-1',
  });
  assert.equal(upsert.operation.id, 'op-1');
  assert.equal(upsert.removeId, undefined);

  const remove = resolveOperationsWsMessage({ action: 'remove', id: 'op-1' });
  assert.equal(remove.removeId, 'op-1');
  assert.equal(remove.operation, undefined);

  const append = resolveOperationsWsMessage({
    action: 'llm-call-append',
    id: 'op-1',
    call: makeFullCall(),
  });
  assert.equal(append.appendCall.id, 'op-1');
  assert.equal(append.appendCall.call.callIndex, 0);

  const update = resolveOperationsWsMessage({
    action: 'llm-call-update',
    id: 'op-1',
    call: makeFullCall({ callIndex: 2, response: { ok: true } }),
  });
  assert.equal(update.updateCall.id, 'op-1');
  assert.equal(update.updateCall.callIndex, 2);

  const invalidFixtures = [
    null,
    [],
    { action: 'upsert', operation: { id: 123 } },
    { action: 'remove', id: 123 },
    { action: 'llm-call-append', id: 'op-1', call: { callIndex: '0' } },
    { action: 'llm-call-update', id: 'op-1', call: makeFullCall({ callIndex: Number.NaN }) },
    { action: 'upsert', operation: makeOperation({ status: 'mystery' }) },
    { action: 'upsert', operation: makeOperation({ stages: ['ok', 7] }) },
  ];

  for (const fixture of invalidFixtures) {
    assert.equal(resolveOperationsWsMessage(fixture), null);
  }
});

test('operations call action still applies a valid operation summary when the call body is summary-only', async () => {
  const { resolveOperationsWsMessage } = await loadValidationModule();

  const message = resolveOperationsWsMessage({
    action: 'llm-call-append',
    id: 'op-1',
    operation: makeOperation({ currentStageIndex: 1 }),
    call: {
      callIndex: 0,
      timestamp: '2026-04-28T00:00:01.000Z',
      responseStatus: 'pending',
    },
  });

  assert.equal(message.operation.currentStageIndex, 1);
  assert.equal(message.appendCall, undefined);
});

test('process status WS resolver normalizes alias fields and nullable idle values', async () => {
  const { resolveProcessStatusWsMessage } = await loadValidationModule();

  const status = resolveProcessStatusWsMessage({
    running: false,
    run_id: 'run_12345678',
    category: 'mouse',
    product_id: 'mouse-1',
    brand: 'Razer',
    base_model: 'Viper V3 Pro',
    model: 'Viper V3 Pro',
    variant: 'White',
    storage_destination: 'local',
    pid: null,
    command: null,
    startedAt: null,
    exitCode: 0,
    endedAt: '2026-04-28T00:05:00.000Z',
  });

  assert.deepEqual(status, {
    running: false,
    run_id: 'run_12345678',
    runId: 'run_12345678',
    category: 'mouse',
    product_id: 'mouse-1',
    productId: 'mouse-1',
    brand: 'Razer',
    base_model: 'Viper V3 Pro',
    model: 'Viper V3 Pro',
    variant: 'White',
    storage_destination: 'local',
    storageDestination: 'local',
    pid: null,
    command: null,
    startedAt: null,
    exitCode: 0,
    endedAt: '2026-04-28T00:05:00.000Z',
  });
});

test('process status WS resolver rejects conflicting aliases and invalid nullable scalars', async () => {
  const { resolveProcessStatusWsMessage } = await loadValidationModule();

  assert.equal(resolveProcessStatusWsMessage({
    running: true,
    run_id: 'run_12345678',
    runId: 'run_87654321',
  }), null);
  assert.equal(resolveProcessStatusWsMessage({
    running: true,
    product_id: 'mouse-1',
    productId: 'mouse-2',
  }), null);
  assert.equal(resolveProcessStatusWsMessage({
    running: false,
    storage_destination: 'local',
    storageDestination: 'remote',
  }), null);
  assert.equal(resolveProcessStatusWsMessage({ running: false, pid: '123' }), null);
  assert.equal(resolveProcessStatusWsMessage({ running: false, command: 42 }), null);
});

test('state-mutating WS validators cover process status, events, data-change, and stream chunks', async () => {
  const {
    isProcessStatusWsMessage,
    isRuntimeEventList,
    isProcessOutputList,
    isIndexLabEventList,
    isDataChangeWsMessage,
    resolveLlmStreamWsMessage,
    MAX_LLM_STREAM_CHUNK_CHARS,
  } = await loadValidationModule();

  assert.equal(isProcessStatusWsMessage({ running: false, run_id: null, exitCode: 0 }), true);
  assert.equal(isProcessStatusWsMessage({ running: 'false' }), false);

  assert.equal(isRuntimeEventList([{ ts: '2026-04-28T00:00:00.000Z', event: 'stage:start' }]), true);
  assert.equal(isRuntimeEventList([{ ts: '2026-04-28T00:00:00.000Z' }]), false);

  assert.equal(isProcessOutputList(['line 1', 'line 2']), true);
  assert.equal(isProcessOutputList(['line 1', 2]), false);

  assert.equal(isIndexLabEventList([{
    run_id: 'run-1',
    ts: '2026-04-28T00:00:00.000Z',
    stage: 'crawl',
    event: 'stage:start',
  }]), true);
  assert.equal(isIndexLabEventList([{ run_id: 'run-1', event: 'stage:start' }]), false);

  assert.equal(isDataChangeWsMessage({
    type: 'data-change',
    event: 'catalog-product-updated',
    category: 'mouse',
    categories: ['mouse'],
    domains: ['catalog'],
  }), true);
  assert.equal(isDataChangeWsMessage({
    type: 'data-change',
    event: 'catalog-product-updated',
    categories: ['mouse', 3],
  }), false);

  assert.deepEqual(resolveLlmStreamWsMessage({
    operationId: 'op-1',
    callId: 'call-1',
    text: 'chunk',
    lane: 'view',
    label: 'View',
    channel: 'content',
  }), {
    operationId: 'op-1',
    callId: 'call-1',
    text: 'chunk',
    lane: 'view',
    label: 'View',
    channel: 'content',
  });
  assert.equal(resolveLlmStreamWsMessage({ operationId: 'op-1', text: 12 }), null);
  assert.equal(resolveLlmStreamWsMessage({
    operationId: 'op-1',
    text: 'x'.repeat(MAX_LLM_STREAM_CHUNK_CHARS + 1),
  }), null);
});
