// WHY: Public API barrel for extraction feature.
// Pipeline layer imports from here — never from internals.

export { createExtractionRunner } from './core/extractionRunner.js';
export { resolveExtractionPlugins, resolveAllExtractionPlugins, resolvePluginsByPhase, EXTRACTION_PLUGIN_REGISTRY } from './plugins/pluginRegistry.js';
export { captureScreenshots } from './plugins/screenshot/screenshotCapture.js';
