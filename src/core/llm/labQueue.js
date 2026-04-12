/**
 * Dispatch-throttle queue for lab-proxied LLM calls.
 *
 * WHY: LLM Lab proxies calls through a single ChatGPT browser session.
 * Firing many requests within milliseconds can overwhelm the session.
 * This queue spaces out the DISPATCH of each call by `delayMs`, but
 * does NOT wait for the previous call to complete — calls run concurrently
 * once dispatched. The delay only controls when the next fetch fires.
 */

let _tail = Promise.resolve();

/**
 * Throttle dispatch of an async function.
 * Waits for the previous dispatch + delayMs, fires fn(), then immediately
 * releases the queue for the next caller. The caller awaits fn()'s result.
 *
 * @param {() => Promise<T>} fn — async function to execute
 * @param {number} delayMs — ms to wait before dispatching (after previous dispatch)
 * @returns {Promise<T>} — result of fn()
 */
export function enqueueLabCall(fn, delayMs) {
  // WHY: Separate the dispatch gate from the call result.
  // _tail tracks when the NEXT call is allowed to fire (delay only).
  // The caller gets fn()'s result independently — calls overlap freely.
  let dispatch;
  const gate = new Promise((resolve) => { dispatch = resolve; });

  const prev = _tail;
  _tail = prev
    .catch(() => {})
    .then(() => sleep(delayMs))
    .then(() => { dispatch(); });

  return gate.then(() => fn());
}

/** Reset queue state. Test-only — not part of public API. */
export function _resetForTest() {
  _tail = Promise.resolve();
}

function sleep(ms) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((r) => setTimeout(r, ms));
}
