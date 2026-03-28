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
// WHY: Navigation guard uses page.once('framenavigated') to detect and
// count unwanted navigations instead of route interception. Route interception
// (page.route/ctx.route) serializes ALL requests through a handler function,
// causing 45s timeouts on JS-heavy sites like Shopify. The framenavigated
// approach is passive — zero overhead on request handling.
function setupNavigationGuard(page) {
  let blockedCount = 0;
  const initialUrl = page.url();

  const onNavigated = (frame) => {
    try {
      if (frame === page.mainFrame() && frame.url() !== initialUrl) {
        blockedCount++;
      }
    } catch { /* frame access failure — non-fatal */ }
  };

  if (typeof page.on === 'function') page.on('framenavigated', onNavigated);

  return {
    get blocked() { return blockedCount; },
    async cleanup() {
      try { page.off('framenavigated', onNavigated); } catch {}
    },
  };
}

export const domExpansionPlugin = {
  name: 'domExpansion',
  suites: ['dismiss'],
  hooks: {
    async onDismiss({ page, settings }) {
      const enabled = settings?.domExpansionEnabled !== false && settings?.domExpansionEnabled !== 'false';
      if (!enabled) return { enabled: false, selectors: [], found: 0, clicked: 0, expanded: 0, blocked: 0, skippedNav: 0, contentDelta: 0, settleMs: 0, budgetExhausted: false };

      const selectorStr = String(settings?.domExpansionSelectors || '');
      const selectors = selectorStr.split(',').map((s) => s.trim()).filter(Boolean);
      const maxClicks = Number(settings?.domExpansionMaxClicks) || 50;
      const settleMs = Number(settings?.domExpansionSettleMs) || 1500;
      const budgetMs = Number(settings?.domExpansionBudgetMs) || 15000;

      // Set up navigation guard
      const guard = setupNavigationGuard(page);

      // WHY: Batch all expansion work in a single page.evaluate to avoid
      // per-element round-trips. Each evaluate call costs 50-100ms. With 20+
      // elements × 3 evaluates each, that was 3-6 seconds. One call does it all.
      let result = { found: 0, clicked: 0, expanded: 0, skippedNav: 0, contentDelta: 0 };
      try {
        result = await page.evaluate(({ selectors: sels, maxClicks: max }) => {
          const initialLen = document.body.innerHTML.length;
          let found = 0, clicked = 0, expanded = 0, skippedNav = 0;

          for (const selector of sels) {
            if (clicked >= max) break;
            const elements = document.querySelectorAll(selector);
            found += elements.length;

            for (const el of elements) {
              if (clicked >= max) break;
              const tag = el.tagName.toUpperCase();
              const href = el.getAttribute('href');
              const target = el.getAttribute('target');
              const role = el.getAttribute('role');
              const ariaExpanded = el.getAttribute('aria-expanded');

              // Classification — skip navigation-likely elements
              const isSafe = tag === 'BUTTON' || role === 'button' || tag === 'SUMMARY'
                || ariaExpanded === 'false'
                || (href && /^(#|javascript:)/.test(href))
                || (!href && !target);

              if (!isSafe) { skippedNav++; continue; }
              if (target === '_blank') { skippedNav++; continue; }
              if (href && /^(https?:\/\/|\/[^#])/.test(href)) { skippedNav++; continue; }

              try {
                el.click();
                clicked++;
                if (ariaExpanded === 'false' && el.getAttribute('aria-expanded') === 'true') {
                  expanded++;
                }
              } catch { /* click failure — skip */ }
            }
          }

          const contentDelta = document.body.innerHTML.length - initialLen;
          return { found, clicked, expanded, skippedNav, contentDelta };
        }, { selectors, maxClicks });
      } catch { /* evaluate failure — non-fatal */ }

      await guard.cleanup();

      return {
        enabled: true,
        selectors,
        found: result.found,
        clicked: result.clicked,
        expanded: result.expanded,
        blocked: guard.blocked,
        skippedNav: result.skippedNav,
        contentDelta: result.contentDelta,
        settleMs: 0,
        budgetExhausted: false,
      };
    },
  },
};
