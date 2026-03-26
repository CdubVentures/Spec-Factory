/**
 * Cookie Consent plugin — auto-dismisses cookie/privacy consent banners
 * before page interaction using @duckduckgo/autoconsent with fallback selectors.
 * Hooks into afterNavigate (after page load, before scroll/expansion/capture).
 */

import { handleCookieConsent } from 'playwright-autoconsent';

const DEFAULT_FALLBACK_SELECTORS = [
  '#onetrust-accept-btn-handler',
  '.cc-accept',
  '.cc-allow',
  '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
  '[id*="cookie"] button[class*="accept"]',
  '.cmp-accept',
].join(',');

export function createCookieConsentPlugin({ _consentHandler = handleCookieConsent } = {}) {
  return {
    name: 'cookieConsent',
    hooks: {
      async afterNavigate({ page, settings }) {
        const enabled = settings?.cookieConsentEnabled !== false
          && settings?.cookieConsentEnabled !== 'false';
        if (!enabled) return { enabled: false, autoconsentMatched: false, fallbackClicked: 0, settleMs: 0 };

        const timeoutMs = Number(settings?.cookieConsentTimeoutMs) || 5000;
        const selectorStr = String(settings?.cookieConsentFallbackSelectors || DEFAULT_FALLBACK_SELECTORS);
        const selectors = selectorStr.split(',').map((s) => s.trim()).filter(Boolean);
        const settleMs = Number(settings?.cookieConsentSettleMs ?? 1000);

        let autoconsentMatched = false;
        let fallbackClicked = 0;

        // WHY: Autoconsent first — handles 95%+ of CMPs via DuckDuckGo's rule engine.
        try {
          const result = await _consentHandler(page, { action: 'optIn', timeout: timeoutMs });
          autoconsentMatched = Boolean(result?.handled);
        } catch {
          autoconsentMatched = false;
        }

        // WHY: Fallback selectors only when autoconsent finds no CMP.
        if (!autoconsentMatched) {
          for (const selector of selectors) {
            const elements = await page.locator(selector).all();
            for (const el of elements) {
              try {
                await el.click({ timeout: 2000 });
                fallbackClicked++;
              } catch { /* element may not be clickable — skip */ }
            }
          }
        }

        if (settleMs > 0) await page.waitForTimeout(settleMs);

        return { enabled: true, autoconsentMatched, fallbackClicked, settleMs };
      },
    },
  };
}

export const cookieConsentPlugin = createCookieConsentPlugin();
