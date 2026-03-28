/**
 * Overlay Dismissal plugin — detects and dismisses non-cookie popups before
 * page capture: newsletter signups, chat widgets, paywall overlays, age gates,
 * exit-intent modals, "disable adblock" notices, and scroll-locked body states.
 *
 * 2-layer approach:
 *   Layer 1 (onInit): CSS suppression + MutationObserver guard via addInitScript
 *   Layer 2 (onDismiss): Single page.evaluate — scan, close-click, DOM removal,
 *           scroll-lock reset, and observer telemetry in ONE in-browser call.
 *
 * Runs AFTER cookieConsent (no duplication) but BEFORE autoScroll/domExpansion.
 */

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
  [class*="locale-popup"],[class*="country-selector-popup"],[class*="geo-redirect"],
  #onetrust-banner-sdk,.cky-consent-container,.osano-cm-window,
  [class*="cookie-banner"],[id*="cookie-consent"],[class*="consent-banner"] {
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
  // Exposes window.__sfOverlayGuard for telemetry queries from onDismiss.
  //
  // CRITICAL: Init scripts must be lightweight. The old observer called
  // getComputedStyle() + getBoundingClientRect() on EVERY added DOM node.
  // On Shopify pages (hundreds of dynamic nodes during hydration), this
  // triggered continuous layout reflows that locked the main thread for 30s+,
  // causing page.content() to timeout ("page.content: Timeout 30000ms exceeded").
  //
  // Fix: check inline style strings only (zero reflow). Overlays where
  // position/z-index are set via CSS classes are already handled by the
  // SUPPRESSION_CSS rules. The onDismiss evaluate does the thorough
  // getComputedStyle scan once when called.
  const observer = `
    window.__sfOverlayGuard = { caught: 0 };
    function _sfCheckOverlay(node) {
      try {
        if (node.nodeType !== 1) return;
        var s = node.getAttribute('style') || '';
        if (s.indexOf('position') === -1) return;
        if (s.indexOf('fixed') === -1 && s.indexOf('absolute') === -1) return;
        var zMatch = s.match(/z-index\\s*:\\s*(\\d+)/);
        if (!zMatch || parseInt(zMatch[1], 10) < 900) return;
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
      } catch { /* init script failure — non-fatal, onDismiss still works */ }

      return undefined;
    },

    // WHY: Single page.evaluate replaces the old 3-evaluate + N-locator/click
    // approach. The old code did: (1) evaluate to detect overlays, (2) per-overlay
    // page.locator().all() + btn.click({ timeout: 1500 }) round-trips, (3) evaluate
    // for scroll-lock reset, (4) evaluate for observer telemetry. On Shopify pages
    // with thousands of DOM nodes, this consumed 3-10s of handler timeout budget.
    // Now: one evaluate does all DOM work in-browser — scan, close-click, removal,
    // scroll-lock, and observer read. Total: ~20-50ms.
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
      const zIndexThreshold = mode === 'aggressive'
        ? Math.min(Number(settings?.overlayDismissalZIndexThreshold) || 999, 500)
        : (Number(settings?.overlayDismissalZIndexThreshold) || 999);

      let result;
      try {
        result = await page.evaluate(({ threshold, closeSels, aggressive }) => {
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          const out = {
            overlaysDetected: 0, closeClicked: 0, domRemoved: 0,
            scrollLockReset: false, observerCaught: 0,
          };

          // --- Layer 2: Heuristic overlay scan + dismiss ---
          if (vw > 0 && vh > 0) {
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

              out.overlaysDetected++;

              if (aggressive) {
                try { el.remove(); out.domRemoved++; } catch {}
                continue;
              }

              // Moderate: try close button first, then DOM removal
              let closed = false;
              if (closeSels) {
                const selectors = closeSels.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
                for (const sel of selectors) {
                  try {
                    const btn = el.querySelector(sel);
                    if (!btn) continue;
                    // Safety: skip navigation links
                    const tag = btn.tagName.toUpperCase();
                    const href = btn.getAttribute('href');
                    if (tag === 'A' && href && !href.startsWith('#') && !href.startsWith('javascript:')) continue;
                    btn.click();
                    out.closeClicked++;
                    closed = true;
                    break;
                  } catch {}
                }
              }
              if (!closed) {
                try { el.remove(); out.domRemoved++; } catch {}
              }
            }
          }

          // --- Layer 3: Scroll-lock reset ---
          try {
            const body = document.body;
            const html = document.documentElement;
            const bodyOverflow = window.getComputedStyle(body).overflow;
            const htmlOverflow = window.getComputedStyle(html).overflow;
            if (bodyOverflow === 'hidden' || htmlOverflow === 'hidden') {
              body.style.overflow = 'auto';
              html.style.overflow = 'auto';
              out.scrollLockReset = true;
            }
          } catch {}

          // --- Observer telemetry ---
          try {
            out.observerCaught = (window.__sfOverlayGuard && window.__sfOverlayGuard.caught) || 0;
          } catch {}

          return out;
        }, { threshold: zIndexThreshold, closeSels: closeSelectors, aggressive: mode === 'aggressive' });
      } catch {
        result = { overlaysDetected: 0, closeClicked: 0, domRemoved: 0, scrollLockReset: false, observerCaught: 0 };
      }

      return {
        enabled: true,
        cssInjected: true,
        overlaysDetected: result.overlaysDetected,
        closeClicked: result.closeClicked,
        domRemoved: result.domRemoved,
        scrollLockReset: result.scrollLockReset,
        observerCaught: result.observerCaught,
        settleMs: 0,
      };
    },
  },
};
