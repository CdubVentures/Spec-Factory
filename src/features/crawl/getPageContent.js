// WHY: Playwright's page.content() can throw on SPA navigation races —
// "Execution context was destroyed" when the page navigates mid-call,
// "Navigation failed" when a frame re-attaches, or "frame detached" errors.
// Session 3 audit found 9/9 Wooting 60HE fetches failed for this reason
// before the BD fallback caught them. A single retry after networkidle
// recovers most races without hiding real bugs.

const NAV_RACE_PATTERN = /execution context.*destroyed|navigation\s+failed|target\s+page.*closed|frame.*detached|target\s+closed/i;

function isNavRaceError(err) {
  const msg = String(err?.message || '').toLowerCase();
  return NAV_RACE_PATTERN.test(msg);
}

export async function getPageContentWithRetry(page, { logger, waitTimeoutMs = 5000 } = {}) {
  try {
    return await page.content();
  } catch (err) {
    if (!isNavRaceError(err)) throw err;

    const url = typeof page.url === 'function' ? page.url() : '';
    logger?.info?.('page_content_retry', {
      url,
      error: String(err?.message || '').slice(0, 200),
    });

    try {
      await page.waitForLoadState('networkidle', { timeout: waitTimeoutMs });
    } catch {
      // networkidle timeout is fine — still attempt the retry
    }

    return await page.content();
  }
}
