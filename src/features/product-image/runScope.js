/**
 * PIF run-scope keys — partition discovery history (URLs/queries) by run type.
 *
 * Pools:
 *   priority-view  — Priority View runs (single, mode='view', focusView=null)
 *   view:<focus>   — Individual View runs (single, mode='view', focusView=<key>)
 *   loop-view      — Carousel loop view-mode iterations (any focus)
 *   loop-hero      — Carousel loop hero-mode iterations
 *   hero           — Standalone Hero runs (single, mode='hero')
 *
 * Variant scoping (variant_id / variant_key) is layered on top by callers; this
 * helper only resolves the run-type axis.
 */

export function resolveRunScopeKey({ orchestrator, mode, focusView } = {}) {
  if (orchestrator === 'loop') return mode === 'hero' ? 'loop-hero' : 'loop-view';
  if (mode === 'hero') return 'hero';
  if (focusView) return `view:${focusView}`;
  return 'priority-view';
}

export function scopeLabelFor(runScopeKey) {
  switch (runScopeKey) {
    case 'priority-view': return "this variant's priority-view searches";
    case 'loop-view':     return "this variant's loop view searches";
    case 'loop-hero':     return "this variant's loop hero searches";
    case 'hero':          return "this variant's hero searches";
    default:
      return runScopeKey && runScopeKey.startsWith('view:')
        ? `this variant's ${runScopeKey.slice(5)}-view searches`
        : "this variant's searches";
  }
}
