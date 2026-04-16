/**
 * Per-category mutex — prevents concurrent write-conflicting operations
 * on the same category (e.g. compile + validate both touch _generated/).
 *
 * Non-blocking: acquire returns immediately with { acquired: false } if locked.
 * No queue, no deadlock detection. The caller returns 409 and the user retries.
 */

/** @type {Map<string, boolean>} */
const locks = new Map();

/**
 * Attempt to acquire a category lock.
 * @param {string} category
 * @returns {{ acquired: boolean, release: () => void }}
 */
export function acquireCategoryLock(category) {
  if (locks.has(category)) {
    return { acquired: false, release: () => {} };
  }
  locks.set(category, true);
  let released = false;
  return {
    acquired: true,
    release() {
      if (released) return;
      released = true;
      locks.delete(category);
    },
  };
}

/** Test seam: clear all locks. */
export function _resetForTest() {
  locks.clear();
}
