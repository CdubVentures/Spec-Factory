/**
 * Cookie Consent plugin — auto-dismisses cookie/privacy consent banners
 * before page interaction using @duckduckgo/autoconsent with fallback selectors.
 * Hooks into afterNavigate (after page load, before scroll/expansion/capture).
 */

import { handleCookieConsent } from 'playwright-autoconsent';

// WHY: Fallback selectors for cookie banners that autoconsent doesn't recognize.
// Shopify's native banner (#shopify-pc__banner) is NOT a standard CMP —
// autoconsent misses it entirely. Shopify accept button has class shopify-pc__banner__btn-accept.
const DEFAULT_FALLBACK_SELECTORS = [
  '#onetrust-accept-btn-handler',
  '.cc-accept',
  '.cc-allow',
  '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
  '[id*="cookie"] button[class*="accept"]',
  '.cmp-accept',
  '.shopify-pc__banner__btn-accept',
  '#shopify-pc__banner button[class*="accept"]',
  '.js-cookie-accept',
  '[data-cookie-accept]',
  'button[class*="cookie-accept"]',
  'button[class*="consent-accept"]',
  // ASUS ROG, generic "Accept all" patterns
  '#cookie-policy-info .btn-ok',
  'button[class*="btn-read-ck"]',
  'button[class*="accept-all"]',
  'button[class*="acceptAll"]',
  // Generic cookie policy containers with misspellings (e.g. madcatz.com "cookirPolicy")
  '[id*="cookir"] button',
  '[id*="cookie-policy"] button',
  '[id*="cookiePolicy"] button',
  // Generic agree/consent buttons inside banner-like containers
  '[class*="cookie"] button[class*="agree"]',
  '[class*="cookie"] button[class*="btn"]',
  '[id*="gdpr"] button[class*="accept"]',
  '[id*="gdpr"] button[class*="allow"]',
  // CookieYes CMP (razer.com, many Shopify stores)
  '.cky-btn-accept',
  'button[class*="cky-btn-accept"]',
  // Osano CMP (steelseries.com)
  '.osano-cm-accept-all',
  'button[class*="osano-cm-accept"]',
  // Generic cookie-banner class with accept button
  '.cookie-banner button[class*="accept"]',
  '.cookie-banner button[class*="btn"]',
  '[class*="cookie-banner"] button:first-of-type',
].join(',');

export function createCookieConsentPlugin({ _consentHandler = handleCookieConsent } = {}) {
  return {
    name: 'cookieConsent',
    suites: ['dismiss'],
    hooks: {
      async onDismiss({ page, settings }) {
        const enabled = settings?.cookieConsentEnabled !== false
          && settings?.cookieConsentEnabled !== 'false';
        if (!enabled) return { enabled: false, autoconsentMatched: false, fallbackClicked: 0, settleMs: 0 };

        // WHY: 200ms fast-fail — autoconsent detects known CMPs instantly via
        // pre-injected content scripts. If it hasn't matched in 200ms, it won't.
        // The old 1s default wasted 800ms per page on Shopify sites where
        // autoconsent never matches (Shopify uses a non-standard banner).
        const timeoutMs = Number(settings?.cookieConsentTimeoutMs) || 200;
        const selectorStr = String(settings?.cookieConsentFallbackSelectors || DEFAULT_FALLBACK_SELECTORS);

        let autoconsentMatched = false;
        let fallbackClicked = 0;

        // WHY: Autoconsent first — handles 95%+ of CMPs via DuckDuckGo's rule engine.
        try {
          const result = await _consentHandler(page, { action: 'optIn', timeout: timeoutMs });
          autoconsentMatched = Boolean(result?.handled);
        } catch {
          autoconsentMatched = false;
        }

        // WHY: Single page.evaluate replaces per-selector page.locator().all() +
        // el.click() round-trips. The old approach did 30+ Playwright IPC calls
        // (each ~50-100ms) totalling 1.5-3s. One evaluate does all DOM work
        // in-browser: querySelectorAll for all selectors, native el.click() on
        // each match. Total: ~20ms.
        if (!autoconsentMatched) {
          try {
            fallbackClicked = await page.evaluate((selStr) => {
              let clicked = 0;
              try {
                const els = document.querySelectorAll(selStr);
                for (const el of els) {
                  try { el.click(); clicked++; } catch { /* not clickable */ }
                }
              } catch { /* invalid selector — skip */ }
              return clicked;
            }, selectorStr);
          } catch {
            fallbackClicked = 0;
          }
        }

        return { enabled: true, autoconsentMatched, fallbackClicked, settleMs: 0 };
      },
    },
  };
}

export const cookieConsentPlugin = createCookieConsentPlugin();
