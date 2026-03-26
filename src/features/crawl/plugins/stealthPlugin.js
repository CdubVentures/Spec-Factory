/**
 * Stealth plugin — hides webdriver flag and sets realistic browser fingerprint.
 * Hooks into beforeNavigate to inject stealth scripts before page load.
 */

import { STEALTH_INIT_SCRIPT } from '../../../fetcher/stealthProfile.js';

export const STEALTH_PATCHES = ['webdriver', 'plugins', 'languages'];

export const stealthPlugin = {
  name: 'stealth',
  hooks: {
    async beforeNavigate({ page, settings }) {
      const enabled = settings?.stealthEnabled !== false && settings?.stealthEnabled !== 'false';
      if (!enabled) return { enabled: false, patches: [], injected: false };
      await page.addInitScript(STEALTH_INIT_SCRIPT);
      return { enabled: true, patches: STEALTH_PATCHES, injected: true };
    },
  },
};
