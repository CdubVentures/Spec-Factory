/**
 * keyFinder in-flight registry — per-process passenger coordination.
 *
 * Tracks what (productId, fieldKey) pairs are currently in flight as primary
 * or passenger so concurrent calls can coordinate. Contract locked
 * 2026-04-22 per §6.2 of docs/implementation/key feature implemenation/
 * per-key-finder-roadmap.html.
 *
 * Consumers:
 *   - keyPassengerBuilder (live run): hard-block on busy primaries + tier cap
 *   - keyFinderPreviewPrompt (read-only): preview honors the same rules
 *   - keyFinderRoutes summary (read-only): surfaces counts per row for the
 *     dashboard's "riding elsewhere" indicator
 *
 * NOT persisted — crashes wipe the registry. The per-(pid, fieldKey) queue
 * lock in operationsRegistry.js serializes same-key races independently.
 *
 * Module-singleton pattern (matches acquireKeyLock in operationsRegistry.js).
 * Tests use _resetForTest to clear between runs.
 */

const state = new Map();

function keyOf(productId, fieldKey) {
  return `${String(productId || '')}:${String(fieldKey || '')}`;
}

function readEntry(productId, fieldKey) {
  return state.get(keyOf(productId, fieldKey)) || { asPrimary: 0, asPassenger: 0 };
}

/**
 * Register a key as in flight for the given role. Idempotent in the sense
 * that repeated calls increment the count — release must be paired 1:1.
 *
 * @param {string} productId
 * @param {string} fieldKey
 * @param {'primary' | 'passenger'} role
 */
export function register(productId, fieldKey, role) {
  if (role !== 'primary' && role !== 'passenger') {
    throw new Error(`keyFinderRegistry.register: invalid role "${role}" (expected "primary" or "passenger")`);
  }
  const k = keyOf(productId, fieldKey);
  const prev = state.get(k) || { asPrimary: 0, asPassenger: 0 };
  const next = role === 'primary'
    ? { asPrimary: prev.asPrimary + 1, asPassenger: prev.asPassenger }
    : { asPrimary: prev.asPrimary, asPassenger: prev.asPassenger + 1 };
  state.set(k, next);
}

/**
 * Release a prior register. Never decrements below 0. Prunes the Map entry
 * when both counts reach 0 so state.size is a clean "how many in flight".
 */
export function release(productId, fieldKey, role) {
  if (role !== 'primary' && role !== 'passenger') {
    throw new Error(`keyFinderRegistry.release: invalid role "${role}"`);
  }
  const k = keyOf(productId, fieldKey);
  const prev = state.get(k);
  if (!prev) return;
  const next = role === 'primary'
    ? { asPrimary: Math.max(0, prev.asPrimary - 1), asPassenger: prev.asPassenger }
    : { asPrimary: prev.asPrimary, asPassenger: Math.max(0, prev.asPassenger - 1) };
  if (next.asPrimary === 0 && next.asPassenger === 0) {
    state.delete(k);
  } else {
    state.set(k, next);
  }
}

/**
 * True when the key is currently in flight as a primary anywhere.
 */
export function isPrimary(productId, fieldKey) {
  return readEntry(productId, fieldKey).asPrimary > 0;
}

/**
 * @returns {{asPrimary: number, asPassenger: number, total: number}}
 */
export function count(productId, fieldKey) {
  const e = readEntry(productId, fieldKey);
  return { asPrimary: e.asPrimary, asPassenger: e.asPassenger, total: e.asPrimary + e.asPassenger };
}

/**
 * Test seam — clear all state. Not exported from index.js.
 */
export function _resetForTest() {
  state.clear();
}

/**
 * Test seam — peek at internal Map size. Used only to verify pruning.
 */
export function _sizeForTest() {
  return state.size;
}
