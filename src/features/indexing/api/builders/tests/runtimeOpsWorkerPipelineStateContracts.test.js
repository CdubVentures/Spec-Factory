import test from 'node:test';
import assert from 'node:assert/strict';

import {
  emitLlmCall,
  emitSearchAttempt,
  makeBridge,
  startRun
} from './fixtures/runtimeOpsWorkerPipelineHarness.js';

test('integration: finalize clears search slots, LLM tracking, and resets counters', async () => {
  const { bridge } = await makeBridge();
  await startRun(bridge);

  await emitSearchAttempt(bridge, {
    startTs: '2025-01-01T00:00:10Z',
    finishTs: '2025-01-01T00:00:15Z',
    query: 'test query',
    resultCount: 5,
    durationMs: 300
  });

  await emitLlmCall(bridge, {
    startTs: '2025-01-01T00:00:20Z',
    finishTs: '2025-01-01T00:00:22Z',
    batchId: 'f1',
    reason: 'brand_resolution',
    model: 'gpt-4o',
    completionTokens: 30,
    estimatedCost: 0.002
  });

  assert.ok(bridge._searchSlots.size > 0, 'search state exists pre-finalize');
  assert.ok(bridge._llmSeenWorkers.size > 0, 'llm state exists pre-finalize');

  await bridge.finalize();

  assert.equal(bridge._searchSlots.size, 0, 'search slots cleared');
  assert.equal(bridge._queryToSlot.size, 0, 'query-to-slot map cleared');
  assert.equal(bridge._llmCallMap.size, 0, 'LLM call map cleared');
  assert.equal(bridge._llmSeenWorkers.size, 0, 'LLM seen workers cleared');
  assert.equal(bridge._searchNextSlotIndex, 0, 'search slot index reset');
  assert.equal(bridge._llmCounter, 0, 'LLM counter reset');
});
