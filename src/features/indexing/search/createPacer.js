// WHY: Injectable pacer factory replaces module-level mutable state.
// Each search module gets its own pacer instance. Tests inject a no-delay pacer.

export function createPacer({ minIntervalMs = 0 } = {}) {
  let _lastQueryMs = 0;

  return {
    async waitForSlot({ interval, jitterFactor = 0 } = {}) {
      const effectiveInterval = Math.max(0, interval ?? minIntervalMs);
      if (effectiveInterval <= 0) return;

      const jitter = jitterFactor > 0
        ? Math.floor(Math.random() * effectiveInterval * jitterFactor)
        : 0;
      const target = effectiveInterval + jitter;
      const now = Date.now();
      const elapsed = now - _lastQueryMs;

      if (elapsed < target) {
        await new Promise((r) => setTimeout(r, target - elapsed));
      }
      _lastQueryMs = Date.now();
    },

    resetForTests() {
      _lastQueryMs = 0;
    },
  };
}
