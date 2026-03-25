/**
 * CSS Override plugin — force-displays hidden elements via CSS injection.
 * Brute-force fallback when DOM Expansion clicking is too unpredictable.
 * Hooks into onInteract (after domExpansion, before screenshots).
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

export const cssOverridePlugin = {
  name: 'cssOverride',
  hooks: {
    async onInteract({ page, settings }) {
      const enabled = settings?.cssOverrideEnabled === true || settings?.cssOverrideEnabled === 'true';
      if (!enabled) return { enabled: false, hiddenBefore: 0, revealedAfter: 0 };

      const hiddenBefore = await page.evaluate(() => {
        return document.querySelectorAll(
          '[style*="display: none"],[style*="display:none"],[hidden],.hidden,.collapse:not(.show),[aria-hidden="true"]',
        ).length;
      });

      await page.addStyleTag({ content: OVERRIDE_CSS });

      return { enabled: true, hiddenBefore, revealedAfter: hiddenBefore };
    },
  },
};
