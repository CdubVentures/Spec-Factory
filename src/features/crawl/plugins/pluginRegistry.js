// WHY: Registry-driven plugin resolution for FETCH tools (sequential).
// Screenshot moved to extraction plugin system (concurrent).
// Adding a new fetch plugin = import + one line here.

import { stealthPlugin } from './stealthPlugin.js';
import { cookieConsentPlugin } from './cookieConsentPlugin.js';
import { autoScrollPlugin } from './autoScrollPlugin.js';
import { domExpansionPlugin } from './domExpansionPlugin.js';
import { cssOverridePlugin } from './cssOverridePlugin.js';

export const PLUGIN_REGISTRY = Object.freeze({
  stealth: stealthPlugin,
  cookieConsent: cookieConsentPlugin,
  autoScroll: autoScrollPlugin,
  domExpansion: domExpansionPlugin,
  cssOverride: cssOverridePlugin,
});

export function resolvePlugins(names, { logger } = {}) {
  return names.map((name) => {
    const plugin = PLUGIN_REGISTRY[name];
    if (!plugin) logger?.warn?.('unknown_crawl_plugin', { name });
    return plugin;
  }).filter(Boolean);
}

export function resolveAllPlugins() {
  return Object.values(PLUGIN_REGISTRY);
}
