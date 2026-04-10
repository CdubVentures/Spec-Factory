/**
 * Operations Registry — in-memory tracker for long-running operations.
 *
 * Ephemeral runtime state (not persisted). Any module can register, update,
 * complete, or fail operations. Each mutation broadcasts via WebSocket so
 * the frontend sidebar tracker stays in sync.
 *
 * Invariants:
 * - id is a UUID (globally unique)
 * - status transitions: running → done | error (terminal, no re-entry)
 * - currentStageIndex ∈ [0, stages.length)
 * - Lost on server restart (acceptable — see plan CQRS exception)
 */

import crypto from 'node:crypto';

/** @type {Map<string, object>} */
const ops = new Map();

/** @type {Function|null} */
let _broadcastWs = null;

/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const evictionTimers = new Map();

let _seq = 0;
const EVICTION_DELAY_MS = 60_000;

function broadcast(operation, action = 'upsert') {
  if (!_broadcastWs) return;
  _broadcastWs('operations', { action, operation: action === 'remove' ? undefined : { ...operation }, id: operation.id });
}

function broadcastRemove(id) {
  if (!_broadcastWs) return;
  _broadcastWs('operations', { action: 'remove', id });
}

function scheduleEviction(id) {
  if (evictionTimers.has(id)) clearTimeout(evictionTimers.get(id));
  const timer = setTimeout(() => {
    ops.delete(id);
    evictionTimers.delete(id);
    broadcastRemove(id);
  }, EVICTION_DELAY_MS);
  // WHY: unref prevents the timer from keeping the process alive on shutdown
  if (timer.unref) timer.unref();
  evictionTimers.set(id, timer);
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
export function registerOperation({ type, category, productId, productLabel, stages }) {
  if (!type) throw new Error('type is required');
  const id = crypto.randomUUID();
  const operation = {
    id,
    type,
    category: category || '',
    productId: productId || '',
    productLabel: productLabel || '',
    stages: Array.isArray(stages) ? stages : [],
    currentStageIndex: 0,
    status: 'running',
    startedAt: new Date().toISOString(),
    _seq: ++_seq,
    endedAt: null,
    error: null,
    modelInfo: null,
  };
  ops.set(id, operation);
  broadcast(operation);
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
 * Attach resolved model info to a running operation.
 * Replaces on repeat calls (primary → fallback).
 */
export function updateModelInfo({ id, model, provider, isFallback, accessMode, thinking, webSearch }) {
  const op = ops.get(id);
  if (!op || op.status !== 'running') return;
  op.modelInfo = {
    model: typeof model === 'string' ? model : '',
    provider: typeof provider === 'string' ? provider : '',
    isFallback: Boolean(isFallback),
    accessMode: typeof accessMode === 'string' ? accessMode : 'api',
    thinking: Boolean(thinking),
    webSearch: Boolean(webSearch),
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
  broadcast(op);
  scheduleEviction(id);
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
  broadcast(op);
  scheduleEviction(id);
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
  _broadcastWs = null;
  _seq = 0;
  for (const timer of evictionTimers.values()) clearTimeout(timer);
  evictionTimers.clear();
}
