/**
 * Overlay Dismissal plugin — detects and dismisses non-cookie popups before
 * page capture: newsletter signups, chat widgets, paywall overlays, age gates,
 * exit-intent modals, "disable adblock" notices, and scroll-locked body states.
 *
 * 3-layer approach:
 *   Layer 1 (beforeNavigate): CSS suppression + MutationObserver guard via addInitScript
 *   Layer 2 (afterNavigate):  Heuristic DOM scan — close-click first, DOM removal fallback
 *   Layer 3 (afterNavigate):  Scroll-lock reset (body overflow:hidden → auto)
 *
 * Runs AFTER cookieConsent (no duplication) but BEFORE autoScroll/domExpansion.
 */

// WHY: Selectors from Fanboy's Annoyance List + Crawl4AI overlay patterns.
// These cover the most common non-cookie popup patterns across the web.
// WHY: Selectors from Fanboy's Annoyance List + Crawl4AI overlay patterns +
// real-world discoveries from live crawls (e.g. Shopify "Back In Stock" widget).
const SUPPRESSION_CSS = `
  [class*="modal-overlay"],[class*="popup-overlay"],[class*="newsletter-popup"],
  [class*="newsletter-modal"],[class*="signup-modal"],[class*="subscribe-modal"],
  [class*="exit-intent"],[class*="paywall-overlay"],[class*="adblock-notice"],
  [class*="age-gate"],[class*="newsletter-widget"],[class*="popup-container"],
  [id*="newsletter-popup"],[id*="exit-modal"],[id*="subscribe-overlay"],
  [class*="notification-popup"],[class*="promo-popup"],[class*="email-popup"],
  [class*="signup-overlay"],[class*="lead-capture"],[class*="email-capture"],
  .bis-reset,.klaviyo-popup,.omnisend-popup,.privy-popup,
  [id*="privy"],[id*="klaviyo"],[class*="wheelio"],[class*="spin-to-win"],
  [id*="reminder-info"],[class*="reminder-info"],[class*="region-popup"],
  [class*="locale-popup"],[class*="country-selector-popup"],[class*="geo-redirect"] {
    display: none !important;
    visibility: hidden !important;
    z-index: -9999 !important;
  }
  body, html {
    overflow: auto !important;
    position: static !important;
  }
`;

/**
 * Build the init script string containing CSS suppression + MutationObserver.
 * Runs before page scripts via addInitScript().
 */
function buildInitScript(mode) {
  const css = SUPPRESSION_CSS.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();

  // WHY: MutationObserver catches delayed popups (scroll-triggered newsletters,
  // timed modals, exit-intent overlays) that appear after initial page load.
  // Exposes window.__sfOverlayGuard for telemetry queries from afterNavigate.
  // WHY: addInitScript runs before page scripts but after document creation.
  // The observer must handle both cases: body already exists OR body appears later.
  // Using both DOMContentLoaded AND a fallback polling loop ensures attachment
  // regardless of timing. Polling stops after 5 seconds to avoid infinite loops.
  const observer = `
    window.__sfOverlayGuard = { caught: 0 };
    function _sfCheckOverlay(node) {
      try {
        if (node.nodeType !== 1) return;
        var s = window.getComputedStyle(node);
        var pos = s.position;
        if (pos !== 'fixed' && pos !== 'absolute') return;
        var z = parseInt(s.zIndex, 10);
        if (isNaN(z) || z < 900) return;
        var r = node.getBoundingClientRect();
        var cov = (r.width * r.height) / (window.innerWidth * window.innerHeight);
        if (cov < 0.3) return;
        node.style.display = 'none';
        window.__sfOverlayGuard.caught++;
      } catch(e) {}
    }
    function _sfStartObserver() {
      if (!document.body || window.__sfObsStarted) return false;
      window.__sfObsStarted = true;
      try {
        var obs = new MutationObserver(function(mutations) {
          for (var i = 0; i < mutations.length; i++) {
            var added = mutations[i].addedNodes;
            for (var j = 0; j < added.length; j++) {
              _sfCheckOverlay(added[j]);
            }
          }
        });
        obs.observe(document.body, { childList: true, subtree: true });
        return true;
      } catch(e) { return false; }
    }
    if (!_sfStartObserver()) {
      document.addEventListener('DOMContentLoaded', _sfStartObserver);
      var _sfPollCount = 0;
      var _sfPoll = setInterval(function() {
        _sfPollCount++;
        if (_sfStartObserver() || _sfPollCount > 50) clearInterval(_sfPoll);
      }, 100);
    }
  `;

  return `
    (function() {
      var style = document.createElement('style');
      style.textContent = ${JSON.stringify(css)};
      (document.head || document.documentElement).appendChild(style);
      ${observer}
    })();
  `;
}

/**
 * Heuristic DOM scan — finds overlay elements by CSS properties.
 * Returns array of { index, zIndex, coverage, removed, closeClicked }.
 */
async function scanAndDismissOverlays(page, { zIndexThreshold, closeSelectors, aggressive }) {
  try {
    // Step 1: Detect overlays via page.evaluate
    const detected = await page.evaluate((threshold) => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (vw === 0 || vh === 0) return [];

      const results = [];
      const all = document.querySelectorAll('*');
      for (let i = 0; i < all.length; i++) {
        const el = all[i];
        const s = window.getComputedStyle(el);
        const pos = s.position;
        if (pos !== 'fixed' && pos !== 'absolute') continue;
        const z = parseInt(s.zIndex, 10);
        if (isNaN(z) || z < threshold) continue;
        const rect = el.getBoundingClientRect();
        const coverage = (rect.width * rect.height) / (vw * vh);
        if (coverage < 0.3) continue;
        // WHY: Mark element with data attribute so we can target it from Playwright
        el.setAttribute('data-sf-overlay', String(i));
        results.push({ index: i, zIndex: z, coverage, tagName: el.tagName });
      }
      return results;
    }, zIndexThreshold);

    if (!detected || detected.length === 0) return { overlaysDetected: 0, closeClicked: 0, domRemoved: 0 };

    let closeClicked = 0;
    let domRemoved = 0;

    // Step 2: For each overlay, try close button, then DOM removal
    for (const overlay of detected) {
      if (aggressive) {
        // Aggressive mode: skip close-click, go straight to removal
        try {
          await page.evaluate((idx) => {
            const el = document.querySelector(`[data-sf-overlay="${idx}"]`);
            if (el) el.remove();
          }, overlay.index);
          domRemoved++;
        } catch { /* removal failure — non-fatal */ }
        continue;
      }

      // Moderate mode: try close button first
      let closed = false;
      if (closeSelectors) {
        const selectors = closeSelectors.split(',').map((s) => s.trim()).filter(Boolean);
        for (const sel of selectors) {
          try {
            const containerSel = `[data-sf-overlay="${overlay.index}"]`;
            const closeBtns = await page.locator(`${containerSel} ${sel}`).all();
            for (const btn of closeBtns) {
              // Safety: only click button-like elements
              const attrs = await btn.evaluate((node) => ({
                tagName: node.tagName,
                href: node.getAttribute('href'),
              }));
              if (attrs.tagName === 'A' && attrs.href && !attrs.href.startsWith('#') && !attrs.href.startsWith('javascript:')) {
                continue; // Skip navigation links
              }
              await btn.click({ timeout: 1500 });
              closeClicked++;
              closed = true;
              break;
            }
          } catch { /* click failure — try next selector */ }
          if (closed) break;
        }
      }

      // Fallback: remove from DOM if no close button worked
      if (!closed) {
        try {
          await page.evaluate((idx) => {
            const el = document.querySelector(`[data-sf-overlay="${idx}"]`);
            if (el) el.remove();
          }, overlay.index);
          domRemoved++;
        } catch { /* removal failure — non-fatal */ }
      }
    }

    return { overlaysDetected: detected.length, closeClicked, domRemoved };
  } catch {
    return { overlaysDetected: 0, closeClicked: 0, domRemoved: 0 };
  }
}

export const overlayDismissalPlugin = {
  name: 'overlayDismissal',
  suites: ['init', 'dismiss'],
  hooks: {
    async onInit({ page, settings }) {
      const enabled = settings?.overlayDismissalEnabled !== false
        && settings?.overlayDismissalEnabled !== 'false';
      if (!enabled) return undefined;

      const mode = settings?.overlayDismissalMode || 'moderate';

      try {
        await page.addInitScript(buildInitScript(mode));
      } catch { /* init script failure — non-fatal, afterNavigate still works */ }

      return undefined;
    },

    async onDismiss({ page, settings }) {
      const enabled = settings?.overlayDismissalEnabled !== false
        && settings?.overlayDismissalEnabled !== 'false';
      if (!enabled) {
        return {
          enabled: false, cssInjected: false, overlaysDetected: 0,
          closeClicked: 0, domRemoved: 0, scrollLockReset: false,
          observerCaught: 0, settleMs: 0,
        };
      }

      const mode = settings?.overlayDismissalMode || 'moderate';
      const closeSelectors = String(settings?.overlayDismissalCloseSelectors || '');
      const settleMs = Number(settings?.overlayDismissalSettleMs ?? 800);
      const zIndexThreshold = mode === 'aggressive'
        ? Math.min(Number(settings?.overlayDismissalZIndexThreshold) || 999, 500)
        : (Number(settings?.overlayDismissalZIndexThreshold) || 999);

      // Layer 2: Heuristic DOM scan + dismiss
      const scan = await scanAndDismissOverlays(page, {
        zIndexThreshold,
        closeSelectors,
        aggressive: mode === 'aggressive',
      });

      // Layer 3: Scroll-lock reset
      let scrollLockReset = false;
      try {
        scrollLockReset = await page.evaluate(() => {
          const body = document.body;
          const html = document.documentElement;
          const bodyStyle = window.getComputedStyle(body);
          const htmlStyle = window.getComputedStyle(html);
          const locked = bodyStyle.overflow === 'hidden' || htmlStyle.overflow === 'hidden';
          if (locked) {
            body.style.overflow = 'auto';
            html.style.overflow = 'auto';
          }
          return locked;
        });
      } catch { scrollLockReset = false; }

      // Observer telemetry
      let observerCaught = 0;
      try {
        const guard = await page.evaluate(() => window.__sfOverlayGuard);
        observerCaught = guard?.caught ?? 0;
      } catch { observerCaught = 0; }

      // Settle wait
      if (settleMs > 0) await page.waitForTimeout(settleMs);

      return {
        enabled: true,
        cssInjected: true,
        overlaysDetected: scan.overlaysDetected,
        closeClicked: scan.closeClicked,
        domRemoved: scan.domRemoved,
        scrollLockReset,
        observerCaught,
        settleMs,
      };
    },
  },
};
