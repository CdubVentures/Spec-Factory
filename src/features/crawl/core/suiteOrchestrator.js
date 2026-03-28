/**
 * Suite Orchestrator — round-based fetch plugin execution loop.
 *
 * Lifecycle:
 *   [loading delay]
 *   → onDismiss (initial cleanup)
 *   → for round 1..N:
 *       onScroll (autoScroll does its sub-passes)
 *       onDismiss (catch scroll-triggered popups)
 *   → return telemetry → HTML capture → extraction
 *
 * The dismiss suite fires BEFORE the first scroll, BETWEEN each scroll,
 * and AFTER the last scroll. This catches popups that appear during scroll.
 */

/**
 * @param {object} opts
 * @param {object} opts.runner      — pluginRunner instance (runHook, runHookConcurrent)
 * @param {object} opts.settings    — resolved runtime settings
 * @param {object} opts.ctx         — { page, request, response, workerId }
 * @param {object} [opts.logger]
 * @returns {{ rounds: number, loadingDelayMs: number, suiteMode: string, fetchWindowStartMs: number, fetchWindowEndMs: number }}
 */
export async function runFetchSuiteLoop({ runner, settings, ctx, logger }) {
  // WHY: Default 0 — Crawlee already confirmed the page loaded via waitUntil.
  // No reason to stall. User can override via settings if a specific site needs it.
  const loadingDelayMs = Number(settings?.fetchLoadingDelayMs ?? 0);
  const rounds = Math.max(1, Number(settings?.fetchDismissRounds ?? 2));
  // WHY: Default concurrent — all dismiss plugins fire via Promise.allSettled.
  // Each plugin does a single page.evaluate() (~20-50ms), so concurrent wall
  // time ≈ slowest single plugin (~220ms) instead of sum of all plugins sequentially.
  // Override to 'sequential' if a specific site needs ordered dismiss execution.
  const suiteMode = settings?.fetchSuiteMode || 'concurrent';

  const runDismiss = suiteMode === 'concurrent'
    ? (c) => runner.runHookConcurrent('onDismiss', c)
    : (c) => runner.runHook('onDismiss', c);

  // Loading delay — let JS hydrate, delayed popups appear
  if (loadingDelayMs > 0) {
    await ctx.page.waitForTimeout(loadingDelayMs);
  }

  // WHY: Timestamp the fetch window for video trimming.
  // Video records from page creation, but we only want the dismiss→scroll window.
  const fetchWindowStartMs = Date.now();

  // Initial dismiss pass (before any scrolling)
  try { await runDismiss(ctx); } catch (err) {
    logger?.warn?.('suite_dismiss_error', { round: 0, error: err?.message });
  }

  // Round loop: scroll → dismiss
  for (let round = 1; round <= rounds; round++) {
    try { await runner.runHook('onScroll', ctx); } catch (err) {
      logger?.warn?.('suite_scroll_error', { round, error: err?.message });
    }
    try { await runDismiss(ctx); } catch (err) {
      logger?.warn?.('suite_dismiss_error', { round, error: err?.message });
    }
  }

  const fetchWindowEndMs = Date.now();

  return { rounds, loadingDelayMs, suiteMode, fetchWindowStartMs, fetchWindowEndMs };
}
