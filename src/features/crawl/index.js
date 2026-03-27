// WHY: Public API barrel for cross-feature access.
// Other features and the pipeline layer import from here — never from internals.

export { createCrawlSession } from './crawlSession.js';
export { resolvePlugins, resolveAllPlugins, PLUGIN_REGISTRY } from './plugins/pluginRegistry.js';
export { classifyBlockStatus } from './bypassStrategies.js';
