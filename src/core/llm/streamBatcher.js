// WHY: Batches LLM streaming deltas and flushes via broadcastWs at a fixed
// interval (~100ms). Prevents WebSocket flood from per-token broadcasts
// (~100/sec) while maintaining smooth streaming appearance (~10 msg/sec).

export function createStreamBatcher({ operationId, broadcastWs, intervalMs = 100 }) {
  let buffer = '';
  const callBuffers = new Map();
  let disposed = false;

  function flush() {
    if (buffer) {
      broadcastWs('llm-stream', { operationId, text: buffer });
      buffer = '';
    }
    for (const [key, entry] of callBuffers) {
      if (!entry.text) continue;
      broadcastWs('llm-stream', {
        operationId,
        callId: entry.callId,
        lane: entry.lane,
        label: entry.label,
        channel: entry.channel,
        text: entry.text,
      });
      callBuffers.delete(key);
    }
  }

  const timer = setInterval(flush, intervalMs);
  // WHY: unref prevents the timer from keeping the process alive on shutdown
  if (timer.unref) timer.unref();

  return {
    push(text, meta = null) {
      if (disposed) return;
      const chunk = typeof text === 'string' ? text : '';
      if (!chunk) return;
      const callId = typeof meta?.callId === 'string' ? meta.callId : '';
      if (!callId) {
        buffer += chunk;
        return;
      }
      const channel = typeof meta?.channel === 'string' ? meta.channel : 'content';
      const key = `${callId}\u0000${channel}`;
      const existing = callBuffers.get(key);
      if (existing) {
        existing.text += chunk;
        return;
      }
      callBuffers.set(key, {
        callId,
        lane: typeof meta?.lane === 'string' ? meta.lane : '',
        label: typeof meta?.label === 'string' ? meta.label : '',
        channel,
        text: chunk,
      });
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
