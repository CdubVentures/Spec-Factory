/**
 * Operations Registry — in-memory tracker for long-running operations.
 *
 * Ephemeral runtime state (not persisted). Any module can register, update,
 * complete, or fail operations. Each mutation broadcasts via WebSocket so
 * the frontend sidebar tracker stays in sync.
 *
 * Invariants:
 * - id is a UUID (globally unique)
 * - status transitions: running → done | error | cancelled (terminal, no re-entry)
 * - currentStageIndex ∈ [0, stages.length)
 * - Lost on server restart (acceptable — see plan CQRS exception)
 */

import crypto from 'node:crypto';
import { extractEffortFromModelName } from '../../shared/effortFromModelName.js';

/** @type {Map<string, object>} */
const ops = new Map();

/** @type {Map<string, AbortController>} */
const controllers = new Map();

/** @type {Function|null} */
let _broadcastWs = null;

let _seq = 0;

// WHY: Cap the registry to bound memory and frontend render cost. When a
// registration or terminal transition leaves the count above MAX_OPS, the
// oldest terminal op (done | error | cancelled) is evicted. Running ops are
// never evicted — concurrency is not capped here.
const MAX_OPS = 50;

function broadcast(operation, action = 'upsert') {
  if (!_broadcastWs) return;
  // WHY: llmCalls can be large; they have their own 'llm-call-append' broadcast.
  // Exclude from regular upsert to keep per-update messages small.
  const { llmCalls, ...opWithoutCalls } = operation;
  _broadcastWs('operations', { action, operation: action === 'remove' ? undefined : { ...opWithoutCalls }, id: operation.id });
}

function broadcastRemove(id) {
  if (!_broadcastWs) return;
  _broadcastWs('operations', { action: 'remove', id });
}

function enforceCap() {
  if (ops.size <= MAX_OPS) return;
  const terminals = [...ops.values()]
    .filter(o => o.status !== 'running')
    .sort((a, b) => {
      const cmp = a.startedAt.localeCompare(b.startedAt);
      return cmp !== 0 ? cmp : a._seq - b._seq;
    });
  while (ops.size > MAX_OPS && terminals.length > 0) {
    const victim = terminals.shift();
    ops.delete(victim.id);
    controllers.delete(victim.id);
    broadcastRemove(victim.id);
  }
}

/**
 * Initialize the registry with a broadcastWs function.
 * Called once at server boot from guiServerRuntime.js.
 */
export function initOperationsRegistry({ broadcastWs }) {
  _broadcastWs = broadcastWs || null;
}

/**
 * Register a new operation. Returns { id }.
 */
export function registerOperation({ type, subType, category, productId, productLabel, variantKey, variantId, stages }) {
  if (!type) throw new Error('type is required');
  const id = crypto.randomUUID();
  const operation = {
    id,
    type,
    subType: subType || '',
    category: category || '',
    productId: productId || '',
    productLabel: productLabel || '',
    variantKey: variantKey || '',
    variantId: variantId || '',
    stages: Array.isArray(stages) ? stages : [],
    currentStageIndex: 0,
    status: 'running',
    startedAt: new Date().toISOString(),
    _seq: ++_seq,
    endedAt: null,
    error: null,
    modelInfo: null,
    progressText: '',
    llmCalls: [],
  };
  ops.set(id, operation);
  controllers.set(id, new AbortController());
  broadcast(operation);
  enforceCap();
  return { id };
}

/**
 * Advance the current stage. Accepts stageIndex (number) or stageName (string).
 * No-ops silently if id not found.
 */
export function updateStage({ id, stageIndex, stageName }) {
  const op = ops.get(id);
  if (!op || op.status !== 'running') return;

  if (typeof stageIndex === 'number') {
    op.currentStageIndex = Math.min(stageIndex, op.stages.length - 1);
  } else if (typeof stageName === 'string') {
    const idx = op.stages.indexOf(stageName);
    if (idx >= 0) op.currentStageIndex = idx;
  }
  broadcast(op);
}

/**
 * Record lab queue wait time on a running operation.
 * Called when an LLM call exits the dispatch queue and starts executing.
 */
export function updateQueueDelay({ id, queueDelayMs }) {
  const op = ops.get(id);
  if (!op || op.status !== 'running') return;
  op.queueDelayMs = typeof queueDelayMs === 'number' ? queueDelayMs : 0;
  broadcast(op);
}

/**
 * Set free-form progress text on a running operation.
 * Overwrites previous text. No-ops on nonexistent or terminal ops.
 */
export function updateProgressText({ id, text }) {
  const op = ops.get(id);
  if (!op || op.status !== 'running') return;
  op.progressText = typeof text === 'string' ? text : '';
  broadcast(op);
}

/**
 * Set structured loop progress on a running operation.
 * Used by carousel loops to provide rich data for grid rendering.
 * No-ops on nonexistent or terminal ops.
 */
export function updateLoopProgress({ id, loopProgress }) {
  const op = ops.get(id);
  if (!op || op.status !== 'running') return;
  op.loopProgress = loopProgress && typeof loopProgress === 'object' ? loopProgress : null;
  broadcast(op);
}

/**
 * Append or update an LLM call record on a running operation.
 *
 * Smart behavior:
 * - If the last call has response === null and the new call has a response,
 *   it UPDATES the last entry (prompt was sent before call, response arrived).
 * - Otherwise, it APPENDS a new entry.
 *
 * This lets finders fire the callback twice per LLM call:
 *   1. Before call: { prompt, response: null } → prompt visible immediately
 *   2. After call:  { prompt, response: {...} } → fills in response
 */
export function appendLlmCall({ id, call }) {
  const op = ops.get(id);
  if (!op || op.status !== 'running') return;
  if (!op.llmCalls) op.llmCalls = [];

  // Update last entry if it's a pending prompt awaiting response
  const last = op.llmCalls[op.llmCalls.length - 1];
  if (last && last.response === null && call.response != null) {
    // WHY: Merge all fields from the incoming call (response, usage, model, etc.)
    // while preserving the original callIndex and prompt from the pending entry.
    const updated = { ...last, ...call, callIndex: last.callIndex, timestamp: new Date().toISOString() };
    op.llmCalls[op.llmCalls.length - 1] = updated;
    if (_broadcastWs) {
      _broadcastWs('operations', { action: 'llm-call-update', id, callIndex: updated.callIndex, call: updated });
    }
    return;
  }

  // Append new call
  const indexed = { ...call, callIndex: op.llmCalls.length, timestamp: new Date().toISOString() };
  op.llmCalls.push(indexed);
  if (_broadcastWs) {
    _broadcastWs('operations', { action: 'llm-call-append', id, call: indexed });
  }
}

/**
 * Attach resolved model info to a running operation.
 * Replaces on repeat calls (primary → fallback).
 */
export function updateModelInfo({ id, model, provider, isFallback, accessMode, thinking, webSearch, effortLevel }) {
  const op = ops.get(id);
  if (!op || op.status !== 'running') return;
  const modelStr = typeof model === 'string' ? model : '';
  op.modelInfo = {
    model: modelStr,
    provider: typeof provider === 'string' ? provider : '',
    isFallback: Boolean(isFallback),
    accessMode: typeof accessMode === 'string' ? accessMode : 'api',
    thinking: Boolean(thinking),
    webSearch: Boolean(webSearch),
    // WHY: Effort can be baked into the model name suffix or passed explicitly.
    effortLevel: typeof effortLevel === 'string' ? effortLevel : (extractEffortFromModelName(modelStr) || ''),
  };
  broadcast(op);
}

/**
 * Mark operation as completed. Idempotent.
 */
export function completeOperation({ id }) {
  const op = ops.get(id);
  if (!op || op.status !== 'running') return;
  op.status = 'done';
  op.endedAt = new Date().toISOString();
  controllers.delete(id);
  broadcast(op);
  enforceCap();
}

/**
 * Mark operation as failed with an error message.
 */
export function failOperation({ id, error }) {
  const op = ops.get(id);
  if (!op || op.status !== 'running') return;
  op.status = 'error';
  op.error = typeof error === 'string' ? error.slice(0, 200) : 'Unknown error';
  op.endedAt = new Date().toISOString();
  controllers.delete(id);
  broadcast(op);
  enforceCap();
}

/**
 * Cancel a running operation. Aborts the AbortController signal so in-flight
 * fetch() calls terminate immediately. Idempotent on non-running ops.
 */
export function cancelOperation({ id }) {
  const op = ops.get(id);
  if (!op || op.status !== 'running') return;
  controllers.get(id)?.abort();
  controllers.delete(id);
  op.status = 'cancelled';
  op.endedAt = new Date().toISOString();
  broadcast(op);
  enforceCap();
}

/**
 * Get the AbortSignal for a running operation.
 * Returns null if id not found or controller already cleaned up.
 */
export function getOperationSignal(id) {
  return controllers.get(id)?.signal ?? null;
}

/**
 * Manually dismiss (remove) an operation. Called from the GUI dismiss button.
 */
export function dismissOperation({ id }) {
  if (!ops.has(id)) return;
  // WHY: Defensive abort in case dismiss is called on a running op
  controllers.get(id)?.abort();
  controllers.delete(id);
  ops.delete(id);
  broadcastRemove(id);
}

/**
 * List all tracked operations, sorted newest-first by startedAt.
 */
export function listOperations() {
  return [...ops.values()].sort((a, b) => {
    const cmp = b.startedAt.localeCompare(a.startedAt);
    return cmp !== 0 ? cmp : b._seq - a._seq;
  });
}

/**
 * Test seam: clear all state. Not exported from index.js.
 */
export function _resetForTest() {
  ops.clear();
  for (const ctrl of controllers.values()) ctrl.abort();
  controllers.clear();
  _broadcastWs = null;
  _seq = 0;
}
