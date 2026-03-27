/**
 * DOM Expansion plugin — clicks expand/show-more buttons to reveal collapsed
 * sections and tables before page capture.
 *
 * Navigation-safe: intercepts document-level requests triggered by clicks.
 * Content-aware: classifies elements before clicking, verifies content delta after.
 * Budget-managed: respects a time budget to avoid eating the handler timeout.
 *
 * Hooks into onInteract (after auto-scroll, before screenshots).
 */

// WHY: Elements with these patterns are almost certainly navigation links,
// not expand/collapse triggers. Clicking them destroys the page.
const NAVIGATION_HREF_RE = /^(https?:\/\/|\/[^#])/;
const SAFE_HREF_RE = /^(#|javascript:)/;

/**
 * Classify an element as safe-to-click (expand) or navigation-likely (skip).
 * Returns { safe: boolean, reason: string }.
 *
 * WHY: Single evaluate() call instead of multiple getAttribute() calls.
 * tagName is a DOM property (not an attribute), so getAttribute('tagName')
 * returns null in real Playwright. Batching into one evaluate is also faster.
 */
async function classifyElement(el) {
  try {
    const attrs = await el.evaluate((node) => ({
      tagName: node.tagName || '',
      href: node.getAttribute('href'),
      target: node.getAttribute('target'),
      role: node.getAttribute('role'),
      ariaExpanded: node.getAttribute('aria-expanded'),
    }));

    const tag = (attrs.tagName).toUpperCase();
    const { href, target, role, ariaExpanded } = attrs;

    // <button> and role="button" are always safe — they don't navigate
    if (tag === 'BUTTON' || role === 'button') {
      return { safe: true, reason: 'button-element' };
    }

    // <summary> inside <details> is always safe
    if (tag === 'SUMMARY') {
      return { safe: true, reason: 'details-summary' };
    }

    // aria-expanded="false" is explicitly an expand trigger
    if (ariaExpanded === 'false') {
      return { safe: true, reason: 'aria-expanded' };
    }

    // target="_blank" opens a new tab — skip
    if (target === '_blank') {
      return { safe: false, reason: 'target-blank' };
    }

    // Anchor with href — check if it's a navigation link
    if (href != null && href !== '') {
      // Hash-only and javascript: are safe
      if (SAFE_HREF_RE.test(href)) {
        return { safe: true, reason: 'safe-href' };
      }
      // Full URLs or path-based links are navigation
      if (NAVIGATION_HREF_RE.test(href)) {
        return { safe: false, reason: 'navigation-href' };
      }
    }

    // No signals either way — allow with caution
    return { safe: true, reason: 'no-signal' };
  } catch {
    // If classification fails, allow the click (fail-open for backward compat)
    return { safe: true, reason: 'classify-error' };
  }
}

/**
 * Set up route interception to block document-level navigations triggered
 * by clicks. Returns { cleanup, blockedCount } for teardown.
 */
function setupNavigationGuard(page) {
  let blockedCount = 0;
  let ctx;
  let handler;

  try {
    ctx = typeof page.context === 'function' ? page.context() : null;
  } catch {
    ctx = null;
  }

  if (!ctx || typeof ctx.route !== 'function') {
    return {
      blockedCount: 0,
      async cleanup() {},
      get blocked() { return blockedCount; },
    };
  }

  handler = async (route) => {
    try {
      const req = route.request();
      const isNav = typeof req.isNavigationRequest === 'function'
        ? req.isNavigationRequest()
        : req.resourceType?.() === 'document';

      if (isNav) {
        blockedCount++;
        await route.abort();
      } else {
        // Non-navigation requests pass through
        if (typeof route.continue_ === 'function') await route.continue_();
        else if (typeof route.continue === 'function') await route.continue();
      }
    } catch {
      // Route handling failure — don't crash
    }
  };

  const setup = ctx.route('**/*', handler).catch(() => {});

  return {
    setup,
    get blocked() { return blockedCount; },
    async cleanup() {
      try {
        if (ctx && typeof ctx.unroute === 'function') {
          await ctx.unroute('**/*', handler);
        }
      } catch { /* cleanup failure is non-fatal */ }
    },
  };
}

export const domExpansionPlugin = {
  name: 'domExpansion',
  hooks: {
    async onInteract({ page, settings }) {
      const enabled = settings?.domExpansionEnabled !== false && settings?.domExpansionEnabled !== 'false';
      if (!enabled) return { enabled: false, selectors: [], found: 0, clicked: 0, expanded: 0, blocked: 0, skippedNav: 0, contentDelta: 0, settleMs: 0, budgetExhausted: false };

      const selectorStr = String(settings?.domExpansionSelectors || '');
      const selectors = selectorStr.split(',').map((s) => s.trim()).filter(Boolean);
      const maxClicks = Number(settings?.domExpansionMaxClicks) || 50;
      const settleMs = Number(settings?.domExpansionSettleMs) || 1500;
      const budgetMs = Number(settings?.domExpansionBudgetMs) || 15000;

      let found = 0;
      let clicked = 0;
      let expanded = 0;
      let skippedNav = 0;
      let budgetExhausted = false;

      // Capture initial state for content-delta verification
      let initialContentLength = 0;
      try {
        initialContentLength = await page.evaluate(() => document.body.innerHTML.length);
      } catch { /* evaluation failure — proceed without delta tracking */ }

      // Capture initial URL for navigation detection
      const initialUrl = page.url();

      // Set up navigation guard
      const guard = setupNavigationGuard(page);
      if (guard.setup) await guard.setup;

      const startTime = Date.now();

      for (const selector of selectors) {
        if (budgetExhausted) break;

        let elements = [];
        try {
          elements = await page.locator(selector).all();
        } catch { continue; }

        found += elements.length;

        for (const el of elements) {
          if (clicked >= maxClicks) break;

          // Budget check
          if (Date.now() - startTime >= budgetMs) {
            budgetExhausted = true;
            break;
          }

          // Pre-click classification
          const { safe, reason } = await classifyElement(el);
          if (!safe) {
            skippedNav++;
            continue;
          }

          // Capture pre-click content length for per-element delta
          let preClickLength = 0;
          try {
            preClickLength = await page.evaluate(() => document.body.innerHTML.length);
          } catch { /* proceed without per-element delta */ }

          try {
            await el.click({ timeout: 2000 });
            clicked++;

            // Post-click content verification
            try {
              const postClickLength = await page.evaluate(() => document.body.innerHTML.length);
              if (postClickLength > preClickLength) {
                expanded++;
              }
            } catch { /* post-click eval failure — count as expanded optimistically */ }
          } catch { /* element may not be clickable — skip */ }
        }

        if (clicked >= maxClicks) break;
      }

      // Settle wait
      if (settleMs > 0) await page.waitForTimeout(settleMs);

      // Final content-delta measurement
      let finalContentLength = 0;
      try {
        finalContentLength = await page.evaluate(() => document.body.innerHTML.length);
      } catch { /* evaluation failure */ }

      const contentDelta = finalContentLength - initialContentLength;

      // Cleanup navigation guard
      await guard.cleanup();

      return {
        enabled: true,
        selectors,
        found,
        clicked,
        expanded,
        blocked: guard.blocked,
        skippedNav,
        contentDelta,
        settleMs,
        budgetExhausted,
      };
    },
  },
};
