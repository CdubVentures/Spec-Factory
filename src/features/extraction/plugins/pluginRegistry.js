// WHY: Registry-driven extraction plugin resolution.
// Adding a new extraction plugin = import + one line here.

import { screenshotExtractionPlugin } from './screenshot/screenshotPlugin.js';

export const EXTRACTION_PLUGIN_REGISTRY = Object.freeze({
  screenshot: screenshotExtractionPlugin,
});

export function resolveExtractionPlugins(names, { logger } = {}) {
  return names.map((name) => {
    const plugin = EXTRACTION_PLUGIN_REGISTRY[name];
    if (!plugin) logger?.warn?.('unknown_extraction_plugin', { name });
    return plugin;
  }).filter(Boolean);
}

export function resolveAllExtractionPlugins() {
  return Object.values(EXTRACTION_PLUGIN_REGISTRY);
}
