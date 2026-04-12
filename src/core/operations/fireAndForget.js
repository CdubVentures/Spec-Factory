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
 * @param {Function} opts.completeOperation — ({ id }) => void
 * @param {Function} opts.failOperation — ({ id, error }) => void
 * @param {Function} [opts.emitDataChange] — (args) => void
 */
export function fireAndForget({
  res,
  jsonRes,
  op,
  batcher,
  broadcastWs,
  emitArgs,
  asyncWork,
  completeOperation,
  failOperation,
  emitDataChange,
}) {
  asyncWork()
    .then((result) => {
      if (batcher) batcher.dispose();
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
      if (emitArgs && broadcastWs && emitDataChange) {
        emitDataChange({ broadcastWs, ...emitArgs });
      }
    })
    .catch((err) => {
      if (batcher) batcher.dispose();
      failOperation({ id: op.id, error: err instanceof Error ? err.message : String(err) });
      // WHY: No data-change on throw — state is unchanged.
    });

  return jsonRes(res, 202, { ok: true, operationId: op.id });
}
