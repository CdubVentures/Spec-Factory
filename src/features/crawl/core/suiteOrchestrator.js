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
  const loadingDelayMs = Number(settings?.fetchLoadingDelayMs ?? 3000);
  const rounds = Math.max(1, Number(settings?.fetchDismissRounds ?? 2));
  const suiteMode = settings?.fetchSuiteMode || 'sequential';

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

  // WHY: Quick overlay check after initial dismiss. If no overlays remain and
  // the observer hasn't caught anything, subsequent dismiss rounds are wasted
  // time (1-3s per round). Scroll rounds still run — they trigger lazy content.
  let skipDismissRounds = false;
  try {
    const remaining = await ctx.page.evaluate(() => {
      const vw = window.innerWidth, vh = window.innerHeight;
      if (vw === 0 || vh === 0) return 0;
      let count = 0;
      for (const el of document.querySelectorAll('*')) {
        const s = window.getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden') continue;
        if (s.position !== 'fixed' && s.position !== 'absolute') continue;
        if (el.tagName === 'NAV' || el.tagName === 'HEADER') continue;
        const z = parseInt(s.zIndex, 10);
        if (isNaN(z) || z < 500) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 100 || r.height < 40) continue;
        if ((r.width * r.height) / (vw * vh) < 0.1) continue;
        count++;
        if (count > 0) break;
      }
      return count;
    });
    const guard = await ctx.page.evaluate(() => window.__sfOverlayGuard).catch(() => null);
    skipDismissRounds = remaining === 0 && (!guard || guard.caught === 0);
  } catch { /* check failure — run all rounds */ }

  // Round loop: scroll → dismiss
  for (let round = 1; round <= rounds; round++) {
    try { await runner.runHook('onScroll', ctx); } catch (err) {
      logger?.warn?.('suite_scroll_error', { round, error: err?.message });
    }
    if (!skipDismissRounds) {
      try { await runDismiss(ctx); } catch (err) {
        logger?.warn?.('suite_dismiss_error', { round, error: err?.message });
      }
    }
  }

  const fetchWindowEndMs = Date.now();

  return { rounds, loadingDelayMs, suiteMode, fetchWindowStartMs, fetchWindowEndMs };
}
