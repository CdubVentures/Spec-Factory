// WHY: Centralized config mutation gate (Phase 13).
// All runtime config mutations flow through applyPatch() instead of direct
// config[key] = value. Provides snapshot/rollback capability (fixes F14-F16).

export function createConfigMutationGate(config) {
  let previousSnapshot = null;

  return {
    /** Apply a settings patch to config. Saves snapshot for rollback. */
    applyPatch(patch, { source = 'unknown' } = {}) {
      previousSnapshot = { ...config };
      for (const [key, value] of Object.entries(patch)) {
        if (!Object.hasOwn(config, key)) continue;
        config[key] = value;
      }
    },

    /** Rollback to the snapshot taken before the last applyPatch. */
    rollback() {
      if (!previousSnapshot) return false;
      Object.assign(config, previousSnapshot);
      previousSnapshot = null;
      return true;
    },

    /** Read the current config (no mutation). */
    snapshot() {
      return { ...config };
    }
  };
}
