/**
 * Fire-and-forget helper for long-running route handlers.
 *
 * Returns 202 Accepted + operationId immediately, then runs asyncWork
 * in the background. On completion/rejection/throw, updates the operation
 * registry and optionally emits a data-change event.
 *
 * WHY: Chrome/Edge enforce 6 concurrent HTTP/1.1 connections per origin.
 * Holding connections open for multi-minute LLM calls starves the browser.
 */

/**
 * @param {object} opts
 * @param {object} opts.res — HTTP response object
 * @param {Function} opts.jsonRes — (res, status, body) => boolean
 * @param {object} opts.op — { id } from registerOperation
 * @param {object} [opts.batcher] — stream batcher (has .dispose())
 * @param {Function} [opts.broadcastWs] — WebSocket broadcast function
 * @param {object} [opts.emitArgs] — { event, category, entities, meta } for data-change
 * @param {Function} opts.asyncWork — () => Promise<result>
 * @param {AbortSignal} [opts.signal] — from getOperationSignal; when aborted, routes to cancelOperation
 * @param {Function} opts.completeOperation — ({ id }) => void
 * @param {Function} opts.failOperation — ({ id, error }) => void
 * @param {Function} [opts.cancelOperation] — ({ id }) => void
 * @param {Function} [opts.emitDataChange] — (args) => void
 * @param {Function} [opts.onSettled] — () => void, called exactly once on every
 *   terminal transition (success / fail / cancel / abort). Safe place to release
 *   per-key queue locks, unsubscribe side-channels, etc. Errors inside onSettled
 *   are swallowed so they never unseat the status transition.
 */
export function fireAndForget({
  res,
  jsonRes,
  op,
  batcher,
  broadcastWs,
  emitArgs,
  asyncWork,
  signal,
  completeOperation,
  failOperation,
  cancelOperation,
  emitDataChange,
  onSettled,
}) {
  const emitChange = () => {
    if (emitArgs && broadcastWs && emitDataChange) {
      emitDataChange({ broadcastWs, ...emitArgs });
    }
  };

  let settled = false;
  const runOnSettled = () => {
    if (settled) return;
    settled = true;
    if (typeof onSettled !== 'function') return;
    try { onSettled(); } catch { /* swallow — lock cleanup must not mask op status */ }
  };

  asyncWork()
    .then((result) => {
      if (batcher) batcher.dispose();

      // WHY: Loop orchestrators catch AbortError internally and return
      // accumulated results. The signal is aborted but asyncWork resolved.
      if (signal?.aborted && cancelOperation) {
        cancelOperation({ id: op.id });
        emitChange();
        runOnSettled();
        return;
      }

      if (result?.rejected) {
        const reason = result.rejections?.[0]?.reason_code === 'llm_error'
          ? 'LLM call failed'
          : (result.rejections?.[0]?.message || 'Rejected');
        failOperation({ id: op.id, error: reason });
      } else {
        completeOperation({ id: op.id });
      }
      // WHY: Emit data-change for BOTH success and rejection.
      // Rejected runs still update state (persisted run history, cooldown).
      emitChange();
      runOnSettled();
    })
    .catch((err) => {
      if (batcher) batcher.dispose();

      // WHY: AbortError means the operation was cancelled via cancelOperation.
      // Route to cancelOperation instead of failOperation.
      if ((err.name === 'AbortError' || signal?.aborted) && cancelOperation) {
        cancelOperation({ id: op.id });
        emitChange();
        runOnSettled();
        return;
      }

      failOperation({ id: op.id, error: err instanceof Error ? err.message : String(err) });
      // WHY: No data-change on throw — state is unchanged.
      runOnSettled();
    });

  return jsonRes(res, 202, { ok: true, operationId: op.id });
}
