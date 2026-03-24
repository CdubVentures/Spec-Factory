// WHY: Registry-driven plugin resolution. Adding a new plugin = import + one line here.

import { stealthPlugin } from './stealthPlugin.js';
import { autoScrollPlugin } from './autoScrollPlugin.js';
import { screenshotPlugin } from './screenshotPlugin.js';

export const PLUGIN_REGISTRY = Object.freeze({
  stealth: stealthPlugin,
  autoScroll: autoScrollPlugin,
  screenshot: screenshotPlugin,
});

export function resolvePlugins(names, { logger } = {}) {
  return names.map((name) => {
    const plugin = PLUGIN_REGISTRY[name];
    if (!plugin) logger?.warn?.('unknown_crawl_plugin', { name });
    return plugin;
  }).filter(Boolean);
}
