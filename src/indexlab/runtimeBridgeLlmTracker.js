// WHY: LLM call lifecycle tracker extracted from runtimeBridge.js
// Factory pattern — encapsulates worker ID resolution and aggregate metrics.

import { buildLlmCallKey, incrementCounterMap } from './runtimeBridgeCoercers.js';

export function createLlmCallTracker() {
  let _llmCounter = 0;
  const _llmCallMap = new Map();
  const _llmSeenWorkers = new Set();
  // WHY: Track recently-failed workers by reason so fallback calls reuse the
  // same worker ID instead of creating a duplicate row in the Workers tab.
  const _llmFailedByReason = new Map();
  const _llmAgg = {
    total_calls: 0,
    completed_calls: 0,
    failed_calls: 0,
    active_calls: 0,
    total_prompt_tokens: 0,
    total_completion_tokens: 0,
    total_cost: 0,
    calls_by_type: {},
    calls_by_model: {}
  };

  function _findLlmWorkerForCompletion(reason = '', model = '') {
    let bestMatch = null;
    for (const [wid, call] of _llmCallMap) {
      if (call.reason === reason) {
        bestMatch = wid;
        if (call.model === model) {
          return wid;
        }
      }
    }
    if (bestMatch) return bestMatch;
    return `llm-orphan-${_llmCounter}`;
  }

  function resolveLlmWorkerId({ row = {}, llmEvent = '', llmReason = '' } = {}) {
    const batchId = String(row.batch_id || row.batchId || '').trim();
    const model = String(row.model || '').trim();
    const callKey = buildLlmCallKey(row, llmReason);

    if (llmEvent === 'llm_started') {
      // WHY: When primary fails and fallback fires for the same reason,
      // reuse the original worker ID so the GUI shows 1 row, not 2.
      const previousWorkerId = _llmFailedByReason.get(llmReason);
      const workerId = previousWorkerId
        ? previousWorkerId
        : (batchId ? `llm-${batchId}` : `llm-${++_llmCounter}`);
      if (previousWorkerId) {
        _llmFailedByReason.delete(llmReason);
      }
      _llmCallMap.set(workerId, {
        key: callKey,
        reason: llmReason,
        model,
        is_fallback: Boolean(previousWorkerId),
      });
      return workerId;
    }

    let workerId = '';
    if (batchId) {
      workerId = `llm-${batchId}`;
    }
    if (!workerId && callKey) {
      for (const [candidateWorkerId, call] of _llmCallMap) {
        if (call.key === callKey) {
          workerId = candidateWorkerId;
          break;
        }
      }
    }
    if (!workerId) {
      workerId = _findLlmWorkerForCompletion(llmReason, model);
    }
    if (llmEvent === 'llm_finished' || llmEvent === 'llm_failed') {
      if (llmEvent === 'llm_failed' && llmReason) {
        _llmFailedByReason.set(llmReason, workerId);
      }
      _llmCallMap.delete(workerId);
    }
    return workerId;
  }

  function recordLlmAggregate({
    workerId = '',
    llmEvent = '',
    callType = '',
    model = '',
    promptTokens = null,
    completionTokens = null,
    estimatedCost = null
  } = {}) {
    const safeWorkerId = String(workerId || '').trim();
    if (!safeWorkerId) return;

    if (!_llmSeenWorkers.has(safeWorkerId)) {
      _llmSeenWorkers.add(safeWorkerId);
      _llmAgg.total_calls += 1;
      incrementCounterMap(_llmAgg.calls_by_type, callType);
      incrementCounterMap(_llmAgg.calls_by_model, model);
    }

    if (llmEvent === 'llm_started') {
      _llmAgg.active_calls += 1;
      return;
    }

    if (llmEvent === 'llm_finished' || llmEvent === 'llm_failed') {
      _llmAgg.completed_calls += 1;
      if (llmEvent === 'llm_failed') {
        _llmAgg.failed_calls += 1;
      }
      _llmAgg.active_calls = Math.max(0, _llmAgg.active_calls - 1);
      if (promptTokens !== null) {
        _llmAgg.total_prompt_tokens += promptTokens;
      }
      if (completionTokens !== null) {
        _llmAgg.total_completion_tokens += completionTokens;
      }
      if (estimatedCost !== null) {
        _llmAgg.total_cost = Number((_llmAgg.total_cost + estimatedCost).toFixed(10));
      }
    }
  }

  function getLlmAgg() {
    return _llmAgg;
  }

  function getLlmCallMap() {
    return _llmCallMap;
  }

  function getLlmSeenWorkers() {
    return _llmSeenWorkers;
  }

  function getLlmCounter() {
    return _llmCounter;
  }

  function reset() {
    _llmCallMap.clear();
    _llmSeenWorkers.clear();
    _llmFailedByReason.clear();
  }

  return { resolveLlmWorkerId, recordLlmAggregate, getLlmAgg, getLlmCallMap, getLlmSeenWorkers, getLlmCounter, reset };
}
