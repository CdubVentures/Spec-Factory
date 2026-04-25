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

/**
 * Per-(type, productId, fieldKey) serialization queue.
 *
 * When a Run or Loop for (kf, pid, fieldKey) is in-flight, a concurrent request
 * for the same key awaits the first's release instead of racing on JSON/SQL
 * writes. Under single-shot Run this was rare; under Loop (2–5 min) it matters.
 *
 * Implementation: per-key promise chain. Each acquire:
 *   1. reads the current tail of the chain (or resolved promise if empty)
 *   2. creates its own "finished" promise (held until caller releases)
 *   3. stores `prev.then(() => myFinished)` as the new tail — next waiter awaits this
 *   4. awaits prev — when prev resolves, caller holds the lock
 * Release: caller invokes the release fn returned from acquire; chain advances.
 *
 * FIFO is guaranteed by `.then` composition. 3+ waiters serialize correctly.
 *
 * Ephemeral (in-memory only). Process restart clears all locks — acceptable:
 * operations registry is also ephemeral. The queue map accumulates one entry
 * per unique (type, pid, fieldKey) touched during session lifetime; memory is
 * bounded by the product catalog's active working set.
 *
 * @type {Map<string, Promise<void>>}
 */
const keyLocks = new Map();

function lockKey(type, productId, fieldKey) {
  return `${type}:${productId}:${fieldKey}`;
}

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
 *
 * Optional `status` defaults to 'running'. Pass 'queued' when the op is
 * waiting on a per-key queue lock — use setStatus to transition to 'running'
 * once the lock is acquired.
 */
export function registerOperation({ type, subType, category, productId, productLabel, variantKey, variantId, fieldKey, stages, status }) {
  if (!type) throw new Error('type is required');
  const id = crypto.randomUUID();
  const initialStatus = status === 'queued' ? 'queued' : 'running';
  const operation = {
    id,
    type,
    subType: subType || '',
    category: category || '',
    productId: productId || '',
    productLabel: productLabel || '',
    variantKey: variantKey || '',
    variantId: variantId || '',
    // WHY: keyFinder uses fieldKey instead of variantKey for per-key scope.
    // Existing finders pass '' (default). Per-key running-state selectors key off this.
    fieldKey: fieldKey || '',
    stages: Array.isArray(stages) ? stages : [],
    currentStageIndex: 0,
    status: initialStatus,
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
 * Transition an op to a new status. Intended for the queued→running flip
 * when a per-key lock is acquired. Silently no-ops on missing id or on
 * invalid transitions (terminal → anything, running → queued).
 */
export function setStatus({ id, status }) {
  const op = ops.get(id);
  if (!op) return;
  if (status !== 'queued' && status !== 'running') return;
  // Terminal ops cannot be reset
  if (op.status === 'done' || op.status === 'error' || op.status === 'cancelled') return;
  // Don't allow running → queued (only queued → running)
  if (op.status === 'running' && status === 'queued') return;
  if (op.status === status) return;
  op.status = status;
  broadcast(op);
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

  const callId = typeof call?.callId === 'string' ? call.callId : '';
  if (callId) {
    const existingIndex = op.llmCalls.findIndex((c) => c.callId === callId);
    if (existingIndex >= 0) {
      const existing = op.llmCalls[existingIndex];
      const updated = {
        ...existing,
        ...call,
        prompt: existing.prompt || call.prompt,
        response: Object.hasOwn(call, 'response') ? call.response : existing.response,
        callIndex: existing.callIndex,
        timestamp: new Date().toISOString(),
      };
      op.llmCalls[existingIndex] = updated;
      if (_broadcastWs) {
        _broadcastWs('operations', { action: 'llm-call-update', id, callIndex: updated.callIndex, call: updated });
      }
      return;
    }
  }

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
 * Mark that passenger registration is complete for a keyFinder op. Signals
 * to the frontend that the next POST in a Run-Group chain can fire — the
 * in-flight registry now sees this op's primary+passengers and will hard-
 * block them from the next call's passenger pack. No-op on non-running ops.
 *
 * @param {{id: string, passengerFieldKeys?: ReadonlyArray<string>}} args
 */
export function markPassengersRegistered({ id, passengerFieldKeys }) {
  const op = ops.get(id);
  if (!op || op.status !== 'running') return;
  if (op.passengersRegistered === true) return;
  op.passengersRegistered = true;
  if (Array.isArray(passengerFieldKeys)) {
    op.passengerFieldKeys = passengerFieldKeys.slice();
  }
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
 * Cancel a running or queued operation. Aborts the AbortController signal so
 * in-flight fetch() calls terminate immediately. Idempotent on terminal ops.
 *
 * A 'queued' op may be cancelled before it ever runs — useful when a user
 * dismisses a waiting op.
 */
export function cancelOperation({ id }) {
  const op = ops.get(id);
  if (!op) return;
  if (op.status !== 'running' && op.status !== 'queued') return;
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
 * Acquire a per-(type, productId, fieldKey) lock. Returns a release function.
 * If no lock is held the promise resolves immediately; otherwise the caller
 * awaits all prior acquires in FIFO order. Call the returned fn to release.
 *
 * @param {string} type — e.g. 'kf' for keyFinder (future-proofs for other finders)
 * @param {string} productId
 * @param {string} fieldKey
 * @returns {Promise<() => void>} release function — call exactly once
 */
export async function acquireKeyLock(type, productId, fieldKey) {
  const key = lockKey(type, productId, fieldKey);
  const prev = keyLocks.get(key) || Promise.resolve();
  let releaseFn;
  const myFinished = new Promise((r) => { releaseFn = r; });
  // Next acquire awaits prev + my finished — FIFO by construction
  const newTail = prev.then(() => myFinished);
  keyLocks.set(key, newTail);
  await prev;
  // On release, advance the chain and clean up the map entry if it's still
  // our tail (no new waiters registered behind us).
  let released = false;
  return () => {
    if (released) return;
    released = true;
    releaseFn();
    // Best-effort cleanup: if our tail is still the Map entry, drop it so the
    // next acquire is instant instead of awaiting an already-resolved promise.
    if (keyLocks.get(key) === newTail) keyLocks.delete(key);
  };
}

/**
 * Release helper — invokes the release function returned from acquireKeyLock.
 * Tolerates non-fn input (e.g. null from an error path that never acquired).
 *
 * @param {(() => void) | null | undefined} releaseFn
 */
export function releaseKeyLock(releaseFn) {
  if (typeof releaseFn === 'function') releaseFn();
}

/**
 * Test seam: clear all state. Not exported from index.js.
 */
export function _resetForTest() {
  ops.clear();
  for (const ctrl of controllers.values()) ctrl.abort();
  controllers.clear();
  keyLocks.clear();
  _broadcastWs = null;
  _seq = 0;
}
