// WHY: Batches LLM streaming deltas and flushes via broadcastWs at a fixed
// interval (~100ms). Prevents WebSocket flood from per-token broadcasts
// (~100/sec) while maintaining smooth streaming appearance (~10 msg/sec).

export function createStreamBatcher({ operationId, broadcastWs, intervalMs = 100 }) {
  let buffer = '';
  let disposed = false;

  function flush() {
    if (!buffer) return;
    broadcastWs('llm-stream', { operationId, text: buffer });
    buffer = '';
  }

  const timer = setInterval(flush, intervalMs);
  // WHY: unref prevents the timer from keeping the process alive on shutdown
  if (timer.unref) timer.unref();

  return {
    push(text) {
      if (disposed) return;
      buffer += text;
    },
    flush() {
      if (disposed) return;
      flush();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clearInterval(timer);
      flush();
    },
  };
}
