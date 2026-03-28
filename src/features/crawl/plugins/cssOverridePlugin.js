/**
 * CSS Override plugin — force-displays hidden elements, removes fixed/sticky elements,
 * and blocks third-party widget domains via route interception.
 *
 * Hooks:
 *   beforeNavigate — sets up page.route() to block widget domains (returns undefined to suppress telemetry)
 *   onInteract — injects CSS overrides for hidden + fixed/sticky elements
 */

const HIDDEN_SELECTOR = '[style*="display: none"],[style*="display:none"],[hidden],.hidden,.collapse:not(.show),[aria-hidden="true"]';

const OVERRIDE_CSS = `
  ${HIDDEN_SELECTOR} {
    display: block !important;
    visibility: visible !important;
    opacity: 1 !important;
    height: auto !important;
    max-height: none !important;
    overflow: visible !important;
  }
`;

export const FIXED_STICKY_CSS = `
  [style*="position: fixed"], [style*="position:fixed"],
  [style*="position: sticky"], [style*="position:sticky"] {
    visibility: hidden !important;
    position: absolute !important;
  }
`;


function parseDomains(raw) {
  return String(raw ?? '').split(',').map((d) => d.trim().toLowerCase()).filter(Boolean);
}

export const cssOverridePlugin = {
  name: 'cssOverride',
  suites: ['init', 'dismiss'],
  hooks: {
    async onInit({ page, settings }) {
      const enabled = settings?.cssOverrideEnabled === true || settings?.cssOverrideEnabled === 'true';
      if (!enabled) return undefined;

      const domains = parseDomains(settings?.cssOverrideBlockedDomains);
      if (domains.length === 0) return undefined;

      await page.route('**', (route, request) => {
        const url = request.url().toLowerCase();
        if (domains.some((d) => url.includes(d))) {
          return route.abort();
        }
        return route.continue();
      });

      // WHY: return undefined to suppress plugin_hook_completed telemetry.
      // Domain blocking status is reported in onInteract via domainBlockingEnabled.
      return undefined;
    },

    async onDismiss({ page, settings }) {
      const enabled = settings?.cssOverrideEnabled === true || settings?.cssOverrideEnabled === 'true';
      const domainBlockingEnabled = Boolean(String(settings?.cssOverrideBlockedDomains ?? '').trim());

      if (!enabled) {
        return { enabled: false, hiddenBefore: 0, revealedAfter: 0, fixedRemoved: false, domainBlockingEnabled: false };
      }

      const hiddenBefore = await page.evaluate(() => {
        return document.querySelectorAll(
          '[style*="display: none"],[style*="display:none"],[hidden],.hidden,.collapse:not(.show),[aria-hidden="true"]',
        ).length;
      });

      await page.addStyleTag({ content: OVERRIDE_CSS });

      const removeFixed = settings?.cssOverrideRemoveFixed === true || settings?.cssOverrideRemoveFixed === 'true';
      if (removeFixed) {
        await page.addStyleTag({ content: FIXED_STICKY_CSS });
      }

      return { enabled: true, hiddenBefore, revealedAfter: hiddenBefore, fixedRemoved: removeFixed, domainBlockingEnabled };
    },
  },
};
